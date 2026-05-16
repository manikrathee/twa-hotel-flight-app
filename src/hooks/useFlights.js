import { useState, useEffect, useRef, useCallback } from 'react'
import { fetchFlights, fetchCachedFlights, JFK } from '../api/opensky'
import { isBlocked, backoffRemainingMs } from '../api/rateLimitManager'
import { distanceKm } from '../utils/geo'
import { flightCache } from '../cache/flightCache'

const BASE_POLL_MS  = 15_000
const STALE_SHOW_MS = 90_000  // show stale badge after 90s without a fresh update

function enrichFlights(raw) {
  return raw
    .filter(f => !f.on_ground && f.latitude != null && f.longitude != null)
    .map(f => ({ ...f, distKm: f.distKm ?? distanceKm(JFK.lat, JFK.lon, f.latitude, f.longitude) }))
    .sort((a, b) => a.distKm - b.distKm)
}

export default function useFlights() {
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
      scheduleNext(Math.min(remaining + 1000, BASE_POLL_MS))
      return
    }

    try {
      const raw = await fetchFlights()
      if (!mountedRef.current) return

      setFlights(enrichFlights(raw))
      setLastUpdated(new Date())
      setError(null)
      setRateLimitStatus('ok')
      setBackoffUntil(null)
      setDataSource({ type: 'live' })
      flightCache.evict()
      scheduleNext(BASE_POLL_MS)
    } catch (e) {
      if (!mountedRef.current) return

      // Rate limited — try the DB cache so the map stays populated
      const isRateLimit = e.message?.includes('429') || isBlocked()
      if (isRateLimit) {
        const remaining = backoffRemainingMs()
        setRateLimitStatus('blocked')
        setBackoffUntil(Date.now() + remaining)
        scheduleNext(Math.min(remaining + 1000, BASE_POLL_MS))
      } else {
        setError(e.message)
        scheduleNext(BASE_POLL_MS)
      }

      // Fall back to DB cache on any failure (rate limit or network error)
      try {
        const cached = await fetchCachedFlights()
        if (cached && mountedRef.current) {
          setFlights(enrichFlights(cached.flights))
          setDataSource({ type: 'cache', cachedAt: cached.cachedAt })
          // Don't update lastUpdated — the stale timer should fire normally
        }
      } catch {
        // Cache also unavailable — keep whatever flights are already shown
      }
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [scheduleNext])

  loadRef.current = load

  useEffect(() => {
    mountedRef.current = true
    load()

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        clearTimeout(timerRef.current)
        load()
      } else {
        clearTimeout(timerRef.current)
      }
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      mountedRef.current = false
      clearTimeout(timerRef.current)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [load])

  useEffect(() => {
    if (!lastUpdated) { setIsStale(false); return }
    setIsStale(false)
    const ms = STALE_SHOW_MS - (Date.now() - lastUpdated.getTime())
    if (ms <= 0) { setIsStale(true); return }
    const id = setTimeout(() => setIsStale(true), ms)
    return () => clearTimeout(id)
  }, [lastUpdated])

  return { flights, loading, error, lastUpdated, rateLimitStatus, backoffUntil, isStale, dataSource }
}
