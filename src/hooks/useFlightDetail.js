import { useEffect, useReducer } from 'react'
import { fetchTrack } from '../api/opensky'
import { fetchCallsignRoute, fetchAircraftInfo } from '../api/adsbdb'
import { flightCache } from '../cache/flightCache'

function initialDetailState() {
  return {
    track: null,
    route: null,
    aircraftInfo: null,
    loading: false
  }
}

function detailReducer(state, action) {
  switch (action.type) {
    case 'reset':
      return initialDetailState()
    case 'setTrack':
      return { ...state, track: action.value ?? null }
    case 'setRoute':
      return { ...state, route: action.value ?? null }
    case 'setAircraftInfo':
      return { ...state, aircraftInfo: action.value ?? null }
    case 'setLoading':
      return { ...state, loading: action.value }
    default:
      return state
  }
}

export default function useFlightDetail(flight) {
  const [state, dispatch] = useReducer(detailReducer, null, initialDetailState)
  const icao24 = flight?.icao24
  const callsign = flight?.callsign

  useEffect(() => {
    let ignored = false

    if (!icao24) {
      dispatch({ type: 'reset' })
      return () => { ignored = true }
    }

    // Clear stale state before serving cache so a no-cache flight doesn't show prior flight's data
    dispatch({ type: 'reset' })

    // Serve from cache immediately — no flicker for previously viewed flights
    const cachedTrack = flightCache.getTrack(icao24)
    const cachedAircraft = flightCache.getAircraft(icao24)
    if (cachedTrack) dispatch({ type: 'setTrack', value: cachedTrack })
    if (cachedAircraft) dispatch({ type: 'setAircraftInfo', value: cachedAircraft })

    const needsTrack = !cachedTrack
    const needsAircraft = !cachedAircraft

    if (!needsTrack && !needsAircraft) {
      // Both from cache — still fetch route in background
      dispatch({ type: 'setLoading', value: true })
      fetchCallsignRoute(callsign)
        .then(r => { if (!ignored) dispatch({ type: 'setRoute', value: r }) })
        .catch(() => {})
        .finally(() => { if (!ignored) dispatch({ type: 'setLoading', value: false }) })
      return () => { ignored = true }
    }

    dispatch({ type: 'setLoading', value: true })
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
              dispatch({ type: 'setTrack', value: d })
            })
            .catch(e => { if (e?.name !== 'AbortError' && !ignored) dispatch({ type: 'setTrack', value: null }) })
        )
      }

      if (needsAircraft) {
        tasks.push(
          fetchAircraftInfo(icao24)
            .then(d => {
              if (ignored) return
              if (d) flightCache.setAircraft(icao24, d)
              dispatch({ type: 'setAircraftInfo', value: d })
            })
            .catch(() => { if (!ignored) dispatch({ type: 'setAircraftInfo', value: null }) })
        )
      }

      tasks.push(
        fetchCallsignRoute(callsign)
          .then(r => { if (!ignored) dispatch({ type: 'setRoute', value: r }) })
          .catch(() => {})
      )

      await Promise.allSettled(tasks)
      if (!ignored) dispatch({ type: 'setLoading', value: false })
    }

    loadMissing()
    return () => { ignored = true; ctrl.abort() }
  }, [icao24, callsign])

  return state
}
