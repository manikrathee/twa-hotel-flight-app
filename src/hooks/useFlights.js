import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { fetchFlights, fetchCachedFlights } from '../api/opensky'
import {
  fetchFallbackFlights,
  getFallbackFeedLabel,
  getFallbackFeedPrimaryRetryMs,
  isFallbackFeedEnabled,
} from '../api/fallbackFeed'
import { fetchCallsignRoute } from '../api/adsbdb'
import { isBlocked, backoffRemainingMs } from '../api/rateLimitManager'
import { distanceKm } from '../utils/geo'
import { buildPositionedSamples } from '../utils/flightSamples'
import { flightCache } from '../cache/flightCache'
import {
  chooseFreshestFeedCache,
  persistFeedSnapshot,
  readFeedSnapshot,
} from '../cache/feedSnapshotCache'
import { recordFlightSamples } from '../db/flightHistoryDb'
import {
  JFK,
  bboxAround,
  MAP_RADIUS_MI,
  routeTouchesJfk,
} from '../config/airspace'

const BASE_POLL_MS          = 15_000
const BASE_POLL_ANON_MS     = 30_000
const SELECTED_POLL_AUTH_MS = 2_500
const SELECTED_POLL_ANON_MS = 5_000
const CONSTRAINED_POLL_AUTH_MS = 40_000
const CONSTRAINED_POLL_ANON_MS = 55_000
const CONSTRAINED_SELECTED_POLL_MS = 12_000
const STALE_SHOW_MS         = 90_000  // show stale badge after 90s without a fresh update
const HAS_OPENSKY_AUTH      = import.meta.env.VITE_OPENSKY_AUTH_ENABLED === 'true'
const ROUTE_TTL_MS          = 20 * 60 * 1000
const JURISDICTION_ROUTE_FILTER_RADIUS_KM = 130
const SEARCH_RADIUS_MIN_MI = 6
const SEARCH_RADIUS_MAX_MI = 140
const SEARCH_RADIUS_DEFAULT_MI = MAP_RADIUS_MI
const SEARCH_RADIUS_DEFAULT_KM = SEARCH_RADIUS_DEFAULT_MI / 0.621371
const EXTRAPOLATION_TICK_MS  = 90
const EXTRAPOLATED_AGE_LIMIT = 60
const COLLISION_DISTANCE_KM = 0.08
const COLLISION_ALT_CEILING_M = 80
const CONSTRAINED_FLIGHT_LIMIT = 30
const CONSTRAINED_ROUTE_LOOKUP_LIMIT = 24
const HIGH_DENSITY_FLIGHT_THRESHOLD = 120
const SLOW_CONN_TYPES = new Set(['slow-2g', '2g'])
const FALLBACK_MODE = 'fallback'
const FEED_RATE_LIMIT_BUCKET = 'feed'
const POSITION_RECOVERY_TTL_MS = 6 * 60 * 1000
const CONSTRAINED_ROUTE_LOOKUP_LIMIT_NETWORK = 8

const routeCache = new Map()
const inFlightRouteLookup = new Map()

function sameFlightSnapshot(left, right) {
  return (
    left.icao24 === right.icao24 &&
    left.callsign === right.callsign &&
    left.latitude === right.latitude &&
    left.longitude === right.longitude &&
    left.baro_altitude === right.baro_altitude &&
    left.velocity === right.velocity &&
    left.vertical_rate === right.vertical_rate &&
    left.heading === right.heading &&
    left.geo_altitude === right.geo_altitude &&
    left.category === right.category &&
    left.distKm === right.distKm &&
    left.squawk === right.squawk &&
    left.spi === right.spi &&
    left.position_source === right.position_source &&
    left.last_contact === right.last_contact &&
    left.time_position === right.time_position &&
    left.origin_country === right.origin_country &&
    left.on_ground === right.on_ground
  )
}

function hasFlightsChanged(prev, next) {
  if (prev.length !== next.length) return true
  for (let i = 0; i < next.length; i += 1) {
    if (!sameFlightSnapshot(prev[i], next[i])) return true
  }
  return false
}

