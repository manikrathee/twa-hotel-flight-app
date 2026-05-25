import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { convertSamplesToTrack, getWindowSamples, makeMapFlightFromSample } from '../db/flightHistoryDb'

const REFRESH_INTERVAL_MS = 12_000
const TICK_INTERVAL_MS = 220
const STALE_MS = 95_000

function buildFlightsByIcao(samples) {
  const grouped = new Map()

  for (const sample of samples) {
    const existing = grouped.get(sample.icao24)
    if (!existing) {
      grouped.set(sample.icao24, [])
    }
    grouped.get(sample.icao24).push(sample)
  }

  for (const [icao24, list] of grouped) {
    list.sort((a, b) => a.ts - b.ts)
    grouped.set(icao24, list)
  }

  return grouped
}

function latestBeforeOrAt(samples, cursorMs) {
  if (!samples.length) return null

  let lo = 0
  let hi = samples.length - 1
  let best = null

  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const sample = samples[mid]
    if (sample.ts <= cursorMs) {
      best = sample
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }

  return best
}

function pathLinesFromMap(flightPaths, cursorMs) {
  const features = []

  for (const [icao24, points] of flightPaths) {
    if (!Array.isArray(points)) continue

    const pointsToUse = points.filter(point => Number.isFinite(point.ts) && point.ts <= cursorMs)
    if (pointsToUse.length < 2) continue
    const last = pointsToUse[pointsToUse.length - 1]
    const coords = pointsToUse
      .map(point => {
        if (!Number.isFinite(point.latitude) || !Number.isFinite(point.longitude)) return null
        return [point.longitude, point.latitude]
      })
      .filter(Boolean)

    if (coords.length < 2) continue

    features.push({
      type: 'Feature',
      properties: {
        icao24,
        callsign: last.callsign || icao24,
        pointCount: pointsToUse.length,
        sampleKind: last.sampleKind,
      },
      geometry: {
        type: 'LineString',
        coordinates: coords,
      },
    })
  }

  return {
    type: 'FeatureCollection',
    features,
  }
}

function congestionPointsFromFlights(flights, gridStep = 0.1) {
  const buckets = new Map()

  for (const flight of flights) {
    const lat = Number(flight.latitude)
    const lon = Number(flight.longitude)
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue

    const latBin = Math.round(lat / gridStep)
    const lonBin = Math.round(lon / gridStep)
    const key = `${latBin},${lonBin}`

    const bucket = buckets.get(key)
    if (bucket) {
      bucket.count += 1
      bucket.latSum += lat
      bucket.lonSum += lon
    } else {
      buckets.set(key, {
        count: 1,
        latSum: lat,
        lonSum: lon,
      })
    }
  }

  const features = []

  for (const [, value] of buckets) {
    features.push({
      type: 'Feature',
      properties: {
        count: Math.min(value.count, 30),
      },
      geometry: {
        type: 'Point',
        coordinates: [
          value.lonSum / value.count,
          value.latSum / value.count,
        ],
      },
    })
  }

  return {
    type: 'FeatureCollection',
    features,
  }
}

