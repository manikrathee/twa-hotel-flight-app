import { useState, useEffect } from 'react'
import { fetchTrack } from '../api/opensky'
import { fetchCallsignRoute, fetchAircraftInfo } from '../api/adsbdb'
import { flightCache } from '../cache/flightCache'

export default function useFlightDetail(flight) {
  const [track, setTrack] = useState(null)
  const [route, setRoute] = useState(null)
  const [aircraftInfo, setAircraftInfo] = useState(null)
  const [loading, setLoading] = useState(false)
  const icao24 = flight?.icao24
  const callsign = flight?.callsign

  useEffect(() => {
    let ignored = false

    if (!icao24) {
      setTrack(null)
      setRoute(null)
      setAircraftInfo(null)
      setLoading(false)
      return () => { ignored = true }
    }

    // Clear stale state before serving cache so a no-cache flight doesn't show prior flight's data
    setTrack(null)
    setRoute(null)
    setAircraftInfo(null)

    // Serve from cache immediately — no flicker for previously viewed flights
    const cachedTrack = flightCache.getTrack(icao24)
    const cachedAircraft = flightCache.getAircraft(icao24)
    if (cachedTrack) setTrack(cachedTrack)
    if (cachedAircraft) setAircraftInfo(cachedAircraft)

    const needsTrack = !cachedTrack
    const needsAircraft = !cachedAircraft

    if (!needsTrack && !needsAircraft) {
      // Both from cache — still fetch route in background
      setLoading(true)
      fetchCallsignRoute(callsign)
        .then(r => { if (!ignored) setRoute(r) })
        .catch(() => {})
        .finally(() => { if (!ignored) setLoading(false) })
      return () => { ignored = true }
    }

    setLoading(true)
    const ctrl = new AbortController()
    const { signal } = ctrl

    async function loadMissing() {
      const tasks = []

      if (needsTrack) {
        tasks.push(
          fetchTrack(icao24, signal)
            .then(d => {
              if (ignored) return
              if (d) flightCache.setTrack(icao24, d)
              setTrack(d)
            })
            .catch(e => { if (e?.name !== 'AbortError' && !ignored) setTrack(null) })
        )
      }

      if (needsAircraft) {
        tasks.push(
          fetchAircraftInfo(icao24)
            .then(d => {
              if (ignored) return
              if (d) flightCache.setAircraft(icao24, d)
              setAircraftInfo(d)
            })
            .catch(() => { if (!ignored) setAircraftInfo(null) })
        )
      }

      tasks.push(
        fetchCallsignRoute(callsign)
          .then(r => { if (!ignored) setRoute(r) })
          .catch(() => {})
      )

      await Promise.allSettled(tasks)
      if (!ignored) setLoading(false)
    }

    loadMissing()
    return () => { ignored = true; ctrl.abort() }
  }, [icao24, callsign])

  return { track, route, aircraftInfo, loading }
}