function normalizeCallsign(callsign) {
  return String(callsign || '').trim().toUpperCase()
}

function normalizeFlightId(value) {
  return String(value || '').trim().toLowerCase()
}

function getCachedRoute(callsign) {
  const entry = routeCache.get(callsign)
  if (!entry) return undefined
  if (Date.now() - entry.ts > ROUTE_TTL_MS) {
    routeCache.delete(callsign)
    return undefined
  }
  return entry.route
}

function setCachedRoute(callsign, route) {
  routeCache.set(callsign, { route: route ?? null, ts: Date.now() })
}

function isConnectionConstrained() {
  if (typeof navigator === 'undefined') return false
  const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection
  if (!conn) return false
  if (typeof conn.type === 'string' && conn.type === 'cellular') return true
  if (typeof conn.effectiveType === 'string' && SLOW_CONN_TYPES.has(conn.effectiveType)) return true
  if (typeof conn.downlink === 'number' && conn.downlink > 0 && conn.downlink < 1.25) return true
  if (typeof conn.rtt === 'number' && conn.rtt > 900) return true
  return false
}

function flightFreshnessMs(flight) {
  return Math.max(flight.time_position || 0, flight.last_contact || 0) * 1000
}

function isCollisionCandidate(a, b) {
  if (!a || !b) return false
  const distKm = distanceKm(a.latitude, a.longitude, b.latitude, b.longitude)
  if (distKm > COLLISION_DISTANCE_KM) return false

  const aAlt = a.baro_altitude ?? a.geo_altitude
  const bAlt = b.baro_altitude ?? b.geo_altitude
  if (Number.isFinite(aAlt) && Number.isFinite(bAlt) && Math.abs(aAlt - bAlt) > COLLISION_ALT_CEILING_M) return false

  return true
}

function dedupeAndValidateFlights(list) {
  if (!list.length) return []

  const byIcao = new Map()
  for (const flight of list) {
    const id = flight.icao24
    if (!id) continue
    const existing = byIcao.get(id)
    if (!existing || flightFreshnessMs(flight) > flightFreshnessMs(existing)) byIcao.set(id, flight)
  }

  const deduped = Array.from(byIcao.values())
  const ordered = deduped.sort((a, b) => flightFreshnessMs(b) - flightFreshnessMs(a))

  const cleaned = []
  for (const flight of ordered) {
    let replaced = false

    const collisionIndex = cleaned.findIndex(existing => isCollisionCandidate(flight, existing))
    if (collisionIndex >= 0) {
      const existing = cleaned[collisionIndex]
      if (flightFreshnessMs(flight) > flightFreshnessMs(existing)) {
        cleaned[collisionIndex] = flight
      }
      replaced = true
    }

    if (!replaced) cleaned.push(flight)
  }

  return cleaned.sort((a, b) => a.distKm - b.distKm)
}

function extrapolatePoint(flight, nowMs) {
  const lat = flight.latitude
  const lon = flight.longitude
  if (lat == null || lon == null) return flight

  const baseSeconds = flight.time_position || flight.last_contact
  if (!baseSeconds) return flight

  const age = nowMs / 1000 - baseSeconds
  if (age <= 0 || age > EXTRAPOLATED_AGE_LIMIT) return flight

  const speed = Number(flight.velocity)
  if (!Number.isFinite(speed) || speed <= 0) return flight

  const heading = Number(flight.heading) || 0
  const meters = speed * age
  const headingRad = (heading * Math.PI) / 180
  const latScale = 111_132
  const lonScale = Math.max(1, 111_320 * Math.cos((lat * Math.PI) / 180))
  const nextLat = lat + (Math.cos(headingRad) * meters) / latScale
  const nextLon = lon + (Math.sin(headingRad) * meters) / lonScale

  const vr = Number(flight.vertical_rate)
  const nextAlt = Number.isFinite(vr)
    ? flight.baro_altitude + vr * age
    : flight.baro_altitude

  return {
    ...flight,
    latitude: nextLat,
    longitude: nextLon,
    baro_altitude: Number.isFinite(nextAlt) ? nextAlt : flight.baro_altitude,
  }
}

