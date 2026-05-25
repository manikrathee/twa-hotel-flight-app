import { useState, useEffect, useRef, useCallback } from 'react'
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
import { flightCache } from '../cache/flightCache'
import { recordFlightSamples } from '../db/flightHistoryDb'
import { JFK, TWA_HOTEL, TWA_VISIBLE_RADIUS_MI, routeTouchesJfk } from '../config/airspace'

const BASE_POLL_MS          = 15_000
const SELECTED_POLL_AUTH_MS = 2_500
const SELECTED_POLL_ANON_MS = 5_000
const STALE_SHOW_MS         = 90_000  // show stale badge after 90s without a fresh update
const HAS_OPENSKY_AUTH      = Boolean(import.meta.env.VITE_OPENSKY_CLIENT_ID)
const ROUTE_TTL_MS          = 20 * 60 * 1000
const TWA_VISIBLE_RADIUS_KM = TWA_VISIBLE_RADIUS_MI / 0.621371
const EXTRAPOLATION_TICK_MS  = 1_000
const EXTRAPOLATED_AGE_LIMIT = 60
const COLLISION_DISTANCE_KM = 0.08
const COLLISION_ALT_CEILING_M = 80
const CONSTRAINED_FLIGHT_LIMIT = 30
const CONSTRAINED_ROUTE_LOOKUP_LIMIT = 24
const HIGH_DENSITY_FLIGHT_THRESHOLD = 120
const SLOW_CONN_TYPES = new Set(['slow-2g', '2g'])
const FALLBACK_MODE = 'fallback'

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

