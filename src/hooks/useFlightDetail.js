import { useState, useEffect } from 'react'
import { fetchTrack } from '../api/opensky'
import { fetchCallsignRoute, fetchAircraftInfo } from '../api/adsbdb'

export default function useFlightDetail(flight) {
  const [track, setTrack] = useState(null)
  const [route, setRoute] = useState(null)
  const [aircraftInfo, setAircraftInfo] = useState(null)
  const [loading, setLoading] = useState(false)
  const icao24 = flight?.icao24
  const callsign = flight?.callsign

  useEffect(() => {
    let cancelled = false

    function clearDetail() {
      if (cancelled) return
      setTrack(null)
      setRoute(null)
      setAircraftInfo(null)
      setLoading(false)
    }

    if (!icao24) {
      const resetTimer = setTimeout(clearDetail, 0)
      return () => {
        cancelled = true
        clearTimeout(resetTimer)
      }
    }

    async function loadAll() {
      clearDetail()
      setLoading(true)
      const [trackData, routeData, aircraftData] = await Promise.allSettled([
        fetchTrack(icao24),
        fetchCallsignRoute(callsign),
        fetchAircraftInfo(icao24),
      ])

      if (cancelled) return
      setTrack(trackData.status === 'fulfilled' ? trackData.value : null)
      setRoute(routeData.status === 'fulfilled' ? routeData.value : null)
      setAircraftInfo(aircraftData.status === 'fulfilled' ? aircraftData.value : null)
      setLoading(false)
    }

    loadAll()
    return () => { cancelled = true }
  }, [icao24, callsign])

  return { track, route, aircraftInfo, loading }
}
