import { useCallback, useState, useEffect, useRef } from 'react'
import { fetchFlights, JFK } from '../api/opensky'
import { distanceKm } from '../utils/geo'

const POLL_MS = 15000

export default function useFlights() {
  const [flights, setFlights] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)
  const timerRef = useRef(null)

  const load = useCallback(async () => {
    try {
      const raw = await fetchFlights()
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
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const firstLoad = setTimeout(load, 0)
    timerRef.current = setInterval(load, POLL_MS)
    return () => {
      clearTimeout(firstLoad)
      clearInterval(timerRef.current)
    }
  }, [load])

  return { flights, loading, error, lastUpdated }
}