function normalizeHeadingValue(value) {
  if (!Number.isFinite(value)) return null
  return ((value % 360) + 360) % 360
}

function blendNumber(prev, next, factor) {
  if (!Number.isFinite(prev)) return next
  if (!Number.isFinite(next)) return prev
  return prev + ((next - prev) * factor)
}

function blendHeading(prev, next, factor) {
  const previous = normalizeHeadingValue(prev)
  const target = normalizeHeadingValue(next)
  if (!Number.isFinite(previous)) return target
  if (!Number.isFinite(target)) return previous
  const delta = ((target - previous + 540) % 360) - 180
  return normalizeHeadingValue(previous + (delta * factor))
}

function resolveRenderedPositionFactor(gapKm) {
  if (!Number.isFinite(gapKm)) return 1
  if (gapKm > 6) return 0.025
  if (gapKm > 3) return 0.04
  if (gapKm > 1.4) return 0.08
  if (gapKm > 0.45) return 0.14
  return 0.22
}

function renderFlightFrame(currentFlight, targetFlight, nowMs) {
  const target = extrapolatePoint(targetFlight, nowMs)
  if (!currentFlight) return target

  const currentLat = Number(currentFlight.latitude)
  const currentLon = Number(currentFlight.longitude)
  const targetLat = Number(target.latitude)
  const targetLon = Number(target.longitude)
  const gapKm = (
    Number.isFinite(currentLat) &&
    Number.isFinite(currentLon) &&
    Number.isFinite(targetLat) &&
    Number.isFinite(targetLon)
  )
    ? distanceKm(currentLat, currentLon, targetLat, targetLon)
    : Infinity

  const positionFactor = resolveRenderedPositionFactor(gapKm)
  const telemetryFactor = Math.min(0.34, positionFactor + 0.08)
  const headingFactor = Math.max(0.14, Math.min(0.26, positionFactor + 0.06))

  return {
    ...target,
    latitude: blendNumber(currentLat, targetLat, positionFactor),
    longitude: blendNumber(currentLon, targetLon, positionFactor),
    baro_altitude: blendNumber(currentFlight.baro_altitude, target.baro_altitude, telemetryFactor),
    geo_altitude: blendNumber(currentFlight.geo_altitude, target.geo_altitude, telemetryFactor),
    velocity: blendNumber(currentFlight.velocity, target.velocity, telemetryFactor),
    vertical_rate: blendNumber(currentFlight.vertical_rate, target.vertical_rate, telemetryFactor),
    heading: blendHeading(currentFlight.heading, target.heading, headingFactor),
  }
}

function renderFlightFrameList(displayedFlights, targetFlights, nowMs) {
  const currentById = new Map(
    (displayedFlights || [])
      .map(flight => [normalizeFlightId(flight?.icao24), flight])
      .filter(([icao24]) => !!icao24),
  )

  return (targetFlights || []).map((targetFlight) => {
    const icao24 = normalizeFlightId(targetFlight?.icao24)
    const currentFlight = currentById.get(icao24)
    return renderFlightFrame(currentFlight, targetFlight, nowMs)
  })
}

function evictRouteCache() {
  const now = Date.now()
  for (const [callsign, entry] of routeCache) {
    if (now - entry.ts > ROUTE_TTL_MS) routeCache.delete(callsign)
  }
}

function normalizeSearchCenter(center) {
  const lat = Number(center?.lat)
  const lon = Number(center?.lon)
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null

  return {
    lat,
    lon,
  }
}

function normalizeSearchRadiusMi(value) {
  const radius = Number(value)
  if (!Number.isFinite(radius)) return SEARCH_RADIUS_DEFAULT_MI
  return Math.max(SEARCH_RADIUS_MIN_MI, Math.min(SEARCH_RADIUS_MAX_MI, radius))
}

