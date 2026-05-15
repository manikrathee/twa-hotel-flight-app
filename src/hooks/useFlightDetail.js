import { useState, useEffect } from 'react'
import { fetchTrack } from '../api/opensky'
import { fetchCallsignRoute, fetchAircraftInfo } from '../api/adsbdb'

export default function useFlightDetail(flight) {
  const [track, setTrack] = useState(null)
  const [route, setRoute] = useState(null)
  const [aircraftInfo, setAircraftInfo] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!flight) {
      setTrack(null)
      setRoute(null)
      setAircraftInfo(null)
      return
    }

    setLoading(true)
    setTrack(null)
    setRoute(null)
    setAircraftInfo(null)

    const controllers = []

    async function loadAll() {
      const [trackData, routeData, aircraftData] = await Promise.allSettled([
        fetchTrack(flight.icao24),
        fetchCallsignRoute(flight.callsign),
        fetchAircraftInfo(flight.icao24),
      ])

      setTrack(trackData.status === 'fulfilled' ? trackData.value : null)
      setRoute(routeData.status === 'fulfilled' ? routeData.value : null)
      setAircraftInfo(aircraftData.status === 'fulfilled' ? aircraftData.value : null)
      setLoading(false)
    }

    loadAll()
    return () => controllers.forEach(c => c.abort?.())
  }, [flight?.icao24])

  return { track, route, aircraftInfo, loading }
}