export default function useFlightHistory({
  enabled,
  windowMs,
  isPlaying,
  speedMultiplier = 2,
  refreshKey,
}) {
  const [samples, setSamples] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [range, setRange] = useState(null)
  const [cursorMs, setCursorMs] = useState(() => Date.now())
  const [loadError, setLoadError] = useState(null)
  const timerRef = useRef(null)
  const lastTickRef = useRef(0)
  const rangeRef = useRef(null)
  const cursorMsRef = useRef(cursorMs)
  const wasPlayingRef = useRef(isPlaying)

  const loadSamples = useCallback(async () => {
    if (!enabled || !windowMs) {
      setSamples([])
      setRange(null)
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    setLoadError(null)
    try {
      const nextSamples = await getWindowSamples(windowMs)
      const nextRange = nextSamples.length
        ? { startMs: nextSamples[0].ts, endMs: nextSamples[nextSamples.length - 1].ts }
        : null

      setSamples(nextSamples)
      setRange(nextRange)
      const prevRange = rangeRef.current
      const wasPlaying = wasPlayingRef.current

      if (!nextRange) {
        setCursorMs(Date.now())
      } else if (!prevRange) {
        setCursorMs(isPlaying ? nextRange.startMs : nextRange.endMs)
      } else {
        let nextCursorMs = isPlaying ? cursorMsRef.current : nextRange.endMs
        const span = nextRange.endMs - nextRange.startMs

        if (!wasPlaying && isPlaying) {
          nextCursorMs = nextRange.startMs
        } else if (prevRange.startMs !== nextRange.startMs) {
          nextCursorMs = nextRange.startMs
        } else if (span > 0 && prevRange.endMs !== nextRange.endMs) {
          const offsetFromStart = cursorMsRef.current - prevRange.startMs
          nextCursorMs = nextRange.startMs + Math.max(0, Math.min(offsetFromStart, span))
        }

        if (isPlaying && span > 0) {
          if (nextCursorMs < nextRange.startMs) nextCursorMs = nextRange.startMs
          if (nextCursorMs > nextRange.endMs) nextCursorMs = nextRange.endMs
        }

        setCursorMs(Math.round(nextCursorMs))
      }
      rangeRef.current = nextRange
      wasPlayingRef.current = isPlaying
    } catch (error) {
      setLoadError(error)
    } finally {
      setIsLoading(false)
    }
  }, [enabled, windowMs, isPlaying])

  useEffect(() => {
    if (!enabled) return
    let cancelled = false

    const runLoad = () => {
      if (cancelled) return
      void loadSamples()
    }

    const id = setInterval(runLoad, REFRESH_INTERVAL_MS)
    runLoad()

    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [enabled, loadSamples, refreshKey, windowMs])

  useEffect(() => {
    if (!enabled || !isPlaying || !range?.startMs || !range?.endMs) return
    lastTickRef.current = Date.now()

    const span = range.endMs - range.startMs
    timerRef.current = setInterval(() => {
      const now = Date.now()
      const elapsed = now - lastTickRef.current
      lastTickRef.current = now

      if (span <= 0) {
        setCursorMs(range.startMs)
        return
      }

      setCursorMs(prev => {
        const next = prev + elapsed * speedMultiplier
        if (next > range.endMs) {
          return range.startMs + ((next - range.startMs) % span)
        }
        return next
      })
    }, TICK_INTERVAL_MS)

    return () => clearInterval(timerRef.current)
  }, [enabled, isPlaying, range, speedMultiplier])

  useEffect(() => {
    cursorMsRef.current = cursorMs
  }, [cursorMs])

  const groupedByIcao = useMemo(() => buildFlightsByIcao(samples), [samples])

  const latestByIcao = useMemo(() => {
    const out = new Map()
    for (const [icao24, list] of groupedByIcao) {
      const latest = list[list.length - 1]
      if (latest) out.set(icao24, latest)
    }
    return out
  }, [groupedByIcao])

  const endMs = range?.endMs ?? cursorMs
  const cursorMsEffective = isPlaying ? cursorMs : endMs
  const pathLimitMs = isPlaying ? cursorMsEffective : endMs

  const activeFlights = useMemo(() => {
    if (!enabled || !range) return []

    const nowMs = pathLimitMs
    const flightList = []

    for (const [icao24, points] of groupedByIcao) {
      const lastPoint = latestBeforeOrAt(points, nowMs)
      if (!lastPoint) continue
      if (isPlaying && nowMs - lastPoint.ts > STALE_MS) continue

      const flight = makeMapFlightFromSample(lastPoint)
      if (!flight) continue
      flightList.push(flight)
      ;(() => {
        const fallback = latestByIcao.get(icao24)
        if (!fallback) return
        if (!flight.distKm && fallback.distKm) flight.distKm = fallback.distKm
      })()
    }

    return flightList
  }, [enabled, groupedByIcao, pathLimitMs, range, isPlaying, latestByIcao])

  const trackByIcao = useMemo(() => {
    if (!enabled || !range) return new Map()
    const out = new Map()
    for (const [icao24, points] of groupedByIcao) {
      const slice = points.filter(point => point.ts <= pathLimitMs)
      if (!slice.length) continue
      out.set(icao24, {
        ...convertSamplesToTrack(slice),
        callsign: slice[slice.length - 1].callsign,
        icao24,
      })
    }
    return out
  }, [enabled, groupedByIcao, pathLimitMs, range])

  const pathFeatures = useMemo(() => {
    if (!enabled || !range) return { type: 'FeatureCollection', features: [] }

    return pathLinesFromMap(groupedByIcao, pathLimitMs)
  }, [enabled, range, groupedByIcao, pathLimitMs])

  const congestion = useMemo(() => {
    if (!enabled || !range) return { type: 'FeatureCollection', features: [] }
    return congestionPointsFromFlights(activeFlights)
  }, [activeFlights, enabled, range])

  const hasData = !isLoading && !!range && activeFlights.length > 0

  return {
    isLoading,
    isReady: !!range,
    loadError,
    samples,
    hasData,
    activeFlights,
    trackByIcao,
    latestByIcao,
    pathFeatures,
    congestion,
    isPlaying,
    cursorMs: pathLimitMs,
    range,
  }
}
