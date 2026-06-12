import { useEffect, useMemo, useState } from 'react'

const DEFAULT_ACCURACY_BASE_RADIUS_MI = 12
const DEFAULT_TIMEOUT_MS = 9500
const MIN_RADIUS_MI = 4
const MAX_RADIUS_MI = 140
const ACCURACY_SCALE = 3.5
const FALLBACK_SOURCE = 'fallback'
const ERROR_SOURCE = 'error'
const LOADING_SOURCE = 'loading'
const DEVICE_SOURCE = 'device'
const UNAVAILABLE_SOURCE = 'unavailable'
const UNITS_M_TO_MI = 1 / 1609.344

function toFiniteNumber(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function normalizeCenter(raw) {
  const lat = toFiniteNumber(raw?.lat)
  const lon = toFiniteNumber(raw?.lon)
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null

  return {
    lat,
    lon,
    accuracy: toFiniteNumber(raw?.accuracy),
    timestamp: toFiniteNumber(raw?.timestamp) || Date.now(),
  }
}

function normalizeAccuracyRadiusMi(accuracyMeters) {
  if (!Number.isFinite(accuracyMeters) || accuracyMeters <= 0) return null
  return accuracyMeters * UNITS_M_TO_MI * ACCURACY_SCALE
}

function clampRadiusMi(radiusMi, fallbackRadiusMi) {
  const fallback = Number(fallbackRadiusMi)
  const base = Number.isFinite(fallback) ? fallback : DEFAULT_ACCURACY_BASE_RADIUS_MI
  const value = Number(radiusMi)

  if (!Number.isFinite(value)) return base
  const rounded = Math.round(value * 10) / 10
  return Math.max(MIN_RADIUS_MI, Math.min(MAX_RADIUS_MI, rounded))
}

function makeState({ center, source, error, accuracy = null, lastUpdatedMs = null }) {
  return {
    center,
    source,
    radiusMi: center
      ? clampRadiusMi(normalizeAccuracyRadiusMi(accuracy), DEFAULT_ACCURACY_BASE_RADIUS_MI)
      : DEFAULT_ACCURACY_BASE_RADIUS_MI,
    error,
    accuracy,
    lastUpdatedMs,
    isReady: Boolean(center),
    isDeviceLocation: source === DEVICE_SOURCE,
    isLoading: source === LOADING_SOURCE,
  }
}

export default function useDeviceLocation({
  enabled = true,
  fallbackCenter = null,
  fallbackRadiusMi = DEFAULT_ACCURACY_BASE_RADIUS_MI,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  const fallback = useMemo(() => normalizeCenter(fallbackCenter), [fallbackCenter])

  const disabledState = useMemo(() => {
    if (fallback) {
      return {
        ...makeState({
          center: { lat: fallback.lat, lon: fallback.lon },
          source: FALLBACK_SOURCE,
          error: null,
          accuracy: fallback.accuracy,
          lastUpdatedMs: fallback.timestamp,
        }),
        radiusMi: clampRadiusMi(fallbackRadiusMi, fallbackRadiusMi),
        isLoading: false,
        isReady: true,
        isDeviceLocation: false,
      }
    }

    return {
      ...makeState({
        center: null,
        source: UNAVAILABLE_SOURCE,
        error: 'Location lookup disabled by host config',
        accuracy: null,
        lastUpdatedMs: null,
      }),
      radiusMi: clampRadiusMi(fallbackRadiusMi, fallbackRadiusMi),
      isLoading: false,
      isReady: false,
      isDeviceLocation: false,
    }
  }, [fallback, fallbackRadiusMi])

  const fallbackState = fallback
    ? makeState({
      center: { lat: fallback.lat, lon: fallback.lon },
      source: FALLBACK_SOURCE,
      error: null,
      accuracy: fallback.accuracy,
      lastUpdatedMs: fallback.timestamp,
    })
    : null

  const [state, setState] = useState(() => {
    const initial = fallback ? {
      center: { lat: fallback.lat, lon: fallback.lon },
      source: FALLBACK_SOURCE,
      error: null,
      accuracy: fallback.accuracy,
      lastUpdatedMs: fallback.timestamp,
    } : {
      center: null,
      source: enabled ? LOADING_SOURCE : UNAVAILABLE_SOURCE,
      error: enabled ? null : 'Location lookup disabled by host config',
      accuracy: null,
      lastUpdatedMs: null,
    }

    const base = makeState({
      center: initial.center,
      source: initial.source,
      error: initial.error,
      accuracy: initial.accuracy,
      lastUpdatedMs: initial.lastUpdatedMs,
    })

    base.radiusMi = clampRadiusMi(fallbackRadiusMi, fallbackRadiusMi)
    return base
  })

  const runtimeUnavailableState = useMemo(() => {
    if (fallback) {
      return {
        ...makeState({
          center: { lat: fallback.lat, lon: fallback.lon },
          source: FALLBACK_SOURCE,
          error: null,
          accuracy: fallback.accuracy,
          lastUpdatedMs: fallback.timestamp,
        }),
        radiusMi: clampRadiusMi(fallbackRadiusMi, fallbackRadiusMi),
        isLoading: false,
        isReady: true,
        isDeviceLocation: false,
      }
    }

    return {
      ...makeState({
        center: null,
        source: UNAVAILABLE_SOURCE,
        error: 'Geolocation is unavailable in this browser',
        accuracy: null,
        lastUpdatedMs: null,
      }),
      radiusMi: clampRadiusMi(fallbackRadiusMi, fallbackRadiusMi),
      isLoading: false,
      isReady: false,
      isDeviceLocation: false,
    }
  }, [fallback, fallbackRadiusMi])

  useEffect(() => {
    if (!enabled) {
      return
    }

    if (!window || !window.navigator || !window.navigator.geolocation) {
      return
    }

    let mounted = true

    const onSuccess = (position) => {
      if (!mounted) return

      const next = normalizeCenter(position.coords)
      if (!next) {
        setState(prev => ({
          ...makeState({
            center: prev.center,
            source: ERROR_SOURCE,
            error: 'Location response malformed',
            accuracy: prev.accuracy,
            lastUpdatedMs: prev.lastUpdatedMs,
          }),
          radiusMi: clampRadiusMi(fallbackRadiusMi, fallbackRadiusMi),
          isLoading: false,
          isReady: prev.center ? true : false,
          isDeviceLocation: prev.source === DEVICE_SOURCE,
        }))
        return
      }

      setState({
        ...makeState({
          center: { lat: next.lat, lon: next.lon },
          source: DEVICE_SOURCE,
          error: null,
          accuracy: next.accuracy,
          lastUpdatedMs: next.timestamp,
        }),
        radiusMi: clampRadiusMi(next.accuracy, fallbackRadiusMi),
        isLoading: false,
        isReady: true,
        isDeviceLocation: true,
      })
    }

    const onError = (error) => {
      if (!mounted) return

      if (error?.code === 1 && fallbackState) {
        setState({
          ...fallbackState,
          radiusMi: clampRadiusMi(fallbackRadiusMi, fallbackRadiusMi),
          isLoading: false,
          isReady: true,
          isDeviceLocation: false,
        })
        return
      }

      setState({
        ...makeState({
          center: null,
          source: ERROR_SOURCE,
          error: error?.message || 'Unable to read device location',
          accuracy: null,
          lastUpdatedMs: null,
        }),
        radiusMi: clampRadiusMi(fallbackRadiusMi, fallbackRadiusMi),
        isLoading: false,
        isReady: false,
        isDeviceLocation: false,
      })
    }

    const options = {
      enableHighAccuracy: false,
      timeout: timeoutMs,
      maximumAge: 90_000,
    }

    navigator.geolocation.getCurrentPosition(onSuccess, onError, options)
    const watchId = navigator.geolocation.watchPosition(onSuccess, onError, options)

    return () => {
      mounted = false
      if (watchId != null) navigator.geolocation.clearWatch(watchId)
    }
  }, [enabled, fallbackState, fallbackRadiusMi, timeoutMs, fallback?.lat, fallback?.lon, fallback?.accuracy])

  if (!enabled) return disabledState
  if (!window || !window.navigator || !window.navigator.geolocation) return runtimeUnavailableState
  return state
}