function normalizeFlightState(raw) {
  const latitude = Number(raw.latitude)
  const longitude = Number(raw.longitude)
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null

  const altitude = Number(raw.baro_altitude)
  const verticalRate = Number(raw.vertical_rate)
  const heading = Number(raw.heading)
  const velocity = Number(raw.velocity)
  const geoAltitude = Number(raw.geo_altitude)
  const squawk = raw.squawk == null ? null : String(raw.squawk).trim()

  return {
    ...raw,
    icao24: String(raw.icao24 || '').trim().toLowerCase(),
    callsign: String(raw.callsign || '').trim(),
    latitude,
    longitude,
    baro_altitude: Number.isFinite(altitude) ? altitude : null,
    geo_altitude: Number.isFinite(geoAltitude) ? geoAltitude : null,
    vertical_rate: Number.isFinite(verticalRate) ? verticalRate : null,
    heading: Number.isFinite(heading) ? heading : null,
    velocity: Number.isFinite(velocity) ? velocity : null,
    squawk,
  }
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

function evictRouteCache() {
  const now = Date.now()
  for (const [callsign, entry] of routeCache) {
    if (now - entry.ts > ROUTE_TTL_MS) routeCache.delete(callsign)
  }
}

function buildAirborneSamples(raw) {
  return raw
    .map(normalizeFlightState)
    .filter(Boolean)
    .filter(f => !f.on_ground)
}

async function resolveRoute(callsign) {
  const key = normalizeCallsign(callsign)
  if (!key) return null

  const cached = getCachedRoute(key)
  if (cached !== undefined) return cached

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
  const { skipHotelFilter = false, skipRouteFilter = false } = options
  const { constrained } = options

  const candidates = buildAirborneSamples(raw)
    .map(f => {
      const distKm = distanceKm(JFK.lat, JFK.lon, f.latitude, f.longitude)
      if (skipHotelFilter) return { ...f, distKm }

      const distToTwaKm = distanceKm(TWA_HOTEL.lat, TWA_HOTEL.lon, f.latitude, f.longitude)
      if (distToTwaKm > TWA_VISIBLE_RADIUS_KM) return null

      return { ...f, distKm }
    })
    .filter(Boolean)
    .sort((a, b) => a.distKm - b.distKm)

  if (!candidates.length) return []

  const routeWindow = constrained
    ? candidates.slice(0, CONSTRAINED_ROUTE_LOOKUP_LIMIT)
    : candidates

  const callsigns = [...new Set(
    routeWindow
      .map(f => normalizeCallsign(f.callsign))
      .filter(Boolean)
  )]

  const routePairs = await Promise.all(
    callsigns.map(async callsign => [callsign, await resolveRoute(callsign)])
  )
  const routeByCallsign = new Map(routePairs)

  const ranked = routeWindow
    .filter(f => {
      if (skipRouteFilter) return true
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

export default function useFlights(selectedIcao = null) {
  const selectedPollMs = HAS_OPENSKY_AUTH ? SELECTED_POLL_AUTH_MS : SELECTED_POLL_ANON_MS
  const pollMs = selectedIcao ? selectedPollMs : BASE_POLL_MS
  const fallbackAvailable = isFallbackFeedEnabled()

  const [flights, setFlights]               = useState([])
  const [loading, setLoading]               = useState(true)
  const [error, setError]                   = useState(null)
  const [lastUpdated, setLastUpdated]       = useState(null)
  const [rateLimitStatus, setRateLimitStatus] = useState('ok')   // 'ok' | 'blocked'
  const [backoffUntil, setBackoffUntil]     = useState(null)
  const [isStale, setIsStale]               = useState(false)
  const [dataSource, setDataSource]         = useState(null)     // null | { type: 'live' } | { type: 'cache', cachedAt } | { type: 'mock', cachedAt }
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

  const shouldProbePrimary = useCallback(() => {
    if (!fallbackAvailable) return true
    return !isBlocked() && Date.now() >= fallbackProbeAtRef.current
  }, [fallbackAvailable])

  const load = useCallback(async () => {
    if (!mountedRef.current) return
    if (loadInFlightRef.current) return

    const networkBlocked = isBlocked()
    const constrainedByConnection = isConnectionConstrained()

    if (networkBlocked && !fallbackAvailable) {
      const remaining = backoffRemainingMs()
      setRateLimitStatus('blocked')
      setBackoffUntil(Date.now() + remaining)
      setIsConstrained(true)
      scheduleNext(Math.min(remaining + 1000, pollMs))
      return
    }

    loadInFlightRef.current = true
    try {
      let raw = null
      let usedFallback = false
      let fetchError = null

      if (!fallbackAvailable || shouldProbePrimary()) {
        try {
          raw = await fetchFlights()
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
          raw = await fetchFallbackFlights()
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

  const historySamples = buildAirborneSamples(raw)
  if (historySamples.length) {
    await recordFlightSamples(historySamples, Date.now())
  }

      const shouldConstrain = constrainedByConnection || raw.length > HIGH_DENSITY_FLIGHT_THRESHOLD
      setIsConstrained(shouldConstrain)
      const filtered = await enrichFlights(raw, { constrained: shouldConstrain })
      const routeOnlyFallback = filtered.length === 0 && historySamples.length > 0
        ? await enrichFlights(raw, { constrained: false, skipRouteFilter: true })
        : null
      const routeAndHotelFallback = filtered.length === 0 && historySamples.length > 0
        ? await enrichFlights(raw, { constrained: false, skipHotelFilter: true, skipRouteFilter: true })
        : null
      const finalFiltered = routeOnlyFallback && routeOnlyFallback.length > 0
        ? routeOnlyFallback
        : (routeAndHotelFallback && routeAndHotelFallback.length > 0
          ? routeAndHotelFallback
          : filtered)
      if (!mountedRef.current) return

      if (!finalFiltered.length) {
        try {
          const cached = await fetchCachedFlights()
          const cachedSamples = buildAirborneSamples(cached?.flights || [])
          if (cachedSamples.length > 0) {
            await recordFlightSamples(cachedSamples, cached.cachedAt?.getTime() || Date.now())
          }
          let fallback = cached?.flights ? await enrichFlights(cached.flights, { constrained: true }) : []
          if (fallback.length === 0 && cachedSamples.length > 0) {
            const fallbackFiltered = await enrichFlights(cached.flights, { constrained: false, skipRouteFilter: true })
            if (fallbackFiltered.length > 0) {
              fallback = fallbackFiltered
            }
          }
          if (fallback.length === 0 && cachedSamples.length > 0) {
            const noRouteNoHotelFiltered = await enrichFlights(cached.flights, {
              constrained: false,
              skipHotelFilter: true,
              skipRouteFilter: true,
            })
            if (noRouteNoHotelFiltered.length > 0) {
              fallback = noRouteNoHotelFiltered
            }
          }
          if (!mountedRef.current) return
          latestRef.current = fallback
          if (hasFlightsChanged(flightsRef.current, fallback)) {
            setFlights(fallback)
            flightsRef.current = fallback
          } else {
            flightsRef.current = fallback
          }
          setDataSource({
            type: cached?.cacheSource === 'mock' ? 'mock' : 'cache',
            cachedAt: cached?.cachedAt,
            cacheSource: cached?.cacheSource,
          })
          setError(cached?.cacheSource === 'mock' ? 'No live JFK traffic received - showing simulation' : null)
          setRateLimitStatus('ok')
          setBackoffUntil(null)
          setIsConstrained(true)
          scheduleNext(pollMs)
          return
        } catch {
          setError('No live JFK traffic received')
          scheduleNext(pollMs)
          return
        }
      }

      latestRef.current = finalFiltered

      if (hasFlightsChanged(flightsRef.current, finalFiltered)) {
        setFlights(finalFiltered)
        flightsRef.current = finalFiltered
      } else {
        flightsRef.current = finalFiltered
      }

      setLastUpdated(new Date())
      setIsStale(false)
      setError(null)
      setRateLimitStatus('ok')
      setBackoffUntil(null)
      setDataSource({
        type: usedFallback ? FALLBACK_MODE : 'live',
        source: usedFallback ? getFallbackFeedLabel() : 'OpenSky',
      })
      flightCache.evict()
      evictRouteCache()
      scheduleNext(pollMs)
    } catch (e) {
      if (!mountedRef.current) return

      const isRateLimit = e.message?.includes('429') || isBlocked()
      if (isRateLimit) {
        const remaining = backoffRemainingMs()
        setRateLimitStatus('blocked')
        setBackoffUntil(Date.now() + remaining)
        scheduleNext(Math.min(remaining + 1000, pollMs))
      } else {
        setError(e.message)
        scheduleNext(pollMs)
      }

      // Fall back to DB cache on any failure (rate limit or network error)
      try {
        const cached = await fetchCachedFlights()
        if (cached && mountedRef.current) {
          setIsConstrained(true)
          const cachedSamples = buildAirborneSamples(cached.flights)
          await recordFlightSamples(cachedSamples, cached.cachedAt?.getTime() || Date.now())

          let filtered = await enrichFlights(cached.flights, { constrained: true })
          if (filtered.length === 0 && cachedSamples.length > 0) {
            const fallbackFiltered = await enrichFlights(cached.flights, { constrained: false, skipRouteFilter: true })
            if (fallbackFiltered.length > 0) {
              filtered = fallbackFiltered
            }
          }
          if (filtered.length === 0 && cachedSamples.length > 0) {
            const noRouteNoHotelFiltered = await enrichFlights(cached.flights, {
              constrained: false,
              skipHotelFilter: true,
              skipRouteFilter: true,
            })
            if (noRouteNoHotelFiltered.length > 0) {
              filtered = noRouteNoHotelFiltered
            }
          }
          if (!mountedRef.current) return
          latestRef.current = filtered
          if (hasFlightsChanged(flightsRef.current, filtered)) {
            setFlights(filtered)
            flightsRef.current = filtered
          } else {
            flightsRef.current = filtered
          }
          setDataSource({
            type: cached.cacheSource === 'mock' ? 'mock' : 'cache',
            cachedAt: cached.cachedAt,
            cacheSource: cached.cacheSource,
          })
          if (cached.cacheSource === 'mock') setError('Live source blocked - showing simulation')
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
  }, [pollMs, scheduleNext, fallbackAvailable, shouldProbePrimary])

  useEffect(() => {
    loadRef.current = load
  }, [load])

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
    if (!selectedIcao) return

    const tick = () => {
      const nowMs = Date.now()
      const latestFlights = latestRef.current
      const selectedLiveFlight = latestFlights.find(flight => flight.icao24 === selectedIcao)
      if (!selectedLiveFlight) return

      const selectedExtrapolated = extrapolatePoint(selectedLiveFlight, nowMs)
      const currentFlights = flightsRef.current
      const selectedIndex = currentFlights.findIndex(flight => flight.icao24 === selectedIcao)
      if (selectedIndex === -1) return

      const currentSelected = currentFlights[selectedIndex]
      if (sameFlightSnapshot(currentSelected, selectedExtrapolated)) return

      const nextFlights = currentFlights.map((flight) => (
        flight.icao24 === selectedIcao
          ? selectedExtrapolated
          : flight
      ))

      setFlights(nextFlights)
      flightsRef.current = nextFlights
    }

    extrapolationRef.current = setInterval(tick, EXTRAPOLATION_TICK_MS)
    tick()
    return () => clearInterval(extrapolationRef.current)
  }, [selectedIcao, isConstrained])

  return { flights, loading, error, lastUpdated, rateLimitStatus, backoffUntil, isStale, dataSource, pollMs, isConstrained }
}
