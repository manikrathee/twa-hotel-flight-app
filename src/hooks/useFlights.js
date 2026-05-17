import { useState, useEffect, useRef, useCallback } from 'react'
import { fetchFlights, JFK } from '../api/opensky'
import { isBlocked, backoffRemainingMs } from '../api/rateLimitManager'
import { distanceKm } from '../utils/geo'
import { flightCache } from '../cache/flightCache'

const BASE_POLL_MS = 15_000
const STALE_SHOW_MS = 90_000  // show stale badge after 90s without a fresh update

export default function useFlights() {
  const [flights, setFlights] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [rateLimitStatus, setRateLimitStatus] = useState('ok') // 'ok' | 'blocked' | 'error'
  const [backoffUntil, setBackoffUntil] = useState(null)
  const [staleUpdatedAt, setStaleUpdatedAt] = useState(null)

  const timerRef = useRef(null)
  const mountedRef = useRef(true)
  // Ref so scheduleNext (stable, empty deps) always calls the latest load
  const loadRef = useRef(null)

  const scheduleNext = useCallback((delayMs) => {
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      loadRef.current?.()
    }, delayMs)
  }, [])

  const load = useCallback(async () => {
    if (!mountedRef.current) return

    // If rate limited, stay visible on existing data — don't blank the map
    if (isBlocked()) {
      const remaining = backoffRemainingMs()
      setRateLimitStatus('blocked')
      setBackoffUntil(Date.now() + remaining)
      setError('OpenSky rate limit active')
      setLoading(false)
      scheduleNext(Math.min(remaining + 1000, BASE_POLL_MS))
      return
    }

    try {
      const raw = await fetchFlights()
      if (!mountedRef.current) return

      const airborne = raw
        .filter(f => !f.on_ground && f.latitude != null && f.longitude != null)
        .map(f => ({
          ...f,
          distKm: distanceKm(JFK.lat, JFK.lon, f.latitude, f.longitude),
        }))
        .sort((a, b) => a.distKm - b.distKm)

      setFlights(airborne)
      setLastUpdated(new Date())
      setError(null)
      setRateLimitStatus('ok')
      setBackoffUntil(null)
      flightCache.evict() // opportunistic TTL cleanup
      scheduleNext(BASE_POLL_MS)
    } catch (e) {
      if (!mountedRef.current) return
      if (e.message?.includes('429') || isBlocked()) {
        const remaining = backoffRemainingMs()
        setRateLimitStatus('blocked')
        setBackoffUntil(Date.now() + remaining)
        setError(e.message || 'OpenSky rate limit active')
        scheduleNext(Math.min(remaining + 1000, BASE_POLL_MS))
      } else {
        setError(e.message)
        setRateLimitStatus('error')
        setBackoffUntil(null)
        scheduleNext(BASE_POLL_MS)
      }
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [scheduleNext])

  // Keep loadRef current so the stable scheduleNext closure always calls the latest load
  useEffect(() => {
    loadRef.current = load
  }, [load])

  useEffect(() => {
    mountedRef.current = true
    const firstLoadId = setTimeout(load, 0)

    // Pause when tab hidden, refresh immediately on return
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
      clearTimeout(firstLoadId)
      clearTimeout(timerRef.current)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [load])

  // Reactive stale marker: flips after STALE_SHOW_MS without synchronously setting state in the effect.
  useEffect(() => {
    if (!lastUpdated) return undefined
    const updatedAt = lastUpdated.getTime()
    const ms = STALE_SHOW_MS - (Date.now() - lastUpdated.getTime())
    const id = setTimeout(() => setStaleUpdatedAt(updatedAt), Math.max(0, ms))
    return () => clearTimeout(id)
  }, [lastUpdated])

  const isStale = lastUpdated != null && staleUpdatedAt === lastUpdated.getTime()

  return { flights, loading, error, lastUpdated, rateLimitStatus, backoffUntil, isStale }
}