function shouldApplyJfkRouteFilter(center = JFK) {
  const normalized = normalizeSearchCenter(center)
  if (!normalized) return false
  return distanceKm(JFK.lat, JFK.lon, normalized.lat, normalized.lon) <= JURISDICTION_ROUTE_FILTER_RADIUS_KM
}

async function recoverVisibleFlights(raw, enrichOptions) {
  const samples = buildPositionedSamples(raw || [])
  if (!samples.length) return { flights: [], samples }

  let flights = await enrichFlights(raw, {
    constrained: true,
    ...enrichOptions,
  })

  if (flights.length === 0) {
    flights = await enrichFlights(raw, {
      constrained: false,
      ...enrichOptions,
      skipRouteFilter: true,
    })
  }

  if (flights.length === 0) {
    flights = await enrichFlights(raw, {
      constrained: false,
      ...enrichOptions,
      skipHotelFilter: true,
      skipRouteFilter: true,
    })
  }

  return { flights, samples }
}

async function resolveRoute(callsign, options = {}) {
  const { allowNetwork = true } = options
  const key = normalizeCallsign(callsign)
  if (!key) return null

  const cached = getCachedRoute(key)
  if (cached !== undefined) return cached
  if (!allowNetwork) return null

  const pending = inFlightRouteLookup.get(key)
  if (pending) return pending

  const request = fetchCallsignRoute(key)
    .then(route => {
      setCachedRoute(key, route)
      return route ?? null
    })
    .catch(() => {
      setCachedRoute(key, null)
      return null
    })
    .finally(() => {
      inFlightRouteLookup.delete(key)
    })

  inFlightRouteLookup.set(key, request)
  return request
}

async function enrichFlights(raw, options = {}) {
  const {
    skipHotelFilter = false,
    skipRouteFilter = false,
    constrained = false,
    networkConstrained = false,
    spatialCenter = JFK,
    spatialRadiusKm = SEARCH_RADIUS_DEFAULT_KM,
    routeFilterEnabled = false,
  } = options

  const center = normalizeSearchCenter(spatialCenter) || JFK
  const candidates = buildPositionedSamples(raw)
    .map(flight => {
      const distKm = distanceKm(center.lat, center.lon, flight.latitude, flight.longitude)
      if (skipHotelFilter) return { ...flight, distKm }
      if (Number.isFinite(spatialRadiusKm) && distKm > spatialRadiusKm) return null

      return { ...flight, distKm }
    })
    .filter(Boolean)
    .sort((a, b) => a.distKm - b.distKm)

  if (!candidates.length) return []

  const routeWindowLimit = networkConstrained
    ? CONSTRAINED_ROUTE_LOOKUP_LIMIT_NETWORK
    : CONSTRAINED_ROUTE_LOOKUP_LIMIT
  const routeWindow = constrained
    ? candidates.slice(0, routeWindowLimit)
    : candidates

  const callsigns = [...new Set(
    routeWindow
      .map(f => normalizeCallsign(f.callsign))
      .filter(Boolean)
  )]

  const routePairs = await Promise.all(
    callsigns.map(async callsign => [callsign, await resolveRoute(callsign, { allowNetwork: !networkConstrained })])
  )
  const routeByCallsign = new Map(routePairs)

  const ranked = routeWindow
    .filter(f => {
      if (skipRouteFilter || !routeFilterEnabled) return true
      const callsign = normalizeCallsign(f.callsign)
      if (!callsign) return true
      const route = routeByCallsign.get(callsign)
      if (!route) return true
      return routeTouchesJfk(route)
    })

  const validatedRanked = dedupeAndValidateFlights(ranked)
  if (!constrained) return validatedRanked

  const prioritized = [...validatedRanked]
  if (prioritized.length >= CONSTRAINED_FLIGHT_LIMIT) return prioritized.slice(0, CONSTRAINED_FLIGHT_LIMIT)

  for (let i = CONSTRAINED_ROUTE_LOOKUP_LIMIT; i < candidates.length && prioritized.length < CONSTRAINED_FLIGHT_LIMIT; i += 1) {
    const candidate = candidates[i]
    if (!candidate) continue
    if (!prioritized.some(f => f.icao24 === candidate.icao24)) prioritized.push(candidate)
  }

  return dedupeAndValidateFlights(prioritized)
}

