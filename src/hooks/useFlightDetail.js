import { useState, useEffect, useMemo } from 'react'
import { fetchTrack } from '../api/opensky'
import { fetchCallsignRoute, fetchAircraftInfo } from '../api/adsbdb'
import { flightCache } from '../cache/flightCache'

export default function useFlightDetail(flight) {
  const icao24 = flight?.icao24
  const callsign = flight?.callsign
  const [detail, setDetail] = useState({
    key: null,
    track: null,
    route: null,
    aircraftInfo: null,
    loading: false,
  })

  const cached = useMemo(() => {
    if (!icao24) return { track: null, aircraftInfo: null }
    return {
      track: flightCache.getTrack(icao24),
      aircraftInfo: flightCache.getAircraft(icao24),
    }
  }, [icao24])

  useEffect(() => {
    if (!icao24) return undefined

    let ignored = false
    const ctrl = new AbortController()
    const { signal } = ctrl
    const cachedTrack = cached.track
    const cachedAircraft = cached.aircraftInfo
    const needsTrack = !cachedTrack
    const needsAircraft = !cachedAircraft

    async function loadMissing() {
      const [trackResult, aircraftResult, routeResult] = await Promise.allSettled([
        needsTrack ? fetchTrack(icao24, signal) : Promise.resolve(cachedTrack),
        needsAircraft ? fetchAircraftInfo(icao24, signal) : Promise.resolve(cachedAircraft),
        fetchCallsignRoute(callsign, signal),
      ])

      if (ignored) return

      const nextTrack = trackResult.status === 'fulfilled' ? trackResult.value : null
      const nextAircraft = aircraftResult.status === 'fulfilled' ? aircraftResult.value : null
      const nextRoute = routeResult.status === 'fulfilled' ? routeResult.value : null

      if (nextTrack) flightCache.setTrack(icao24, nextTrack)
      if (nextAircraft) flightCache.setAircraft(icao24, nextAircraft)

      setDetail({
        key: icao24,
        track: nextTrack,
        route: nextRoute,
        aircraftInfo: nextAircraft,
        loading: false,
      })
    }

    loadMissing()
    return () => { ignored = true; ctrl.abort() }
  }, [icao24, callsign, cached])

  if (!icao24) {
    return { track: null, route: null, aircraftInfo: null, loading: false }
  }

  const hasCurrentDetail = detail.key === icao24
  const track = hasCurrentDetail ? detail.track : cached.track
  const aircraftInfo = hasCurrentDetail ? detail.aircraftInfo : cached.aircraftInfo
  const route = hasCurrentDetail ? detail.route : null
  const loading = hasCurrentDetail ? detail.loading : true

  return { track, route, aircraftInfo, loading }
}
