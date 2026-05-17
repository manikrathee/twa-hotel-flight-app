import { useState, useEffect, useRef, useCallback } from 'react'
import { fetchFlights, fetchCachedFlights } from '../api/opensky'
import { fetchCallsignRoute } from '../api/adsbdb'
import { isBlocked, backoffRemainingMs } from '../api/rateLimitManager'
import { distanceKm, distanceMiles } from '../utils/geo'
import { flightCache } from '../cache/flightCache'
import { JFK, TWA_HOTEL, TWA_VISIBLE_RADIUS_MI, routeTouchesJfk } from '../config/airspace'

const BASE_POLL_MS          = 15_000
const SELECTED_POLL_AUTH_MS = 5_000
const SELECTED_POLL_ANON_MS = 10_000
const STALE_SHOW_MS         = 90_000  // show stale badge after 90s without a fresh update
const HAS_OPENSKY_AUTH      = Boolean(import.meta.env.VITE_OPENSKY_CLIENT_ID)
const ROUTE_TTL_MS          = 20 * 60 * 1000

const routeCache = new Map()
const inFlightRouteLookup = new Map()

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

function evictRouteCache() {
  const now = Date.now()
  for (const [callsign, entry] of routeCache) {
    if (now - entry.ts > ROUTE_TTL_MS) routeCache.delete(callsign)
  }
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

async function enrichFlights(raw) {
  const airborne = raw
    .filter(f => !f.on_ground && f.latitude != null && f.longitude != null)
  if (!airborne.length) return []

  const callsigns = [...new Set(
    airborne
      .map(f => normalizeCallsign(f.callsign))
      .filter(Boolean)
  )]

  const routePairs = await Promise.all(
    callsigns.map(async callsign => [callsign, await resolveRoute(callsign)])
  )
  const routeByCallsign = new Map(routePairs)

  return airborne
    .filter(f => {
      const callsign = normalizeCallsign(f.callsign)
      if (!callsign) return false
      const route = routeByCallsign.get(callsign)
      if (!routeTouchesJfk(route)) return false
      return distanceMiles(TWA_HOTEL.lat, TWA_HOTEL.lon, f.latitude, f.longitude) <= TWA_VISIBLE_RADIUS_MI
    })
    .map(f => ({ ...f, distKm: f.distKm ?? distanceKm(JFK.lat, JFK.lon, f.latitude, f.longitude) }))
    .sort((a, b) => a.distKm - b.distKm)
}

export default function useFlights(selectedIcao = null) {
  const selectedPollMs = HAS_OPENSKY_AUTH ? SELECTED_POLL_AUTH_MS : SELECTED_POLL_ANON_MS
  const pollMs = selectedIcao ? selectedPollMs : BASE_POLL_MS

  const [flights, setFlights]               = useState([])
  const [loading, setLoading]               = useState(true)
  const [error, setError]                   = useState(null)
  const [lastUpdated, setLastUpdated]       = useState(null)
  const [rateLimitStatus, setRateLimitStatus] = useState('ok')   // 'ok' | 'blocked'
  const [backoffUntil, setBackoffUntil]     = useState(null)
  const [isStale, setIsStale]               = useState(false)
  const [dataSource, setDataSource]         = useState(null)     // null | { type: 'live' } | { type: 'cache', cachedAt }

  const timerRef   = useRef(null)
  const mountedRef = useRef(true)
  const loadRef    = useRef(null)

  const scheduleNext = useCallback((delayMs) => {
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => { loadRef.current?.() }, delayMs)
  }, [])

  const load = useCallback(async () => {
    if (!mountedRef.current) return

    if (isBlocked()) {
      const remaining = backoffRemainingMs()
      setRateLimitStatus('blocked')
      setBackoffUntil(Date.now() + remaining)
      scheduleNext(Math.min(remaining + 1000, pollMs))
      return
    }

    try {
      const raw = await fetchFlights()
      const filtered = await enrichFlights(raw)
      if (!mountedRef.current) return

      setFlights(filtered)
      setLastUpdated(new Date())
      setIsStale(false)
      setError(null)
      setRateLimitStatus('ok')
      setBackoffUntil(null)
      setDataSource({ type: 'live' })
      flightCache.evict()
      evictRouteCache()
      scheduleNext(pollMs)
    } catch (e) {
      if (!mountedRef.current) return

      // Rate limited — try the DB cache so the map stays populated
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
          const filtered = await enrichFlights(cached.flights)
          if (!mountedRef.current) return
          setFlights(filtered)
          setDataSource({ type: 'cache', cachedAt: cached.cachedAt })
          evictRouteCache()
          // Don't update lastUpdated — the stale timer should fire normally
        }
      } catch {
        // Cache also unavailable — keep whatever flights are already shown
      }
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [pollMs, scheduleNext])

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

  return { flights, loading, error, lastUpdated, rateLimitStatus, backoffUntil, isStale, dataSource, pollMs }
}