function mergeFlightWithRecoveredPosition(rawFlight, recentFlight, nowMs = Date.now()) {
  if (!rawFlight || !recentFlight) return rawFlight
  const recentLat = Number(recentFlight.latitude)
  const recentLon = Number(recentFlight.longitude)
  if (!Number.isFinite(recentLat) || !Number.isFinite(recentLon)) return rawFlight

  const recentTsMs = flightFreshnessMs(recentFlight)
  if (!Number.isFinite(recentTsMs) || (nowMs - recentTsMs) > POSITION_RECOVERY_TTL_MS) return rawFlight

  const nextLat = Number(rawFlight.latitude)
  const nextLon = Number(rawFlight.longitude)

  return {
    ...rawFlight,
    latitude: Number.isFinite(nextLat) ? nextLat : recentLat,
    longitude: Number.isFinite(nextLon) ? nextLon : recentLon,
    baro_altitude: rawFlight.baro_altitude ?? recentFlight.baro_altitude ?? recentFlight.geo_altitude ?? null,
    geo_altitude: rawFlight.geo_altitude ?? recentFlight.geo_altitude ?? recentFlight.baro_altitude ?? null,
    velocity: rawFlight.velocity ?? recentFlight.velocity ?? null,
    heading: rawFlight.heading ?? recentFlight.heading ?? null,
    vertical_rate: rawFlight.vertical_rate ?? recentFlight.vertical_rate ?? null,
    time_position: rawFlight.time_position ?? recentFlight.time_position ?? null,
    last_contact: rawFlight.last_contact ?? recentFlight.last_contact ?? null,
    sampleKind: Number.isFinite(nextLat) && Number.isFinite(nextLon) ? (rawFlight.sampleKind || 'snapshot') : 'recovered',
  }
}

function hydrateSparseFlights(rawFlights = [], recentFlights = []) {
  if (!Array.isArray(rawFlights) || rawFlights.length === 0) return []
  if (!Array.isArray(recentFlights) || recentFlights.length === 0) return rawFlights

  const recentByIcao = new Map(
    recentFlights
      .map(flight => [normalizeFlightId(flight?.icao24), flight])
      .filter(([icao24]) => !!icao24),
  )

  return rawFlights.map((flight) => {
    const nextLat = Number(flight?.latitude)
    const nextLon = Number(flight?.longitude)
    const needsRecovery = !Number.isFinite(nextLat) || !Number.isFinite(nextLon)
    if (!needsRecovery) return flight

    const recentFlight = recentByIcao.get(normalizeFlightId(flight?.icao24))
    return mergeFlightWithRecoveredPosition(flight, recentFlight)
  })
}

