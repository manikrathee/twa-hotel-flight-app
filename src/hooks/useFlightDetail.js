import { useEffect, useReducer } from 'react'
import { fetchAircraftMeta, fetchTrack } from '../api/opensky'
import { fetchCallsignRoute, fetchAircraftInfo } from '../api/adsbdb'
import { flightCache } from '../cache/flightCache'
import { recordTrackPoints } from '../db/flightHistoryDb'

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

function normalizeMetadata(meta) {
  if (!meta) return null
  const source = meta.aircraft || meta
  return {
    manufacturer: source.manufacturer || source.manufacturername || null,
    model: source.model || null,
    type: source.type || source.typecode || source.icao_type || null,
    registration: source.registration || null,
    registered_owner: source.registered_owner || source.owner || source.operator || null,
    url_photo: source.url_photo || null,
    url_photo_thumbnail: source.url_photo_thumbnail || null,
    serial_number: source.serial_number || null,
    age: source.age || null,
  }
}

function mergeAircraftProfiles(base = null, meta = null) {
  const normalizedMeta = normalizeMetadata(meta)
  const profile = {
    ...(base || {}),
    ...(normalizedMeta || {}),
  }

  const toCleanText = (value) => isUsableText(value) ? value : null
  return {
    ...profile,
    type: toCleanText(profile.type) || toCleanText(profile.icao_type),
    icao_type: toCleanText(profile.icao_type),
    manufacturer: toCleanText(profile.manufacturer),
    model: toCleanText(profile.model),
    registered_owner: toCleanText(profile.registered_owner),
    registration: toCleanText(profile.registration),
    url_photo_thumbnail: toCleanText(profile.url_photo_thumbnail),
    url_photo: toCleanText(profile.url_photo),
    age: toCleanText(profile.age),
    serial_number: toCleanText(profile.serial_number),
  }
}

function hasUsableAircraftProfile(profile) {
  if (!profile) return false
  return Boolean(
    isUsableText(profile.type) ||
    isUsableText(profile.icao_type) ||
    isUsableText(profile.model) ||
    isUsableText(profile.manufacturer) ||
    isUsableText(profile.registration)
  )
}

function isUsableText(value) {
  if (!value && value !== 0) return false
  const clean = String(value).trim()
  if (!clean) return false
  return !/^(unknown|n\/a|na|none|not available|tbd)$/i.test(clean)
}

export default function useFlightDetail(flight, preloadedTrack = null) {
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

    // Serve from cache or provided history track immediately — no flicker for previously viewed flights
    const cachedTrack = flightCache.getTrack(icao24)
    const seededTrack = preloadedTrack ?? cachedTrack
    const cachedAircraft = flightCache.getAircraft(icao24)
    if (seededTrack) dispatch({ type: 'setTrack', value: seededTrack })
    if (cachedAircraft) dispatch({ type: 'setAircraftInfo', value: cachedAircraft })

    const needsTrack = !seededTrack
    const needsAircraft = !hasUsableAircraftProfile(cachedAircraft)

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
              if (d) {
                flightCache.setTrack(icao24, d)
                recordTrackPoints(icao24, d)
              }
              dispatch({ type: 'setTrack', value: d })
            })
            .catch(e => { if (e?.name !== 'AbortError' && !ignored) dispatch({ type: 'setTrack', value: null }) })
        )
      }

      if (needsAircraft) {
        tasks.push((async () => {
          const [aircraft, metadata] = await Promise.all([
            fetchAircraftInfo(icao24, callsign).catch(() => null),
            fetchAircraftMeta(icao24, signal).catch(() => null),
          ])

          if (ignored) return

          const merged = mergeAircraftProfiles(aircraft, metadata)
          if (hasUsableAircraftProfile(merged)) {
            flightCache.setAircraft(icao24, merged)
          }
          dispatch({ type: 'setAircraftInfo', value: hasUsableAircraftProfile(merged) ? merged : null })
        })())
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

  useEffect(() => {
    if (!icao24 || !preloadedTrack) return
    dispatch({ type: 'setTrack', value: preloadedTrack })
  }, [icao24, preloadedTrack])

  return state
}