export default function useFlights(selectedIcao = null, options = {}) {
  const {
    searchCenter,
    searchRadiusMi,
    applyJfkRouteFilter = false,
  } = options

  const center = normalizeSearchCenter(searchCenter) || JFK
  const radiusMi = normalizeSearchRadiusMi(searchRadiusMi)
  const radiusKm = radiusMi / 0.621371
  const spatialBbox = bboxAround(center, radiusMi)
  const routeFilterEnabled = applyJfkRouteFilter && shouldApplyJfkRouteFilter(center)
  const authConfigured = HAS_OPENSKY_AUTH
  const connectionConstrained = isConnectionConstrained()

  const selectedPollMs = connectionConstrained
    ? CONSTRAINED_SELECTED_POLL_MS
    : (authConfigured ? SELECTED_POLL_AUTH_MS : SELECTED_POLL_ANON_MS)
  const pollMs = selectedIcao
    ? selectedPollMs
    : (connectionConstrained
      ? (authConfigured ? CONSTRAINED_POLL_AUTH_MS : CONSTRAINED_POLL_ANON_MS)
      : (authConfigured ? BASE_POLL_MS : BASE_POLL_ANON_MS))
  const fallbackAvailable = isFallbackFeedEnabled()
  const enrichOptions = useMemo(() => ({
    spatialCenter: center,
    spatialRadiusKm: radiusKm,
    routeFilterEnabled,
    networkConstrained: connectionConstrained,
  }), [center, radiusKm, routeFilterEnabled, connectionConstrained])

  const [flights, setFlights]               = useState([])
  const [loading, setLoading]               = useState(true)
  const [error, setError]                   = useState(null)
  const [lastUpdated, setLastUpdated]       = useState(null)
  const [rateLimitStatus, setRateLimitStatus] = useState('ok')   // 'ok' | 'blocked'
  const [backoffUntil, setBackoffUntil]     = useState(null)
  const [isStale, setIsStale]               = useState(false)
  const [dataSource, setDataSource]         = useState(null)     // null | { type: 'live' } | { type: 'cache', cachedAt, cacheSource?: 'live'|'mock' }
  const [isConstrained, setIsConstrained]   = useState(false)

  const timerRef   = useRef(null)
  const mountedRef = useRef(true)
  const loadRef    = useRef(null)
  const flightsRef = useRef([])
  const latestRef = useRef([])
  const extrapolationRef = useRef(null)
  const loadInFlightRef = useRef(false)
  const fallbackProbeAtRef = useRef(0)

  const scheduleNext = useCallback((delayMs) => {
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => { loadRef.current?.() }, delayMs)
  }, [])

  const applyRecoveredState = useCallback(async (payload, metadata = {}, message = null) => {
    const recovered = await recoverVisibleFlights(payload?.flights || [], enrichOptions)
    if (!recovered.samples.length && !recovered.flights.length) return false

    const cachedAtMs = payload?.cachedAt instanceof Date
      ? payload.cachedAt.getTime()
      : Number(payload?.cachedAtMs) || Date.now()

    if (recovered.samples.length) {
      await recordFlightSamples(recovered.samples, cachedAtMs)
    }

    if (!mountedRef.current) return true

    latestRef.current = recovered.flights
    if (hasFlightsChanged(flightsRef.current, recovered.flights)) {
      setFlights(recovered.flights)
      flightsRef.current = recovered.flights
    } else {
      flightsRef.current = recovered.flights
    }

    setDataSource({
      type: 'cache',
      cachedAt: new Date(cachedAtMs),
      cacheSource: metadata.cacheSource,
      snapshotSource: metadata.snapshotSource,
      authConfigured,
    })
    setError(message)
    setIsConstrained(true)

    if (Array.isArray(payload?.flights) && payload.flights.length > 0 && metadata.cacheSource !== 'mock') {
      persistFeedSnapshot(payload.flights, {
        center,
        radiusMi,
        source: metadata.snapshotSource || metadata.cacheSource || 'cache',
        fetchedAtMs: cachedAtMs,
      })
    }

    return true
  }, [authConfigured, center, enrichOptions, radiusMi])

  const recoverFromCache = useCallback(async (message = null) => {
    const snapshot = readFeedSnapshot({ center, radiusMi })
    const cached = await fetchCachedFlights()
    const preferred = chooseFreshestFeedCache([snapshot, cached])
    if (!preferred) return false

    const fallbackMessage = message || (preferred.cacheSource === 'mock'
      ? 'No live traffic in this area - showing simulation'
      : null)

    return applyRecoveredState(preferred, {
      cacheSource: preferred.cacheSource,
      snapshotSource: preferred.snapshotSource || (preferred.cacheSource === 'mock' ? 'mock' : 'cache'),
    }, fallbackMessage)
  }, [applyRecoveredState, center, radiusMi])

  const shouldProbePrimary = useCallback(() => {
    if (!fallbackAvailable) return true
    return !isBlocked(FEED_RATE_LIMIT_BUCKET) && Date.now() >= fallbackProbeAtRef.current
  }, [fallbackAvailable])

  const load = useCallback(async () => {
    if (!mountedRef.current) return
    if (loadInFlightRef.current) return

    loadInFlightRef.current = true
    try {
    const networkBlocked = isBlocked(FEED_RATE_LIMIT_BUCKET)
    const constrainedByConnection = connectionConstrained

    if (networkBlocked && !fallbackAvailable) {
      const remaining = backoffRemainingMs(FEED_RATE_LIMIT_BUCKET)
      setRateLimitStatus('blocked')
      setBackoffUntil(Date.now() + remaining)
      setIsConstrained(true)
      const recovered = await recoverFromCache('OpenSky hold active - showing cached traffic')
      if (!recovered && mountedRef.current) {
        setDataSource({
          type: 'live',
          source: 'OpenSky',
          authConfigured,
        })
        setError('OpenSky hold active')
      }
      scheduleNext(Math.min(remaining + 1000, pollMs))
      return
    }

      let raw = null
      let usedFallback = false
      let fetchError = null

      if (!fallbackAvailable || shouldProbePrimary()) {
        try {
          raw = await fetchFlights(spatialBbox)
        } catch (error) {
          fetchError = error
          if (shouldProbePrimary()) {
            fallbackProbeAtRef.current = Date.now() + getFallbackFeedPrimaryRetryMs()
          }
          if (fetchError && fallbackAvailable) {
            raw = null
          } else {
            throw error
          }
        }
      }

      if (!raw && fallbackAvailable) {
        try {
          raw = await fetchFallbackFlights(spatialBbox)
          usedFallback = true
        } catch (fallbackError) {
          if (!fetchError) fetchError = fallbackError
        }
      }

      if (!raw) {
        throw fetchError || new Error('No live flight payload available')
      }

      if (usedFallback) {
        fallbackProbeAtRef.current = Date.now() + getFallbackFeedPrimaryRetryMs()
      } else {
        fallbackProbeAtRef.current = 0
      }

      const hydratedRaw = hydrateSparseFlights(raw, latestRef.current)
      const positionedSamples = buildPositionedSamples(hydratedRaw)
      if (positionedSamples.length) {
        await recordFlightSamples(positionedSamples, Date.now())
        persistFeedSnapshot(positionedSamples, {
          center,
          radiusMi,
          source: usedFallback ? 'fallback' : 'live',
        })
      }

      const shouldConstrain = constrainedByConnection || hydratedRaw.length > HIGH_DENSITY_FLIGHT_THRESHOLD
      setIsConstrained(shouldConstrain)
      const filtered = await enrichFlights(hydratedRaw, {
        constrained: shouldConstrain,
        ...enrichOptions,
      })
      const routeOnlyFallback = filtered.length === 0 && positionedSamples.length > 0
        ? await enrichFlights(hydratedRaw, {
          constrained: false,
          ...enrichOptions,
          skipRouteFilter: true,
        })
        : null
      const routeAndHotelFallback = filtered.length === 0 && positionedSamples.length > 0
        ? await enrichFlights(hydratedRaw, {
          constrained: false,
          ...enrichOptions,
          skipHotelFilter: true,
          skipRouteFilter: true,
        })
        : null
      const finalFiltered = routeOnlyFallback && routeOnlyFallback.length > 0
        ? routeOnlyFallback
        : (routeAndHotelFallback && routeAndHotelFallback.length > 0
          ? routeAndHotelFallback
          : filtered)
      if (!mountedRef.current) return

      if (!finalFiltered.length) {
        try {
          const recovered = await recoverFromCache()
          if (recovered) {
            setRateLimitStatus('ok')
            setBackoffUntil(null)
            setIsConstrained(true)
            scheduleNext(pollMs)
            return
          }

          setError('No live traffic received')
          setRateLimitStatus('ok')
          setBackoffUntil(null)
          scheduleNext(pollMs)
          return
        } catch {
          setError('No live traffic received')
          scheduleNext(pollMs)
          return
        }
      }

      latestRef.current = finalFiltered
      const renderedFlights = renderFlightFrameList(flightsRef.current, finalFiltered, Date.now())

      if (hasFlightsChanged(flightsRef.current, renderedFlights)) {
        setFlights(renderedFlights)
        flightsRef.current = renderedFlights
      } else {
        flightsRef.current = renderedFlights
      }

      setLastUpdated(new Date())
      setIsStale(false)
      setError(null)
      setRateLimitStatus('ok')
      setBackoffUntil(null)
      setDataSource({
        type: usedFallback ? FALLBACK_MODE : 'live',
        source: usedFallback ? getFallbackFeedLabel() : 'OpenSky',
        authConfigured,
      })
      flightCache.evict()
      evictRouteCache()
      scheduleNext(pollMs)
    } catch (e) {
      if (!mountedRef.current) return

      const isRateLimit = e.message?.includes('429') || isBlocked(FEED_RATE_LIMIT_BUCKET)
      if (isRateLimit) {
        const remaining = backoffRemainingMs(FEED_RATE_LIMIT_BUCKET)
        setRateLimitStatus('blocked')
        setBackoffUntil(Date.now() + remaining)
        scheduleNext(Math.min(remaining + 1000, pollMs))
      } else {
        setError(e.message)
        scheduleNext(pollMs)
      }

      // Fall back to DB cache on any failure (rate limit or network error)
      try {
        const recovered = await recoverFromCache(
          isRateLimit
            ? 'OpenSky hold active - showing cached traffic'
            : 'Live source unavailable - showing cached traffic'
        )
        if (recovered && mountedRef.current) {
          if (!isRateLimit) {
            setRateLimitStatus('ok')
            setBackoffUntil(null)
          }
          evictRouteCache()
          // Don't update lastUpdated — the stale timer should fire normally
        }
      } catch {
        // Cache also unavailable — keep whatever flights are already shown
      }
    } finally {
      loadInFlightRef.current = false
      if (mountedRef.current) setLoading(false)
    }
  }, [
    pollMs,
    authConfigured,
    scheduleNext,
    fallbackAvailable,
    shouldProbePrimary,
    spatialBbox,
    enrichOptions,
    recoverFromCache,
    center,
    radiusMi,
    connectionConstrained,
  ])

  useEffect(() => {
    loadRef.current = load
  }, [load])

  useEffect(() => {
    clearTimeout(timerRef.current)
    if (!mountedRef.current) return
    loadRef.current?.()
  }, [spatialBbox.lamin, spatialBbox.lomin, spatialBbox.lamax, spatialBbox.lomax])

  useEffect(() => {
    const initialLoadId = setTimeout(() => { loadRef.current?.() }, 0)
    mountedRef.current = true

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        clearTimeout(timerRef.current)
        loadRef.current?.()
      } else {
        clearTimeout(timerRef.current)
      }
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      mountedRef.current = false
      clearTimeout(initialLoadId)
      clearTimeout(timerRef.current)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  useEffect(() => {
    if (!lastUpdated) return
    const ms = STALE_SHOW_MS - (Date.now() - lastUpdated.getTime())
    const id = setTimeout(() => setIsStale(true), Math.max(ms, 0))
    return () => clearTimeout(id)
  }, [lastUpdated])

  useEffect(() => {
    clearInterval(extrapolationRef.current)

    const tick = () => {
      const latestFlights = latestRef.current
      if (!latestFlights.length) return

      const nowMs = Date.now()
      const nextFlights = renderFlightFrameList(flightsRef.current, latestFlights, nowMs)
      if (hasFlightsChanged(flightsRef.current, nextFlights)) {
        setFlights(nextFlights)
        flightsRef.current = nextFlights
        return
      }

      flightsRef.current = nextFlights
    }

    extrapolationRef.current = setInterval(tick, EXTRAPOLATION_TICK_MS)
    tick()
    return () => clearInterval(extrapolationRef.current)
  }, [isConstrained])

  return { flights, loading, error, lastUpdated, rateLimitStatus, backoffUntil, isStale, dataSource, pollMs, isConstrained }
}
