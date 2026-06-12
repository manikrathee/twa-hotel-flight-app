import { useEffect, useRef, useCallback, useMemo, useState } from 'react'
import { gsap } from 'gsap'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { INITIAL_VIEW, JFK_RUNWAYS, MAP_STYLE, RUNWAY_LABELS, TWA_HOTEL } from './flightMapConfig'
import {
  buildPlaneFeatures,
  buildPlaneSourceDiff,
  createPlaneImageData,
  buildPlanePopupText,
  getTrackCoordinates,
  PLANE_ICON_TYPES,
  buildOverlayPadding,
  resolveRecenterDecision,
  planeFeatureStateMap,
} from './flightMapHelpers'
import { bearingDeg, distanceKm } from '../utils/geo'
import { JFK } from '../config/airspace'

const JFK_LNGLAT = [JFK.lon, JFK.lat]

const FALLBACK_THEME = {
  cyanRgb: '112, 201, 227',
  cyanAltRgb: '0, 195, 255',
  redAltRgb: '227, 30, 38',
  amberRgb: '243, 190, 124',
  textSoftRgb: '84, 96, 112',
}
const PLANE_ICON_SIZE_VARIANTS = PLANE_ICON_TYPES
const PULSE_RING_SIZE = 68

const PLANE_ICON_SIZE_STOPS = [
  [4, 0.092],
  [8, 0.122],
  [10, 0.154],
  [12, 0.196],
  [14, 0.25],
  [16, 0.318],
  [18, 0.404],
  [20, 0.49],
]

const PLANE_ICON_SELECTED_SIZE_STOPS = [
  [4, 0.108],
  [8, 0.144],
  [10, 0.182],
  [12, 0.232],
  [14, 0.294],
  [16, 0.372],
  [18, 0.466],
  [20, 0.556],
]

const PLANE_LABEL_SIZE_STOPS = [
  [10, 9.9],
  [12, 10.8],
  [14, 11.8],
  [16, 12.9],
  [18, 13.8],
  [20, 14.6],
]

const PLANE_LABEL_SELECTED_SIZE_STOPS = [
  [10, 10.5],
  [12, 11.7],
  [14, 12.9],
  [16, 14.2],
  [18, 15.2],
  [20, 16],
]

const PLANE_ICON_SORT_KEY = [
  'match',
  ['get', 'planeTypeKey'],
  'a320',
  12,
  'b737',
  12,
  'b777',
  12,
  'a350',
  12,
  'a380',
  12,
  8,
]
const PLANE_ICON_SELECTED_SORT_KEY = 16
const PLANE_LABEL_SORT_KEY = 1
const PLANE_LABEL_SELECTED_SORT_KEY = 4
const PLANE_ICON_HALO_WIDTH_EXPR = [
  'match',
  ['get', 'planeTypeKey'],
  'a320',
  2.05,
  'b737',
  2.05,
  'b777',
  2.2,
  'a350',
  2.2,
  'a380',
  2.45,
  1.25,
]
const PLANE_ICON_HALO_BLUR_EXPR = [
  'match',
  ['get', 'planeTypeKey'],
  'a320',
  0.62,
  'b737',
  0.62,
  'b777',
  0.65,
  'a350',
  0.64,
  'a380',
  0.68,
  0.45,
]
const PLANE_LABEL_HALO_WIDTH_EXPR = [
  'match',
  ['get', 'planeTypeKey'],
  'a380',
  1.6,
  1.33,
]
const PLANE_LABEL_MIN_ZOOM = 11.4
const PLANE_LABEL_COMPACT_MAX_ZOOM = 13.4
const PLANE_LABEL_EXPANDED_MIN_ZOOM = PLANE_LABEL_COMPACT_MAX_ZOOM + 0.01
const HIGH_DENSITY_LABEL_SUPPRESSION_COUNT = 14
const RUNWAY_WIDTH_SCALE_EXPR = ['/', ['coalesce', ['get', 'width'], 150], 150]
function buildRunwayWidthExpression(stops, base = 1.16) {
  return [
    'interpolate',
    ['exponential', base],
    ['zoom'],
    ...stops.flatMap(([zoom, width]) => [zoom, ['*', width, RUNWAY_WIDTH_SCALE_EXPR]]),
  ]
}
const RUNWAY_GLOW_WIDTH_EXPR = buildRunwayWidthExpression([[8, 24], [10, 36], [12, 54], [14, 74], [16, 102], [18, 138], [20, 176]])
const RUNWAY_SURFACE_WIDTH_EXPR = buildRunwayWidthExpression([[8, 10], [10, 16], [12, 24], [14, 36], [16, 52], [18, 72], [20, 92]])
const RUNWAY_CENTER_WIDTH_EXPR = buildRunwayWidthExpression([[8, 1.0], [10, 1.35], [12, 1.9], [14, 2.8], [16, 4.0], [18, 5.8], [20, 7.6]])
const RUNWAY_GLOW_BLUR_EXPR = ['interpolate', ['exponential', 1.12], ['zoom'], 8, 2.8, 12, 4.8, 16, 7.2, 20, 9.2]
const RUNWAY_FOCUS_GLOW_WIDTH_EXPR = ['interpolate', ['exponential', 1.18], ['zoom'], 8, 22, 10, 34, 12, 48, 14, 62, 16, 78, 18, 96, 20, 116]
const RUNWAY_FOCUS_CORE_WIDTH_EXPR = ['interpolate', ['exponential', 1.18], ['zoom'], 8, 7.4, 10, 11.2, 12, 16.4, 14, 22.6, 16, 31.4, 18, 42.4, 20, 54]

function buildZoomSizeExpression(stops) {
  const zoomParts = stops.flatMap(([zoom, size]) => [
    zoom,
    ['*', size, ['coalesce', ['get', 'iconScale'], 1]],
  ])
  return ['interpolate', ['exponential', 1.22], ['zoom'], ...zoomParts]
}

const PLANE_ICON_SIZE_EXPR = buildZoomSizeExpression(PLANE_ICON_SIZE_STOPS)
const PLANE_ICON_SELECTED_SIZE_EXPR = buildZoomSizeExpression(PLANE_ICON_SELECTED_SIZE_STOPS)
const PLANE_LABEL_SIZE_EXPR = buildZoomSizeExpression(PLANE_LABEL_SIZE_STOPS)
const PLANE_LABEL_SELECTED_SIZE_EXPR = buildZoomSizeExpression(PLANE_LABEL_SELECTED_SIZE_STOPS)

const PLANE_LABEL_COMPACT_TEXT = ['coalesce', ['get', 'labelCompact'], ['get', 'identifier'], '']
const PLANE_LABEL_EXPANDED_TEXT = ['coalesce', ['get', 'labelExpanded'], ['get', 'labelCompact'], ['get', 'identifier'], '']
const PLANE_LABEL_TEXT_OVERLAP_ALLOW = false
const PLANE_LABEL_TEXT_OVERLAP_IGNORE = false

function resolveThemeRGB(cssVar, fallback) {
  if (typeof document === 'undefined') return fallback
  const value = getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim()
  return value || fallback
}

const EMPTY_GEOJSON = { type: 'FeatureCollection', features: [] }
function normalizeCoordinate(value) {
  if (value === null || value === undefined) return null
  const raw = typeof value === 'string' ? value.trim() : value
  if (raw === '') return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

function normalizeLngLat(lng, lat) {
  const normalizedLng = normalizeCoordinate(lng)
  const normalizedLat = normalizeCoordinate(lat)
  if (normalizedLng == null || normalizedLat == null) return null

  const wrappedLng = (((normalizedLng + 180) % 360) + 360) % 360 - 180
  const clampedLat = Math.max(-89.999999, Math.min(89.999999, normalizedLat))
  return [wrappedLng, clampedLat]
}

const RUNWAY_INCOMING = {
  maxLineDistanceKm: 1.55,
  maxEndpointDistanceKm: 4,
  headingToleranceDeg: 40,
  maxAltitudeM: 7000,
  minSpeedMs: 20,
}

function toRadians(deg) {
  return (deg * Math.PI) / 180
}

function toDegrees(rad) {
  return (rad * 180) / Math.PI
}

function resolveSelectedAltitudeLift(flight) {
  const altitudeM = Number(flight?.baro_altitude ?? flight?.geo_altitude)
  if (!Number.isFinite(altitudeM) || flight?.on_ground) return 0
  const altitudeFt = altitudeM * 3.28084
  if (altitudeFt <= 80) return 0
  const maxLift = altitudeFt < 2500 ? 42 : 24
  return Math.max(0, Math.min(maxLift, altitudeFt / 170))
}

function resolveAdaptivePitch(zoom, flight) {
  const safeZoom = Number.isFinite(zoom) ? zoom : INITIAL_VIEW.zoom
  const altitudeM = Number(flight?.baro_altitude ?? flight?.geo_altitude)
  const isLowAltitude = !flight?.on_ground && Number.isFinite(altitudeM) && altitudeM < 2200
  if (isLowAltitude) {
    return Math.max(56, Math.min(74, 37 + (safeZoom * 2.2)))
  }
  return Math.max(48, Math.min(64, 35 + (safeZoom * 1.55)))
}

function destinationPoint(lng, lat, bearing, distanceKm) {
  if (![lng, lat, bearing, distanceKm].every(Number.isFinite)) return [lng, lat]
  const radiusKm = 6371
  const angularDistance = distanceKm / radiusKm
  const heading = toRadians(bearing)
  const lat1 = toRadians(lat)
  const lon1 = toRadians(lng)
  const sinLat1 = Math.sin(lat1)
  const cosLat1 = Math.cos(lat1)
  const sinAngular = Math.sin(angularDistance)
  const cosAngular = Math.cos(angularDistance)
  const lat2 = Math.asin((sinLat1 * cosAngular) + (cosLat1 * sinAngular * Math.cos(heading)))
  const lon2 = lon1 + Math.atan2(
    Math.sin(heading) * sinAngular * cosLat1,
    cosAngular - (sinLat1 * Math.sin(lat2)),
  )

  return [(((toDegrees(lon2) + 180) % 360) + 360) % 360 - 180, toDegrees(lat2)]
}

function buildTailCurveCoordinates(baseCoords, currentLng, currentLat, heading) {
  if (!Array.isArray(baseCoords) || !baseCoords.length) return []
  if (!Number.isFinite(currentLng) || !Number.isFinite(currentLat)) return []

  const last = baseCoords[baseCoords.length - 1]
  if (!Array.isArray(last) || last.length < 2) {
    return []
  }

  const gapKm = distanceKm(currentLat, currentLng, last[1], last[0])
  if (!Number.isFinite(gapKm) || gapKm < 0.008) return []

  const tailAnchor = Number.isFinite(heading)
    ? destinationPoint(currentLng, currentLat, (heading + 180) % 360, Math.min(0.18, Math.max(0.05, gapKm * 0.24)))
    : [currentLng, currentLat]
  const control = [
    last[0] + ((tailAnchor[0] - last[0]) * 0.58),
    last[1] + ((tailAnchor[1] - last[1]) * 0.58),
  ]

  return [last, control, tailAnchor, [currentLng, currentLat]]
}

function normalizeRunwayId(value) {
  return String(value ?? '').trim().toUpperCase()
}

function resolveRunwayFeature(runwayIdOrLabel) {
  const target = normalizeRunwayId(runwayIdOrLabel)
  if (!target) return null

  return JFK_RUNWAYS.features.find((feature) => {
    const runwayId = normalizeRunwayId(feature?.properties?.id)
    return runwayId === target || runwayId.split('/').includes(target)
  }) || null
}

function interpolateLngLat(start, end, factor) {
  return [
    start[0] + ((end[0] - start[0]) * factor),
    start[1] + ((end[1] - start[1]) * factor),
  ]
}

function buildRunwayFocusView(runwayFeature) {
  const coords = runwayFeature?.geometry?.coordinates
  if (!Array.isArray(coords) || coords.length < 2) return null

  const [start, end] = coords
  const twaDistanceToStart = distanceKm(TWA_HOTEL[1], TWA_HOTEL[0], start[1], start[0])
  const twaDistanceToEnd = distanceKm(TWA_HOTEL[1], TWA_HOTEL[0], end[1], end[0])
  const near = twaDistanceToStart <= twaDistanceToEnd ? start : end
  const far = near === start ? end : start
  const runwayBearing = bearingDeg(near[1], near[0], far[1], far[0])
  const focusPoint = interpolateLngLat(near, far, 0.4)
  const center = interpolateLngLat(TWA_HOTEL, focusPoint, 0.68)

  return {
    center,
    bearing: runwayBearing,
    zoom: 16.55,
    pitch: 76,
  }
}

function buildRunwayFocusPadding(leftPanelWidth = 0, rightPanelWidth = 0) {
  const left = Math.max(16, Math.max(0, Math.round(Number(leftPanelWidth) || 0)) + 8)
  const rightBase = Math.max(16, Math.max(0, Math.round(Number(rightPanelWidth) || 0)) + 18)

  return {
    left,
    right: Math.max(rightBase, left + 56),
    top: 16,
    bottom: 16,
  }
}

function angularDiff(a, b) {
  return Math.abs(((a - b + 540) % 360) - 180)
}

function distanceToSegmentKm(lat, lon, start, end) {
  const [startLon, startLat] = start
  const [endLon, endLat] = end
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return Infinity
  const refLat = (lat + startLat + endLat) / 3
  const cosRefLat = Math.cos(toRadians(refLat))

  const x0 = (lon - startLon) * 111_320 * cosRefLat
  const y0 = (lat - startLat) * 111_132
  const x1 = (endLon - startLon) * 111_320 * cosRefLat
  const y1 = (endLat - startLat) * 111_132

  const len2 = (x1 * x1) + (y1 * y1)
  if (!Number.isFinite(len2) || len2 === 0) return Math.hypot(x0, y0) / 1000

  let t = ((x0 * x1) + (y0 * y1)) / len2
  if (t < 0) t = 0
  if (t > 1) t = 1

  const projX = x0 - (t * x1)
  const projY = y0 - (t * y1)
  return Math.hypot(projX, projY) / 1000
}

function getIncomingRunwayFlight(runwayFeature, flights = []) {
  const coords = runwayFeature?.geometry?.coordinates
  if (!Array.isArray(coords) || coords.length < 2) return null

  const [start, end] = coords
  const startLat = start[1]
  const startLon = start[0]
  const endLat = end[1]
  const endLon = end[0]
  if (!Number.isFinite(startLat) || !Number.isFinite(startLon) || !Number.isFinite(endLat) || !Number.isFinite(endLon)) {
    return null
  }

  let bestFlight = null
  let bestScore = Infinity

  for (const flight of flights) {
    const lat = Number(flight?.latitude)
    const lon = Number(flight?.longitude)
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue
    if (flight.on_ground) continue

    const heading = Number(flight.heading)
    if (!Number.isFinite(heading)) continue
    const speed = Number(flight.velocity)
    if (!Number.isFinite(speed) || speed < RUNWAY_INCOMING.minSpeedMs) continue

    const lineDist = distanceToSegmentKm(lat, lon, start, end)
    if (!Number.isFinite(lineDist) || lineDist > RUNWAY_INCOMING.maxLineDistanceKm) continue

    const endpointDistanceStart = distanceKm(lat, lon, startLat, startLon)
    const endpointDistanceEnd = distanceKm(lat, lon, endLat, endLon)
    const endpointDistance = Math.min(endpointDistanceStart, endpointDistanceEnd)
    if (!Number.isFinite(endpointDistance) || endpointDistance > RUNWAY_INCOMING.maxEndpointDistanceKm) continue

    const altitude = Number(flight.baro_altitude ?? flight.geo_altitude)
    if (Number.isFinite(altitude) && (altitude < 40 || altitude > RUNWAY_INCOMING.maxAltitudeM)) continue

    const headingToStart = bearingDeg(lat, lon, startLat, startLon)
    const headingToEnd = bearingDeg(lat, lon, endLat, endLon)
    const deltaToStart = angularDiff(heading, headingToStart)
    const deltaToEnd = angularDiff(heading, headingToEnd)
    const headingDelta = Math.min(deltaToStart, deltaToEnd)
    if (headingDelta > RUNWAY_INCOMING.headingToleranceDeg) continue

    const score = (lineDist * 60) + (endpointDistance * 14) + headingDelta
    if (score < bestScore) {
      bestScore = score
      bestFlight = flight
    }
  }

  return bestFlight
}

function withAlpha(rgb, alpha) {
  return `rgba(${rgb}, ${alpha})`
}

function historyPathColorExpr(selectedIcao, mapTheme) {
  const fallback = [
    'case',
    ['==', ['get', 'sampleKind'], 'track'],
    withAlpha(mapTheme.redAlt, 0.52),
    withAlpha(mapTheme.cyanAlt, 0.42),
  ]
  if (!selectedIcao) return fallback
  return [
    'case',
    ['==', ['get', 'icao24'], selectedIcao],
    withAlpha(mapTheme.cyanAlt, 0.98),
    fallback,
  ]
}

function historyPathWidthExpr(selectedIcao) {
  const base = ['interpolate', ['linear'], ['coalesce', ['get', 'pointCount'], 2], 2, 1.2, 12, 2.9]
  if (!selectedIcao) return base
  return [
    'case',
    ['==', ['get', 'icao24'], selectedIcao],
    ['interpolate', ['linear'], ['coalesce', ['get', 'pointCount'], 2], 2, 1.8, 12, 3.7],
    base,
  ]
}

function historyPathOpacityExpr(selectedIcao) {
  const base = ['case',
    ['==', ['get', 'sampleKind'], 'track'],
    0.62,
    0.48,
  ]
  if (!selectedIcao) return base
  return [
    'case',
    ['==', ['get', 'icao24'], selectedIcao],
    1,
      ['case',
        ['==', ['get', 'sampleKind'], 'track'],
        0.56,
        0.44,
      ],
  ]
}

function historyPathDashExpr(selectedIcao) {
  if (!selectedIcao) return [1, 0]
  return [
    'case',
    ['==', ['get', 'icao24'], selectedIcao],
    [1, 0],
    [1, 0],
  ]
}

function jfkMarkerNode() {
  const el = document.createElement('div')
  el.className = 'jfk-airport-marker'
  el.innerHTML = `
    <div class="jfk-airport-pin">
      <span>JFK</span>
    </div>
  `
  return el
}

function normalizeFlightId(value) {
  return String(value ?? '').trim().toLowerCase()
}

function normalizeDisplayText(value, fallback) {
  const text = String(value ?? '').trim()
  return text || fallback
}

function getPlanePopupText(feature) {
  return buildPlanePopupText(feature)
}

function resolveSelectedCoords(map, selectedIcao) {
  if (!map || !selectedIcao) return null

  const target = normalizeFlightId(selectedIcao)
  const features = map.querySourceFeatures('planes')
  for (let i = 0; i < features.length; i += 1) {
    const feature = features[i]
    const featureIcao = normalizeFlightId(feature?.properties?.icao24)
    if (!featureIcao || featureIcao !== target) continue

    const coords = feature.geometry?.coordinates
    const normalized = normalizeLngLat(coords[0], coords[1])
    if (!normalized) continue

    return normalized
  }

  return null
}

function resolvePulseCoords(map, selectedIcao, selectedLng, selectedLat) {
  const fromMap = resolveSelectedCoords(map, selectedIcao)
  if (fromMap) return fromMap
  return normalizeLngLat(selectedLng, selectedLat)
}

function normalizeInitialView(raw) {
  const center = normalizeLngLat(raw?.center?.[0], raw?.center?.[1])
  if (!center) return INITIAL_VIEW

  const zoom = Number(raw?.zoom)
  const pitch = Number(raw?.pitch)
  const bearing = Number(raw?.bearing)

  return {
    ...INITIAL_VIEW,
    center,
    zoom: Number.isFinite(zoom) ? zoom : INITIAL_VIEW.zoom,
    pitch: Number.isFinite(pitch) ? pitch : INITIAL_VIEW.pitch,
    bearing: Number.isFinite(bearing) ? bearing : INITIAL_VIEW.bearing,
  }
}
export default function FlightMap({
  flights,
  selectedFlight,
  selectedRunwayId = null,
  onSelect,
  onRunwaySelect,
  onHistorySelect,
  track,
  initialView = INITIAL_VIEW,
  historyPathFeatures,
  congestionFeatures,
  timeline,
  leftPanelWidth = 0,
  rightPanelWidth = 0,
}) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const isLoadedRef = useRef(false)
  const pulseMarkerRef = useRef(null)
  const pulseCoordsRef = useRef(null)
  const pulseTimelineRef = useRef(null)
  const pulseMoveTweenRef = useRef(null)
  const pulseAnimatedCoordRef = useRef(null)
  const selectedOverlayNodesRef = useRef({ title: null, detail: null, status: null })
  const selectedVisualRef = useRef({ root: null, stem: null, glow: null, coreGlow: null, card: null, cardBase: null, shadow: null })
  const selectedOverlayLinesRef = useRef({ title: '', detail: '', status: '' })
  const jfkMarkerRef = useRef(null)
  const runwayFocusTimerRef = useRef(null)
  const onHistorySelectRef = useRef(null)
  const prevPlaneStateRef = useRef(null)
  const onRunwaySelectRef = useRef(onRunwaySelect)
  const flightsRef = useRef(flights)
  const onSelectRef = useRef(onSelect)
  const lastPlaneSelectRef = useRef({ key: '', ts: 0 })
  const lastAutoFollowMsRef = useRef(0)
  const lastFollowIcaoRef = useRef(null)
  const lastOverlayPaddingRef = useRef({ left: 0, right: 0 })
  const userCameraGestureRef = useRef(false)
  const [mapReady, setMapReady] = useState(false)
  const selectedFlightForMap = useMemo(() => {
    if (!selectedFlight?.icao24) return null
    const target = normalizeFlightId(selectedFlight.icao24)
    return flights.find(f => normalizeFlightId(f.icao24) === target) || selectedFlight
  }, [flights, selectedFlight])
  const selectedFlightForTracking = selectedFlightForMap || selectedFlight
  const selectedIcao = selectedFlightForTracking?.icao24 ?? null
  const selectedIcaoNormalized = normalizeFlightId(selectedIcao)
  const suppressInactiveLabels = flights.length >= HIGH_DENSITY_LABEL_SUPPRESSION_COUNT
  const selectedLng = selectedFlightForTracking?.longitude
  const selectedLat = selectedFlightForTracking?.latitude
  const theme = {
    cyan: resolveThemeRGB('--cyan-rgb', FALLBACK_THEME.cyanRgb),
    cyanAlt: resolveThemeRGB('--cyan-alt-rgb', FALLBACK_THEME.cyanAltRgb),
    redAlt: resolveThemeRGB('--red-alt-rgb', FALLBACK_THEME.redAltRgb),
    amber: resolveThemeRGB('--amber-rgb', FALLBACK_THEME.amberRgb),
    textSoft: resolveThemeRGB('--text-soft-rgb', FALLBACK_THEME.textSoftRgb),
  }
  const themeCyan = theme.cyan
  const themeCyanAlt = theme.cyanAlt
  const themeRedAlt = theme.redAlt
  const themeAmber = theme.amber
  const themeTextSoft = theme.textSoft
  const initialCameraView = useMemo(() => normalizeInitialView(initialView), [initialView])
  const initialViewRef = useRef(initialCameraView)
  const selectedFlightFeature = useMemo(() => {
    if (!selectedFlightForTracking) return null
    return buildPlaneFeatures([selectedFlightForTracking], selectedIcao)?.[0] ?? null
  }, [selectedFlightForTracking, selectedIcao])
  const selectedOverlayLines = useMemo(() => {
    const popupText = selectedFlightFeature ? buildPlanePopupText(selectedFlightFeature) : ''
    const [title = '', detail = '', status = ''] = popupText.split('\n')
    return { title, detail, status }
  }, [selectedFlightFeature])
  selectedOverlayLinesRef.current = selectedOverlayLines
  const mapThemeRef = useRef({
    cyan: themeCyan,
    cyanAlt: themeCyanAlt,
    amber: themeAmber,
    redAlt: themeRedAlt,
    textSoft: themeTextSoft,
  })
  useEffect(() => {
    mapThemeRef.current = {
      cyan: themeCyan,
      cyanAlt: themeCyanAlt,
      amber: themeAmber,
      redAlt: themeRedAlt,
      textSoft: themeTextSoft,
    }
  }, [themeCyan, themeCyanAlt, themeAmber, themeRedAlt, themeTextSoft])

  useEffect(() => { onSelectRef.current = onSelect }, [onSelect])
  useEffect(() => { onRunwaySelectRef.current = onRunwaySelect }, [onRunwaySelect])
  useEffect(() => { onHistorySelectRef.current = onHistorySelect }, [onHistorySelect])
  useEffect(() => { flightsRef.current = flights }, [flights])

  // Init map once
  useEffect(() => {
    if (mapRef.current || !containerRef.current) return
    const mapTheme = mapThemeRef.current

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      ...initialViewRef.current,
      attributionControl: false,
      maxPitch: 85,
    })

    map.on('load', () => {
      PLANE_ICON_SIZE_VARIANTS.forEach(type => {
        map.addImage(`plane-icon-${type}`, createPlaneImageData(type), { sdf: true })
      })

      // ── Runway layers ──────────────────────────────────────────────
      map.addSource('runways', { type: 'geojson', data: JFK_RUNWAYS })

      // Thick glow bg
      map.addLayer({
        id: 'runways-glow',
        type: 'line',
        source: 'runways',
        layout: { 'line-cap': 'square' },
        paint: {
          'line-color': withAlpha(mapTheme.textSoft, 0.14),
          'line-width': RUNWAY_GLOW_WIDTH_EXPR,
          'line-blur': RUNWAY_GLOW_BLUR_EXPR,
        },
      })
      // Paved surface
      map.addLayer({
        id: 'runways-surface',
        type: 'line',
        source: 'runways',
        layout: { 'line-cap': 'square' },
        paint: {
          'line-color': [
            'match',
            ['get', 'surface'],
            'ASPH', withAlpha(mapTheme.amber, 0.8),
            withAlpha(mapTheme.cyanAlt, 0.34),
          ],
          'line-width': RUNWAY_SURFACE_WIDTH_EXPR,
        },
      })
      // Centerline dashes
      map.addLayer({
        id: 'runways-center',
        type: 'line',
        source: 'runways',
        paint: {
          'line-color': withAlpha(mapTheme.textSoft, 0.7),
          'line-width': RUNWAY_CENTER_WIDTH_EXPR,
          'line-dasharray': [12, 10],
        },
      })

      map.addSource('runway-focus', {
        type: 'geojson',
        data: EMPTY_GEOJSON,
      })
      map.addLayer({
        id: 'runway-focus-glow',
        type: 'line',
        source: 'runway-focus',
        layout: { 'line-cap': 'square' },
        paint: {
          'line-color': withAlpha(mapTheme.cyanAlt, 0.22),
          'line-width': RUNWAY_FOCUS_GLOW_WIDTH_EXPR,
          'line-blur': 1.8,
          'line-opacity': 0.78,
        },
      })
      map.addLayer({
        id: 'runway-focus-core',
        type: 'line',
        source: 'runway-focus',
        layout: { 'line-cap': 'square' },
        paint: {
          'line-color': withAlpha(mapTheme.cyanAlt, 0.98),
          'line-width': RUNWAY_FOCUS_CORE_WIDTH_EXPR,
          'line-opacity': 0.94,
        },
      })

      // Runway threshold labels (DOM elements — avoids glyph server dependency)
      RUNWAY_LABELS.features.forEach(f => {
        const el = document.createElement('div')
        el.textContent = f.properties.label
        el.style.cssText = [
          'color:rgba(var(--text-soft-rgb), 0.98)',
          'font-family:var(--font-mono)',
          'font-size:10px',
          'font-weight:700',
          'letter-spacing:1px',
          'pointer-events:auto',
          'cursor:pointer',
          'padding:6px 8px',
          'border-radius:10px',
          'background:rgba(6, 10, 18, 0.42)',
          'border:1px solid rgba(var(--cyan-alt-rgb), 0.14)',
          'backdrop-filter:blur(12px)',
          'box-shadow:0 10px 22px rgba(0,0,0,0.22)',
          'text-shadow:0 0 6px rgba(0,0,0,0.8)',
          'white-space:nowrap',
        ].join(';')
        el.addEventListener('click', (event) => {
          event.stopPropagation()
          const runwayFeature = resolveRunwayFeature(f.properties.label)
          if (!runwayFeature) return
          const incomingFlight = getIncomingRunwayFlight(runwayFeature, flightsRef.current)
          onRunwaySelectRef.current?.({
            runwayId: runwayFeature.properties?.id,
            runwayLabel: runwayFeature.properties?.id,
            flightId: incomingFlight?.icao24 ?? null,
            flightLabel: incomingFlight ? normalizeDisplayText(incomingFlight.callsign, incomingFlight.icao24) : null,
          })
        })
        new maplibregl.Marker({ element: el, anchor: 'center' })
          .setLngLat(f.geometry.coordinates)
          .addTo(map)
      })

      // ── Flight path ─────────────────────────────────────────────────
      map.addSource('path', {
        type: 'geojson',
        lineMetrics: true,
        data: { type: 'FeatureCollection', features: [] },
      })
      map.addLayer({
        id: 'path-line',
        type: 'line',
        source: 'path',
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': withAlpha(mapTheme.cyanAlt, 0.96),
          'line-width': ['interpolate', ['exponential', 1.16], ['zoom'], 10, 1.8, 12, 2.4, 14, 3.2, 16, 4.6, 18, 6.2, 20, 7.2],
          'line-opacity': 0.92,
          'line-blur': ['interpolate', ['linear'], ['zoom'], 10, 0.2, 16, 0.7, 20, 1.2],
          'line-gradient': [
            'interpolate',
            ['linear'],
            ['line-progress'],
            0,
            withAlpha(mapTheme.cyanAlt, 0.06),
            0.58,
            withAlpha(mapTheme.cyanAlt, 0.34),
            0.86,
            withAlpha(mapTheme.cyanAlt, 0.72),
            1,
            withAlpha(mapTheme.cyanAlt, 0.98),
          ],
        },
      })
      map.addSource('path-connector', {
        type: 'geojson',
        lineMetrics: true,
        data: { type: 'FeatureCollection', features: [] },
      })
      map.addLayer({
        id: 'path-connector-line',
        type: 'line',
        source: 'path-connector',
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': withAlpha(mapTheme.cyanAlt, 0.98),
          'line-width': ['interpolate', ['exponential', 1.14], ['zoom'], 10, 1.2, 12, 1.7, 14, 2.4, 16, 3.2, 18, 4.2, 20, 5.0],
          'line-opacity': 0.82,
          'line-blur': ['interpolate', ['linear'], ['zoom'], 10, 0.12, 16, 0.45, 20, 0.78],
          'line-gradient': [
            'interpolate',
            ['linear'],
            ['line-progress'],
            0,
            withAlpha(mapTheme.cyanAlt, 0.16),
            0.55,
            withAlpha(mapTheme.cyanAlt, 0.48),
            1,
            withAlpha(mapTheme.cyanAlt, 0.96),
          ],
        },
      })

      map.addSource('history-paths', {
        type: 'geojson',
        data: EMPTY_GEOJSON,
      })
      map.addLayer({
        id: 'history-paths-line',
        type: 'line',
        source: 'history-paths',
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
          visibility: 'visible',
        },
        paint: {
          'line-color': historyPathColorExpr(null, mapTheme),
          'line-width': historyPathWidthExpr(null),
          'line-opacity': historyPathOpacityExpr(null),
          'line-dasharray': historyPathDashExpr(null),
        },
      })

      map.addSource('congestion', {
        type: 'geojson',
        data: EMPTY_GEOJSON,
      })
      map.addLayer({
        id: 'congestion-heat',
        type: 'circle',
        source: 'congestion',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['get', 'count'], 1, 5, 8, 16, 20, 30],
          'circle-color': [
            'interpolate',
            ['linear'],
            ['get', 'count'],
            1,
            `rgba(${mapTheme.cyan}, 0.22)`,
            8,
            `rgba(${mapTheme.amber}, 0.35)`,
            20,
            `rgba(${mapTheme.redAlt}, 0.55)`,
          ],
          'circle-opacity': ['interpolate', ['linear'], ['get', 'count'], 1, 0.16, 20, 0.45],
          'circle-stroke-width': 0,
        },
      })

      // ── Planes source + layer ───────────────────────────────────────
      map.addSource('planes', {
        type: 'geojson',
        promoteId: 'icao24',
        data: { type: 'FeatureCollection', features: [] },
      })
      map.addLayer({
        id: 'planes-layer',
        type: 'symbol',
        source: 'planes',
        filter: ['!=', ['get', 'selected'], true],
        layout: {
          'symbol-sort-key': PLANE_ICON_SORT_KEY,
          'icon-image': ['coalesce', ['get', 'planeIcon'], 'plane-icon-narrowbody'],
          'icon-anchor': 'center',
          'icon-size': PLANE_ICON_SIZE_EXPR,
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
          'symbol-z-order': 'viewport-y',
          'icon-rotate': ['coalesce', ['get', 'heading'], 0],
          'icon-rotation-alignment': 'map',
          'icon-pitch-alignment': 'map',
          },
        paint: {
          'icon-color': [
            'match',
            ['get', 'climbStatus'],
            'CLIMB', withAlpha(mapTheme.cyan, 0.93),
            'DESC', withAlpha(mapTheme.amber, 0.9),
            withAlpha(mapTheme.textSoft, 0.86),
          ],
          'icon-halo-color': [
            'match',
            ['get', 'climbStatus'],
            'CLIMB', withAlpha(mapTheme.cyan, 0.28),
            'DESC', withAlpha(mapTheme.amber, 0.28),
            withAlpha(mapTheme.textSoft, 0.2),
          ],
          'icon-halo-width': PLANE_ICON_HALO_WIDTH_EXPR,
          'icon-halo-blur': PLANE_ICON_HALO_BLUR_EXPR,
        },
      })

      map.addLayer({
        id: 'planes-selected-layer',
        type: 'symbol',
        source: 'planes',
        filter: ['==', ['get', 'selected'], true],
        layout: {
          'symbol-sort-key': PLANE_ICON_SELECTED_SORT_KEY,
          'icon-image': ['coalesce', ['get', 'planeIcon'], 'plane-icon-narrowbody'],
          'icon-anchor': 'center',
          'icon-size': PLANE_ICON_SELECTED_SIZE_EXPR,
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
          'symbol-z-order': 'viewport-y',
          'icon-rotate': ['coalesce', ['get', 'heading'], 0],
          'icon-rotation-alignment': 'map',
          'icon-pitch-alignment': 'map',
        },
        paint: {
          'icon-color': withAlpha(mapTheme.cyanAlt, 1),
          'icon-halo-color': withAlpha(mapTheme.cyanAlt, 0),
          'icon-halo-width': 0,
          'icon-halo-blur': 0,
        },
      })

      map.addLayer({
        id: 'planes-labels-layer',
        type: 'symbol',
        source: 'planes',
        filter: ['all', ['!=', ['get', 'selected'], true], ['==', ['get', 'showInactiveLabel'], true]],
        minzoom: PLANE_LABEL_MIN_ZOOM,
        maxzoom: PLANE_LABEL_EXPANDED_MIN_ZOOM,
        layout: {
          'symbol-sort-key': PLANE_LABEL_SORT_KEY,
          'text-field': PLANE_LABEL_COMPACT_TEXT,
          'text-font': ['literal', ['JetBrains Mono', 'monospace']],
          'text-allow-overlap': PLANE_LABEL_TEXT_OVERLAP_ALLOW,
          'text-ignore-placement': PLANE_LABEL_TEXT_OVERLAP_IGNORE,
          'text-size': PLANE_LABEL_SIZE_EXPR,
          'text-offset': [0, 2.0],
          'text-anchor': 'top',
          'text-variable-anchor': ['top', 'top-right', 'top-left', 'right', 'left'],
          'text-max-width': 10,
          'text-letter-spacing': 0.008,
          'text-line-height': 1.04,
          'text-padding': 2,
          'symbol-z-order': 'viewport-y',
        },
        paint: {
          'text-color': [
            'match',
            ['get', 'climbStatus'],
            'CLIMB', withAlpha(mapTheme.cyan, 0.92),
            'DESC', withAlpha(mapTheme.amber, 0.94),
            withAlpha(mapTheme.textSoft, 0.94),
          ],
          'text-halo-color': [
            'match',
            ['get', 'climbStatus'],
            'CLIMB', withAlpha(mapTheme.cyan, 0.22),
            'DESC', withAlpha(mapTheme.amber, 0.18),
            withAlpha(mapTheme.textSoft, 0.18),
          ],
          'text-halo-width': PLANE_LABEL_HALO_WIDTH_EXPR,
          'text-halo-blur': 0.58,
        },
      })

      map.addLayer({
        id: 'planes-labels-layer-expanded',
        type: 'symbol',
        source: 'planes',
        filter: ['all', ['!=', ['get', 'selected'], true], ['==', ['get', 'showInactiveExpandedLabel'], true]],
        minzoom: PLANE_LABEL_EXPANDED_MIN_ZOOM,
        maxzoom: 24,
        layout: {
          'symbol-sort-key': PLANE_LABEL_SORT_KEY,
          'text-field': PLANE_LABEL_EXPANDED_TEXT,
          'text-font': ['literal', ['JetBrains Mono', 'monospace']],
          'text-allow-overlap': PLANE_LABEL_TEXT_OVERLAP_ALLOW,
          'text-ignore-placement': PLANE_LABEL_TEXT_OVERLAP_IGNORE,
          'text-size': PLANE_LABEL_SIZE_EXPR,
          'text-offset': [0, 2.0],
          'text-anchor': 'top',
          'text-variable-anchor': ['top', 'top-right', 'top-left', 'right', 'left'],
          'text-max-width': 11,
          'text-letter-spacing': 0.008,
          'text-line-height': 1.04,
          'text-padding': 2,
          'symbol-z-order': 'viewport-y',
        },
        paint: {
          'text-color': [
            'match',
            ['get', 'climbStatus'],
            'CLIMB', withAlpha(mapTheme.cyan, 0.92),
            'DESC', withAlpha(mapTheme.amber, 0.94),
            withAlpha(mapTheme.textSoft, 0.94),
          ],
          'text-halo-color': [
            'match',
            ['get', 'climbStatus'],
            'CLIMB', withAlpha(mapTheme.cyan, 0.22),
            'DESC', withAlpha(mapTheme.amber, 0.18),
            withAlpha(mapTheme.textSoft, 0.18),
          ],
          'text-halo-width': PLANE_LABEL_HALO_WIDTH_EXPR,
          'text-halo-blur': 0.58,
        },
      })

      map.addLayer({
        id: 'planes-labels-selected-compact-layer',
        type: 'symbol',
        source: 'planes',
        filter: ['==', ['get', 'selected'], true],
        minzoom: PLANE_LABEL_MIN_ZOOM,
        maxzoom: PLANE_LABEL_EXPANDED_MIN_ZOOM,
        layout: {
          'symbol-sort-key': PLANE_LABEL_SELECTED_SORT_KEY,
          'text-field': PLANE_LABEL_COMPACT_TEXT,
          'text-font': ['literal', ['JetBrains Mono', 'monospace']],
          'text-allow-overlap': true,
          'text-ignore-placement': true,
          'text-size': PLANE_LABEL_SIZE_EXPR,
          'text-offset': [0, 2.0],
          'text-anchor': 'top',
          'text-variable-anchor': ['top', 'top-right', 'top-left', 'right', 'left'],
          'text-max-width': 10,
          'text-letter-spacing': 0.008,
          'text-line-height': 1.04,
          'text-padding': 2,
          'symbol-z-order': 'viewport-y',
        },
        paint: {
          'text-color': withAlpha(mapTheme.cyanAlt, 1),
          'text-halo-color': withAlpha(mapTheme.cyanAlt, 0.34),
          'text-halo-width': 1.9,
          'text-halo-blur': 0.66,
          'text-opacity': 0,
        },
      })

      map.addLayer({
        id: 'planes-labels-selected-layer',
        type: 'symbol',
        source: 'planes',
        filter: ['==', ['get', 'selected'], true],
        minzoom: PLANE_LABEL_EXPANDED_MIN_ZOOM,
        maxzoom: 24,
        layout: {
          'symbol-sort-key': PLANE_LABEL_SELECTED_SORT_KEY,
          'text-field': PLANE_LABEL_EXPANDED_TEXT,
          'text-font': ['literal', ['JetBrains Mono', 'monospace']],
          'text-allow-overlap': true,
          'text-ignore-placement': true,
          'text-size': PLANE_LABEL_SELECTED_SIZE_EXPR,
          'text-offset': [0, 2.0],
          'text-anchor': 'top',
          'text-variable-anchor': ['top', 'top-right', 'top-left', 'right', 'left'],
          'text-max-width': 11,
          'text-letter-spacing': 0.008,
          'text-line-height': 1.04,
          'text-padding': 2,
          'symbol-z-order': 'viewport-y',
        },
        paint: {
          'text-color': withAlpha(mapTheme.cyanAlt, 1),
          'text-halo-color': withAlpha(mapTheme.cyanAlt, 0.34),
          'text-halo-width': 1.9,
          'text-halo-blur': 0.66,
          'text-opacity': 0,
        },
      })

      // ── TWA Hotel marker ─────────────────────────────────────────────
      const hotelEl = document.createElement('div')
      hotelEl.style.cssText = [
        'width:18px', 'height:18px', 'border-radius:50%',
        `border:2px solid rgba(${mapTheme.redAlt},1)`,
        `background:${withAlpha(mapTheme.redAlt, 0.18)}`,
        `box-shadow:0 0 14px ${withAlpha(mapTheme.redAlt, 0.55)},0 0 4px ${withAlpha(mapTheme.redAlt, 0.75)}`,
        'cursor:default', 'pointer-events:none',
      ].join(';')
      new maplibregl.Marker({ element: hotelEl, anchor: 'center' })
        .setLngLat(TWA_HOTEL)
        .setPopup(new maplibregl.Popup({ closeButton: false, className: 'twa-popup' })
          .setText('TWA Hotel · KJFK'))
        .addTo(map)

      const jfkEl = jfkMarkerNode()
      jfkMarkerRef.current = new maplibregl.Marker({ element: jfkEl, anchor: 'bottom', offset: [0, -18] })
        .setLngLat(JFK_LNGLAT)
        .addTo(map)

      // ── Hover tooltip popup ──────────────────────────────────────────
      let hoverDismissTimer = null
      let hoveredPlaneKey = ''
      const hoverPopup = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        className: 'plane-popup',
        offset: [0, -22],
      })
      const hoverCard = document.createElement('div')
      hoverCard.className = 'plane-popup-card'
      const hoverTitle = document.createElement('div')
      hoverTitle.className = 'plane-popup-title'
      const hoverDetail = document.createElement('div')
      hoverDetail.className = 'plane-popup-detail'
      const hoverStatus = document.createElement('div')
      hoverStatus.className = 'plane-popup-status'
      hoverCard.appendChild(hoverTitle)
      hoverCard.appendChild(hoverDetail)
      hoverCard.appendChild(hoverStatus)
      hoverPopup.setDOMContent(hoverCard)

      const clearHoverDismiss = () => {
        if (hoverDismissTimer) {
          clearTimeout(hoverDismissTimer)
          hoverDismissTimer = null
        }
      }

      const updateHoverPopup = (feature) => {
        if (!feature) return
        const coords = feature.geometry?.coordinates
        if (!Array.isArray(coords) || coords.length < 2) return
        const popupText = getPlanePopupText(feature)
        const [title = '', detail = '', status = ''] = popupText.split('\n')
        const planeKey = feature.properties?.icao24 || `${coords[0]}:${coords[1]}`
        if (planeKey !== hoveredPlaneKey || hoverTitle.textContent !== title) {
          hoverTitle.textContent = title
          hoverDetail.textContent = detail
          hoverStatus.textContent = status
          hoveredPlaneKey = planeKey
        }
        hoverPopup.setLngLat(coords).addTo(map)
      }

      const onPlanePointerEnter = e => {
        clearHoverDismiss()
        map.getCanvas().style.cursor = 'pointer'
        const f = e.features?.[0]
        if (!f) return
        updateHoverPopup(f)
      }
      const onPlanePointerMove = e => {
        clearHoverDismiss()
        const f = e.features?.[0]
        if (!f) {
          hoveredPlaneKey = ''
          hoverPopup.remove()
          return
        }
        updateHoverPopup(f)
      }
      const onPlanePointerLeave = () => {
        map.getCanvas().style.cursor = ''
        clearHoverDismiss()
        hoverDismissTimer = setTimeout(() => {
          hoveredPlaneKey = ''
          hoverPopup.remove()
        }, 72)
      }
      const onPlaneSelect = e => {
        const icao24 = e.features?.[0]?.properties?.icao24
        if (!icao24) return
        const point = e.point
        const pointKey = point ? `${Math.round(point.x)}:${Math.round(point.y)}` : ''
        const selectKey = `${icao24}#${pointKey}`
        const now = Date.now()
        if (lastPlaneSelectRef.current.key === selectKey && (now - lastPlaneSelectRef.current.ts) < 180) {
          return
        }
        lastPlaneSelectRef.current = { key: selectKey, ts: now }
        onSelectRef.current?.(icao24)
      }
      ;[
        'planes-layer',
        'planes-selected-layer',
        'planes-labels-layer',
        'planes-labels-layer-expanded',
        'planes-labels-selected-compact-layer',
        'planes-labels-selected-layer',
      ].forEach((layerId) => {
        map.on('mouseenter', layerId, onPlanePointerEnter)
        map.on('mousemove', layerId, onPlanePointerMove)
        map.on('mouseleave', layerId, onPlanePointerLeave)
        map.on('click', layerId, onPlaneSelect)
      })

      const onGestureStart = () => { userCameraGestureRef.current = true }
      const onPlaneGestureStart = () => {
        onGestureStart()
        clearHoverDismiss()
        hoveredPlaneKey = ''
        hoverPopup.remove()
        map.getCanvas().style.cursor = ''
      }
      const onGestureEnd = () => {
        userCameraGestureRef.current = false
        lastAutoFollowMsRef.current = Date.now()
      }
      map.on('dragstart', onPlaneGestureStart)
      map.on('movestart', onPlaneGestureStart)
      map.on('zoomstart', onPlaneGestureStart)
      map.on('rotatestart', onPlaneGestureStart)
      map.on('pitchstart', onPlaneGestureStart)
      map.on('dragend', onGestureEnd)
      map.on('zoomend', onGestureEnd)
      map.on('rotateend', onGestureEnd)
      map.on('pitchend', onGestureEnd)

      // ── Click runway to orient view and surface inbound alert ─────────
      map.on('mouseenter', 'runways-surface', () => {
        map.getCanvas().style.cursor = 'pointer'
      })
      map.on('mouseleave', 'runways-surface', () => {
        map.getCanvas().style.cursor = ''
      })
      map.on('click', 'runways-surface', e => {
        const feature = e.features?.[0]
        const coordinates = feature?.geometry?.coordinates
        if (!feature || !Array.isArray(coordinates) || coordinates.length < 2) return
        const incomingFlight = getIncomingRunwayFlight(feature, flightsRef.current)
        onRunwaySelectRef.current?.({
          runwayId: feature.properties?.id,
          runwayLabel: feature.properties?.id,
          flightId: incomingFlight?.icao24 ?? null,
          flightLabel: incomingFlight ? normalizeDisplayText(incomingFlight.callsign, incomingFlight.icao24) : null,
        })
      })

      map.on('mouseenter', 'history-paths-line', () => {
        map.getCanvas().style.cursor = 'pointer'
      })
      map.on('mouseleave', 'history-paths-line', () => {
        map.getCanvas().style.cursor = ''
      })
      map.on('click', 'history-paths-line', e => {
        const icao24 = e.features?.[0]?.properties?.icao24
        if (!icao24) return
        onHistorySelectRef.current?.(icao24)
      })

      isLoadedRef.current = true
      mapRef.current = map
      setMapReady(true)
    })

    return () => {
      isLoadedRef.current = false
      pulseTimelineRef.current?.kill()
      pulseTimelineRef.current = null
      pulseMoveTweenRef.current?.kill()
      pulseMoveTweenRef.current = null
      pulseMarkerRef.current?.remove()
      pulseMarkerRef.current = null
      pulseCoordsRef.current = null
      pulseAnimatedCoordRef.current = null
      clearTimeout(runwayFocusTimerRef.current)
      jfkMarkerRef.current?.remove()
      jfkMarkerRef.current = null
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!mapReady || !mapRef.current) return
    const map = mapRef.current

    const runwayGlow = map.getLayer('runways-glow')
    if (runwayGlow) {
      map.setPaintProperty('runways-glow', 'line-color', withAlpha(themeTextSoft, 0.14))
    }

    const runwaySurface = map.getLayer('runways-surface')
    if (runwaySurface) {
      map.setPaintProperty('runways-surface', 'line-color', [
        'match',
        ['get', 'surface'],
        'ASPH', withAlpha(themeAmber, 0.8),
        withAlpha(themeCyanAlt, 0.34),
      ])
    }

    const runwayCenter = map.getLayer('runways-center')
    if (runwayCenter) {
      map.setPaintProperty('runways-center', 'line-color', withAlpha(themeTextSoft, 0.7))
    }

    const runwayFocusGlow = map.getLayer('runway-focus-glow')
    if (runwayFocusGlow) {
      map.setPaintProperty('runway-focus-glow', 'line-color', withAlpha(themeCyanAlt, 0.22))
    }
    const runwayFocusCore = map.getLayer('runway-focus-core')
    if (runwayFocusCore) {
      map.setPaintProperty('runway-focus-core', 'line-color', withAlpha(themeCyanAlt, 0.98))
    }

    const pathLine = map.getLayer('path-line')
    if (pathLine) {
      map.setPaintProperty('path-line', 'line-color', withAlpha(themeCyanAlt, 1))
      map.setPaintProperty('path-line', 'line-gradient', [
        'interpolate',
        ['linear'],
        ['line-progress'],
        0,
        withAlpha(themeCyanAlt, 0.06),
        0.58,
        withAlpha(themeCyanAlt, 0.34),
        0.86,
        withAlpha(themeCyanAlt, 0.72),
        1,
        withAlpha(themeCyanAlt, 0.98),
      ])
    }
    const pathConnectorLine = map.getLayer('path-connector-line')
    if (pathConnectorLine) {
      map.setPaintProperty('path-connector-line', 'line-color', withAlpha(themeCyanAlt, 0.98))
      map.setPaintProperty('path-connector-line', 'line-gradient', [
        'interpolate',
        ['linear'],
        ['line-progress'],
        0,
        withAlpha(themeCyanAlt, 0.16),
        0.55,
        withAlpha(themeCyanAlt, 0.48),
        1,
        withAlpha(themeCyanAlt, 0.96),
      ])
    }

    const historyPaths = map.getLayer('history-paths-line')
    if (historyPaths) {
      map.setPaintProperty('history-paths-line', 'line-color', historyPathColorExpr(selectedIcaoNormalized, {
        redAlt: themeRedAlt,
        cyanAlt: themeCyanAlt,
      }))
      map.setPaintProperty('history-paths-line', 'line-width', historyPathWidthExpr(selectedIcaoNormalized))
      map.setPaintProperty('history-paths-line', 'line-opacity', historyPathOpacityExpr(selectedIcaoNormalized))
      map.setPaintProperty('history-paths-line', 'line-dasharray', historyPathDashExpr(selectedIcaoNormalized))
    }

    const congestion = map.getLayer('congestion-heat')
    if (congestion) {
      map.setPaintProperty('congestion-heat', 'circle-color', [
        'interpolate',
        ['linear'],
        ['get', 'count'],
        1,
        `rgba(${themeCyan}, 0.22)`,
        8,
        `rgba(${themeAmber}, 0.35)`,
        20,
        `rgba(${themeRedAlt}, 0.55)`,
      ])
    }

    const planes = map.getLayer('planes-layer')
    if (planes) {
      map.setPaintProperty('planes-layer', 'icon-color', [
        'match',
        ['get', 'climbStatus'],
        'CLIMB', withAlpha(themeCyan, 0.93),
        'DESC', withAlpha(themeAmber, 0.9),
        withAlpha(themeTextSoft, 0.86),
      ])
      map.setPaintProperty('planes-layer', 'icon-halo-color', [
        'match',
        ['get', 'climbStatus'],
        'CLIMB', withAlpha(themeCyan, 0.28),
        'DESC', withAlpha(themeAmber, 0.28),
        withAlpha(themeTextSoft, 0.2),
      ])
      map.setPaintProperty('planes-layer', 'icon-halo-width', PLANE_ICON_HALO_WIDTH_EXPR)
      map.setPaintProperty('planes-layer', 'icon-halo-blur', PLANE_ICON_HALO_BLUR_EXPR)
    }

    const selectedPlanes = map.getLayer('planes-selected-layer')
    if (selectedPlanes) {
      map.setPaintProperty('planes-selected-layer', 'icon-color', withAlpha(themeCyanAlt, 1))
      map.setPaintProperty('planes-selected-layer', 'icon-halo-color', withAlpha(themeCyanAlt, 0))
      map.setPaintProperty('planes-selected-layer', 'icon-halo-width', 0)
      map.setPaintProperty('planes-selected-layer', 'icon-halo-blur', 0)
    }

    const planesLabels = map.getLayer('planes-labels-layer')
    if (planesLabels) {
      map.setPaintProperty('planes-labels-layer', 'text-color', [
        'match',
        ['get', 'climbStatus'],
        'CLIMB', withAlpha(themeCyan, 0.92),
        'DESC', withAlpha(themeAmber, 0.94),
        withAlpha(themeTextSoft, 0.94),
      ])
      map.setPaintProperty('planes-labels-layer', 'text-halo-color', [
        'match',
        ['get', 'climbStatus'],
        'CLIMB', withAlpha(themeCyan, 0.22),
        'DESC', withAlpha(themeAmber, 0.18),
        withAlpha(themeTextSoft, 0.18),
      ])
      map.setPaintProperty('planes-labels-layer', 'text-halo-width', PLANE_LABEL_HALO_WIDTH_EXPR)
    }

    const planesLabelsExpanded = map.getLayer('planes-labels-layer-expanded')
    if (planesLabelsExpanded) {
      map.setPaintProperty('planes-labels-layer-expanded', 'text-color', [
        'match',
        ['get', 'climbStatus'],
        'CLIMB', withAlpha(themeCyan, 0.92),
        'DESC', withAlpha(themeAmber, 0.94),
        withAlpha(themeTextSoft, 0.94),
      ])
      map.setPaintProperty('planes-labels-layer-expanded', 'text-halo-color', [
        'match',
        ['get', 'climbStatus'],
        'CLIMB', withAlpha(themeCyan, 0.22),
        'DESC', withAlpha(themeAmber, 0.18),
        withAlpha(themeTextSoft, 0.18),
      ])
      map.setPaintProperty('planes-labels-layer-expanded', 'text-halo-width', PLANE_LABEL_HALO_WIDTH_EXPR)
      map.setPaintProperty('planes-labels-layer-expanded', 'text-halo-blur', 0.58)
    }

    const planesLabelsSelectedCompact = map.getLayer('planes-labels-selected-compact-layer')
    if (planesLabelsSelectedCompact) {
      map.setPaintProperty('planes-labels-selected-compact-layer', 'text-color', withAlpha(themeCyanAlt, 1))
      map.setPaintProperty('planes-labels-selected-compact-layer', 'text-halo-color', withAlpha(themeCyanAlt, 0.34))
      map.setPaintProperty('planes-labels-selected-compact-layer', 'text-halo-width', 1.9)
      map.setPaintProperty('planes-labels-selected-compact-layer', 'text-halo-blur', 0.66)
      map.setPaintProperty('planes-labels-selected-compact-layer', 'text-opacity', 0)
    }

    const planesLabelsSelected = map.getLayer('planes-labels-selected-layer')
    if (planesLabelsSelected) {
      map.setPaintProperty('planes-labels-selected-layer', 'text-color', withAlpha(themeCyanAlt, 1))
      map.setPaintProperty('planes-labels-selected-layer', 'text-halo-color', withAlpha(themeCyanAlt, 0.34))
      map.setPaintProperty('planes-labels-selected-layer', 'text-halo-width', 1.9)
      map.setPaintProperty('planes-labels-selected-layer', 'text-halo-blur', 0.66)
      map.setPaintProperty('planes-labels-selected-layer', 'text-opacity', 0)
    }
  }, [mapReady, selectedIcaoNormalized, themeCyan, themeCyanAlt, themeRedAlt, themeTextSoft, themeAmber])

  useEffect(() => {
    if (!mapReady || !mapRef.current) return
    const map = mapRef.current
    const source = map.getSource('runway-focus')
    if (!source) return

    const runwayFeature = resolveRunwayFeature(selectedRunwayId)
    source.setData(runwayFeature ? {
      type: 'FeatureCollection',
      features: [runwayFeature],
    } : EMPTY_GEOJSON)

    if (!runwayFeature) return

    const runwayFlight = getIncomingRunwayFlight(runwayFeature, flightsRef.current)
    onRunwaySelectRef.current?.({
      runwayId: runwayFeature.properties?.id,
      runwayLabel: runwayFeature.properties?.id,
      flightId: runwayFlight?.icao24 ?? null,
      flightLabel: runwayFlight ? normalizeDisplayText(runwayFlight.callsign, runwayFlight.icao24) : null,
    })

    if (selectedIcao) return

    const focusView = buildRunwayFocusView(runwayFeature)
    if (!focusView) return

    clearTimeout(runwayFocusTimerRef.current)
    const padding = buildRunwayFocusPadding(leftPanelWidth, rightPanelWidth)

    map.stop()
    map.easeTo({
      center: focusView.center,
      bearing: focusView.bearing,
      zoom: focusView.zoom - 1.1,
      pitch: Math.max(60, focusView.pitch - 12),
      padding,
      duration: 720,
      essential: true,
    })

    runwayFocusTimerRef.current = setTimeout(() => {
      map.easeTo({
        center: focusView.center,
        bearing: focusView.bearing,
        zoom: focusView.zoom,
        pitch: focusView.pitch,
        padding,
        duration: 1180,
        essential: true,
      })
    }, 320)
  }, [mapReady, selectedIcao, selectedRunwayId, leftPanelWidth, rightPanelWidth])

  useEffect(() => {
    if (!mapReady || !mapRef.current) return
    const raf = requestAnimationFrame(() => {
      mapRef.current?.resize()
    })
    return () => cancelAnimationFrame(raf)
  }, [mapReady, leftPanelWidth, rightPanelWidth])

  // Update plane positions — incremental updateData() after first load
  useEffect(() => {
    if (!mapReady || !mapRef.current) {
      prevPlaneStateRef.current = null
      return
    }
    const src = mapRef.current.getSource('planes')
    if (!src) return

    if (!flights.length) {
      if (prevPlaneStateRef.current?.size) {
        src.setData({ type: 'FeatureCollection', features: [] })
      }
      prevPlaneStateRef.current = null
      return
    }

    const features = buildPlaneFeatures(flights, selectedIcao, {
      suppressInactiveLabels,
    })
    if (prevPlaneStateRef.current === null) {
      src.setData({ type: 'FeatureCollection', features })
      prevPlaneStateRef.current = planeFeatureStateMap(features)
      return
    }

    const prevState = prevPlaneStateRef.current
    const { add, update, remove, nextState } = buildPlaneSourceDiff(features, prevState)

    if (add.length || update.length || remove.length) {
      src.updateData({ add, update, remove })
    }

    prevPlaneStateRef.current = nextState
  }, [flights, selectedIcao, suppressInactiveLabels, mapReady])

  useEffect(() => {
    if (!mapReady || !mapRef.current) return
    const map = mapRef.current
    const syncPitch = () => {
      const targetPitch = resolveAdaptivePitch(map.getZoom(), selectedFlightForTracking)
      if (Math.abs(map.getPitch() - targetPitch) < 0.75) return
      map.setPitch(targetPitch)
    }

    syncPitch()
    map.on('zoom', syncPitch)
    return () => {
      map.off('zoom', syncPitch)
    }
  }, [
    mapReady,
    selectedIcaoNormalized,
    selectedFlightForTracking?.baro_altitude,
    selectedFlightForTracking?.geo_altitude,
    selectedFlightForTracking?.on_ground,
  ])

  useEffect(() => {
    if (!mapReady || !mapRef.current) return
    const src = mapRef.current.getSource('history-paths')
    if (!src) return
    if (!historyPathFeatures?.features?.length) {
      src.setData(EMPTY_GEOJSON)
      return
    }

    if (!selectedIcaoNormalized) {
      src.setData(historyPathFeatures)
      return
    }

    const selectedFeatureCollection = []
    const otherFeatures = []

    for (const feature of historyPathFeatures.features) {
      const icao24 = normalizeFlightId(feature?.properties?.icao24)
      if (icao24 === selectedIcaoNormalized) {
        selectedFeatureCollection.push(feature)
      } else {
        otherFeatures.push(feature)
      }
    }

    if (!selectedFeatureCollection.length) {
      src.setData(historyPathFeatures)
      return
    }

    src.setData({
      type: 'FeatureCollection',
      features: [...otherFeatures, ...selectedFeatureCollection],
    })
  }, [mapReady, historyPathFeatures, selectedIcaoNormalized])

  useEffect(() => {
    if (!mapReady || !mapRef.current) return
    const src = mapRef.current.getSource('congestion')
    if (!src) return
    src.setData(congestionFeatures?.features?.length ? congestionFeatures : EMPTY_GEOJSON)
  }, [mapReady, congestionFeatures])

  // Pulse ring on selected plane (single DOM marker)
  useEffect(() => {
    if (!mapReady || !selectedIcao || !mapRef.current) {
      pulseCoordsRef.current = null
      pulseAnimatedCoordRef.current = null
      return
    }
    pulseCoordsRef.current = resolvePulseCoords(mapRef.current, selectedIcao, selectedLng, selectedLat)
  }, [mapReady, selectedIcao, selectedLat, selectedLng])

  useEffect(() => {
    pulseTimelineRef.current?.kill()
    pulseTimelineRef.current = null
    pulseMoveTweenRef.current?.kill()
    pulseMoveTweenRef.current = null

    pulseMarkerRef.current?.remove()
    pulseMarkerRef.current = null
    if (!mapReady || !mapRef.current || !selectedIcao) return

    const coords = pulseCoordsRef.current
    if (!coords) return

    const el = document.createElement('div')
    const initialLiftPx = resolveSelectedAltitudeLift(selectedFlightForTracking)
    el.style.cssText = [
      'width:260px',
      'height:236px',
      'position:relative',
      'pointer-events:none',
      'display:flex',
      'align-items:center',
      'justify-content:center',
      'transform:translateZ(0)',
      'will-change:transform',
    ].join(';')
    const shadow = document.createElement('div')
    shadow.style.cssText = [
      'position:absolute',
      'left:50%',
      'top:50%',
      'width:56px',
      'height:18px',
      'border-radius:50%',
      'background:rgba(0,0,0,0.42)',
      'transform:translate(-50%, -50%)',
      'filter:blur(10px)',
      'opacity:0.48',
    ].join(';')
    el.appendChild(shadow)
    const stem = document.createElement('div')
    stem.style.cssText = [
      'position:absolute',
      'left:50%',
      'top:50%',
      'width:2px',
      `height:${48 + Math.round(initialLiftPx * 0.82)}px`,
      `background:linear-gradient(180deg, ${withAlpha(themeCyanAlt, 0.62)}, ${withAlpha(themeCyanAlt, 0)})`,
      'transform:translate(-50%, 6px)',
      'opacity:0.9',
    ].join(';')
    el.appendChild(stem)
    const glow = document.createElement('div')
    glow.style.cssText = [
      'position:absolute',
      'left:50%',
      'top:50%',
      `width:${PULSE_RING_SIZE + 8}px`,
      `height:${PULSE_RING_SIZE + 8}px`,
      'border-radius:50%',
      `background:radial-gradient(circle, ${withAlpha(themeCyanAlt, 0.38)} 0%, ${withAlpha(themeCyanAlt, 0.18)} 34%, ${withAlpha(themeCyanAlt, 0.07)} 56%, ${withAlpha(themeCyanAlt, 0)} 76%)`,
      'transform:translate(-50%, -50%)',
      'filter:blur(6px)',
      'mix-blend-mode:screen',
    ].join(';')
    el.appendChild(glow)
    const coreGlow = document.createElement('div')
    coreGlow.style.cssText = [
      'position:absolute',
      'left:50%',
      'top:50%',
      'width:26px',
      'height:26px',
      'border-radius:50%',
      `background:${withAlpha(themeCyanAlt, 0.26)}`,
      'transform:translate(-50%, -50%)',
      'filter:blur(3px)',
    ].join(';')
    el.appendChild(coreGlow)
    const card = document.createElement('div')
    card.style.cssText = [
      'position:absolute',
      'left:50%',
      'top:96px',
      'transform:translateX(-50%)',
      'min-width:210px',
      'max-width:246px',
      'padding:11px 13px 10px',
      'border-radius:18px',
      `background:linear-gradient(180deg, rgba(18, 36, 52, 0.96), rgba(8, 14, 24, 0.96))`,
      `border:1px solid ${withAlpha(themeCyanAlt, 0.48)}`,
      `box-shadow:0 24px 46px rgba(0,0,0,0.42), 0 6px 18px ${withAlpha(themeCyanAlt, 0.2)}, inset 0 1px 0 rgba(255,255,255,0.12)`,
      'backdrop-filter:blur(16px)',
      'display:flex',
      'flex-direction:column',
      'gap:4px',
      'text-align:left',
    ].join(';')
    const cardBase = document.createElement('div')
    cardBase.style.cssText = [
      'position:absolute',
      'left:50%',
      'top:108px',
      'width:228px',
      'height:76px',
      'transform:translateX(-50%)',
      'border-radius:20px',
      `background:linear-gradient(180deg, rgba(0,0,0,0.32), rgba(0,0,0,0.72))`,
      'filter:blur(10px)',
      'opacity:0.72',
    ].join(';')
    el.appendChild(cardBase)
    const title = document.createElement('div')
    title.style.cssText = [
      'font:600 12px/1.2 JetBrains Mono, monospace',
      'letter-spacing:0.025em',
      'color:rgba(236, 250, 255, 0.98)',
      'white-space:nowrap',
      'overflow:hidden',
      'text-overflow:ellipsis',
    ].join(';')
    const detail = document.createElement('div')
    detail.style.cssText = [
      'font:500 11px/1.26 JetBrains Mono, monospace',
      `color:${withAlpha(themeCyanAlt, 0.95)}`,
      'white-space:nowrap',
      'overflow:hidden',
      'text-overflow:ellipsis',
    ].join(';')
    const status = document.createElement('div')
    status.style.cssText = [
      'font:500 10px/1.26 JetBrains Mono, monospace',
      'color:rgba(186, 210, 224, 0.92)',
      'white-space:nowrap',
      'overflow:hidden',
      'text-overflow:ellipsis',
      'text-transform:uppercase',
      'letter-spacing:0.04em',
    ].join(';')
    title.textContent = selectedOverlayLinesRef.current.title
    detail.textContent = selectedOverlayLinesRef.current.detail
    status.textContent = selectedOverlayLinesRef.current.status
    card.appendChild(title)
    card.appendChild(detail)
    card.appendChild(status)
    el.appendChild(card)
    selectedOverlayNodesRef.current = { title, detail, status }
    selectedVisualRef.current = { root: el, stem, glow, coreGlow, card, cardBase, shadow }
    gsap.set(el, { y: -initialLiftPx })
    gsap.set(shadow, {
      scaleX: 1 - Math.min(0.18, initialLiftPx / 120),
      scaleY: 1 - Math.min(0.08, initialLiftPx / 220),
      opacity: 0.52 - Math.min(0.14, initialLiftPx / 180),
    })
    gsap.set(glow, { scale: 1, opacity: 0.92 })
    pulseTimelineRef.current = gsap.timeline({
      repeat: -1,
      defaults: {
        ease: 'sine.inOut',
      },
    })
    pulseTimelineRef.current.to(glow, {
      scale: 1.08,
      opacity: 0.78,
      duration: 1.5,
      yoyo: true,
      repeat: 1,
    })
    pulseMarkerRef.current = new maplibregl.Marker({ element: el, anchor: 'center', offset: [0, 0] })
      .setLngLat(coords)
      .addTo(mapRef.current)
    pulseAnimatedCoordRef.current = coords

    return () => {
      pulseTimelineRef.current?.kill()
      pulseTimelineRef.current = null
      pulseMoveTweenRef.current?.kill()
      pulseMoveTweenRef.current = null
      selectedOverlayNodesRef.current = { title: null, detail: null, status: null }
      selectedVisualRef.current = { root: null, stem: null, glow: null, coreGlow: null, card: null, cardBase: null, shadow: null }
    }
  }, [selectedIcao, mapReady, themeCyanAlt, selectedFlightForTracking])

  useEffect(() => {
    selectedOverlayLinesRef.current = selectedOverlayLines
    const { title, detail, status } = selectedOverlayNodesRef.current
    if (title) title.textContent = selectedOverlayLines.title
    if (detail) detail.textContent = selectedOverlayLines.detail
    if (status) status.textContent = selectedOverlayLines.status
  }, [selectedOverlayLines])

  useEffect(() => {
    const visual = selectedVisualRef.current
    if (!visual.root) return

    const liftPx = resolveSelectedAltitudeLift(selectedFlightForTracking)
    const stemHeight = 48 + Math.round(liftPx * 0.82)

    gsap.to(visual.root, {
      y: -liftPx,
      duration: 0.38,
      ease: 'power2.out',
      overwrite: true,
    })
    if (visual.stem) {
      gsap.to(visual.stem, {
        height: stemHeight,
        duration: 0.38,
        ease: 'power2.out',
        overwrite: true,
      })
    }
    if (visual.card) {
      gsap.to(visual.card, {
        y: Math.min(14, liftPx * 0.18),
        duration: 0.38,
        ease: 'power2.out',
        overwrite: true,
      })
    }
    if (visual.cardBase) {
      gsap.to(visual.cardBase, {
        y: Math.min(16, liftPx * 0.2),
        opacity: 0.72 + Math.min(0.12, liftPx / 150),
        duration: 0.38,
        ease: 'power2.out',
        overwrite: true,
      })
    }
    if (visual.shadow) {
      gsap.to(visual.shadow, {
        scaleX: 1 - Math.min(0.24, liftPx / 132),
        scaleY: 1 - Math.min(0.12, liftPx / 220),
        opacity: 0.52 - Math.min(0.18, liftPx / 180),
        duration: 0.38,
        ease: 'power2.out',
        overwrite: true,
      })
    }
  }, [
    selectedFlightForTracking?.baro_altitude,
    selectedFlightForTracking?.geo_altitude,
    selectedFlightForTracking?.on_ground,
  ])

  // Update pulse ring position as plane moves
  useEffect(() => {
    if (!pulseMarkerRef.current || !mapRef.current || !selectedIcao) return

    const coords = resolvePulseCoords(mapRef.current, selectedIcao, selectedLng, selectedLat)
    if (!coords) return

    const marker = pulseMarkerRef.current
    const prev = pulseAnimatedCoordRef.current
    if (!prev) {
      marker.setLngLat(coords)
      pulseAnimatedCoordRef.current = coords
      return
    }
    if (prev[0] === coords[0] && prev[1] === coords[1]) return

    pulseMoveTweenRef.current?.kill()
    const tweenState = { lng: prev[0], lat: prev[1] }
    pulseMoveTweenRef.current = gsap.to(tweenState, {
      lng: coords[0],
      lat: coords[1],
      duration: 0.34,
      ease: 'sine.out',
      overwrite: true,
      onUpdate: () => {
        marker.setLngLat([tweenState.lng, tweenState.lat])
      },
      onComplete: () => {
        pulseAnimatedCoordRef.current = coords
      },
    })
  }, [selectedIcao, selectedLng, selectedLat])

  // Keep selected aircraft centered within visible map area while avoiding per-tick camera churn.
  const recenterSelectedFlight = useCallback((options = {}) => {
    const { force = false } = options
    if (!mapReady || !mapRef.current) return
    const map = mapRef.current
    const canvas = map.getCanvas()
    const width = canvas.clientWidth
    const height = canvas.clientHeight
    if (!width || !height) return
    const padding = buildOverlayPadding(leftPanelWidth, rightPanelWidth)
    const insetsChanged = (
      padding.left !== lastOverlayPaddingRef.current.left ||
      padding.right !== lastOverlayPaddingRef.current.right
    )

    const coords = selectedIcao
      ? resolvePulseCoords(map, selectedIcao, selectedLng, selectedLat)
      : null
    if (!coords) {
      if (insetsChanged) {
        map.easeTo({ padding, duration: 160, essential: true })
        lastOverlayPaddingRef.current = { left: padding.left, right: padding.right }
      }
      lastFollowIcaoRef.current = null
      return
    }

    const selectedChanged = lastFollowIcaoRef.current !== selectedIcao
    if (!force && userCameraGestureRef.current && !selectedChanged && !insetsChanged) return

    const targetPoint = map.project(coords)
    const nowMs = Date.now()
    const recenterDecision = resolveRecenterDecision({
      width,
      height,
      targetPoint,
      leftPanelWidth,
      rightPanelWidth,
      selectedChanged,
      insetsChanged,
      force,
      userCameraGesture: userCameraGestureRef.current,
      nowMs,
      lastAutoFollowMs: lastAutoFollowMsRef.current,
    })
    if (!recenterDecision) return

    map.easeTo({
      center: coords,
      padding: recenterDecision.padding,
      duration: recenterDecision.duration,
      essential: true,
    })

    lastFollowIcaoRef.current = selectedIcao
    lastOverlayPaddingRef.current = { left: padding.left, right: padding.right }
    lastAutoFollowMsRef.current = nowMs
  }, [leftPanelWidth, mapReady, rightPanelWidth, selectedIcao, selectedLat, selectedLng])

  useEffect(() => {
    if (!mapReady || !mapRef.current) return
    const map = mapRef.current
    const onMoveEnd = () => recenterSelectedFlight({ force: true })

    map.on('moveend', onMoveEnd)
    return () => {
      map.off('moveend', onMoveEnd)
    }
  }, [mapReady, recenterSelectedFlight])

  useEffect(() => {
    recenterSelectedFlight()
  }, [leftPanelWidth, mapReady, rightPanelWidth, selectedIcao, selectedLat, selectedLng, recenterSelectedFlight])

  // Draw flight path
  useEffect(() => {
    if (!mapReady || !mapRef.current) return
    const src = mapRef.current.getSource('path')
    const connectorSrc = mapRef.current.getSource('path-connector')
    if (!src || !connectorSrc) return

    if (!selectedIcao || !track?.path?.length) {
      src.setData({ type: 'FeatureCollection', features: [] })
      connectorSrc.setData({ type: 'FeatureCollection', features: [] })
      return
    }

    // Trim to last 90 minutes so a cross-country flight doesn't zoom out to the whole US
    const lastTrackPoint = [...track.path].reverse().find(point => Array.isArray(point) && Number.isFinite(Number(point[0])))
    const cutoffSec = (lastTrackPoint ? Number(lastTrackPoint[0]) : Math.floor(Date.now() / 1000)) - 90 * 60
    const recentCoords = getTrackCoordinates(track, cutoffSec)
    const allCoords = recentCoords.length < 2
      ? getTrackCoordinates(track, -1)
      : recentCoords
    const currentLng = Number(selectedLng)
    const currentLat = Number(selectedLat)
    if (allCoords.length < 2) {
      src.setData({ type: 'FeatureCollection', features: [] })
      connectorSrc.setData({ type: 'FeatureCollection', features: [] })
      return
    }

    src.setData({
      type: 'FeatureCollection',
      features: [{ type: 'Feature', geometry: { type: 'LineString', coordinates: allCoords } }],
    })
    const heading = Number(selectedFlightForTracking?.heading ?? selectedFlightForTracking?.true_track)
    const connectorCoords = buildTailCurveCoordinates(allCoords, currentLng, currentLat, heading)
    connectorSrc.setData(
      connectorCoords.length >= 2
        ? {
          type: 'FeatureCollection',
          features: [{ type: 'Feature', geometry: { type: 'LineString', coordinates: connectorCoords } }],
        }
        : { type: 'FeatureCollection', features: [] },
    )

  }, [mapReady, selectedIcao, selectedLat, selectedLng, selectedFlightForTracking, track])

  const resetView = useCallback(() => {
    mapRef.current?.flyTo({ ...initialViewRef.current, duration: 900, essential: true })
  }, [])

  useEffect(() => {
    initialViewRef.current = initialCameraView
    if (!mapReady || !mapRef.current || selectedIcao) return
    if (userCameraGestureRef.current) return

    mapRef.current.flyTo({
      ...initialCameraView,
      duration: 840,
      essential: true,
    })
  }, [initialCameraView, mapReady, selectedIcao, selectedIcaoNormalized])

  const onMapKeyDown = useCallback((event) => {
    if (event.key === 'r' || event.key === 'R') {
      event.preventDefault()
      resetView()
      return
    }
    if (event.key === 'Escape' && onSelectRef.current) {
      event.preventDefault()
      onSelectRef.current(null)
    }
  }, [resetView])

  return (
    <div style={{ flex: 1, width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}>
      <style>{`
        .maplibregl-ctrl-group {
          background: var(--panel-overlay-soft) !important;
          border: 1px solid rgba(var(--cyan-alt-rgb), 0.2) !important;
          border-radius: 5px !important;
          box-shadow: 0 2px 12px rgba(0,0,0,0.5) !important;
        }
        .maplibregl-ctrl-group button {
          background: transparent !important;
          color: rgba(var(--cyan-alt-rgb), 0.7) !important;
          border-bottom-color: rgba(var(--cyan-alt-rgb), 0.1) !important;
        }
        .maplibregl-ctrl-group button:hover { background: rgba(var(--cyan-alt-rgb), 0.08) !important; color: rgba(var(--cyan-alt-rgb), 1) !important; }
        .maplibregl-ctrl-compass .maplibregl-ctrl-icon { filter: invert(1) hue-rotate(160deg) brightness(0.75); }
        .maplibregl-ctrl-attrib {
          background: var(--panel-overlay) !important;
          color: rgba(var(--text-soft-rgb), 0.9) !important;
          font-size: 9px !important;
          font-family: var(--font-mono) !important;
        }
        .maplibregl-ctrl-attrib a { color: rgba(var(--cyan-alt-rgb), 0.45) !important; }
        .twa-popup .maplibregl-popup-content {
          background: var(--panel-overlay-soft) !important;
          border: 1px solid rgba(var(--cyan-alt-rgb), 0.25) !important;
          color: rgba(var(--text-soft-rgb), 0.95) !important;
          font-family: var(--font-mono) !important;
          font-size: 11px !important;
          padding: 5px 10px !important;
          border-radius: 4px !important;
          line-height: 1.25 !important;
        }
        .plane-popup .maplibregl-popup-content {
          background: rgba(8, 14, 24, 0.96) !important;
          border: 1px solid rgba(var(--cyan-alt-rgb), 0.24) !important;
          color: rgba(var(--text-soft-rgb), 0.95) !important;
          font-family: var(--font-mono) !important;
          padding: 0 !important;
          border-radius: 14px !important;
          max-width: 268px !important;
          white-space: normal !important;
          box-shadow: 0 18px 38px rgba(0,0,0,0.42), 0 6px 18px rgba(var(--cyan-alt-rgb), 0.12) !important;
          overflow: hidden !important;
        }
        .plane-popup .maplibregl-popup-tip {
          border-top-color: rgba(8, 14, 24, 0.96) !important;
          border-bottom-color: rgba(8, 14, 24, 0.96) !important;
        }
        .plane-popup-card {
          display: grid;
          gap: 4px;
          min-width: 224px;
          padding: 10px 12px 9px;
          background: linear-gradient(180deg, rgba(19, 37, 52, 0.98), rgba(8, 14, 24, 0.98));
        }
        .plane-popup-title {
          color: rgba(236, 250, 255, 0.98);
          font-size: 12px;
          font-weight: 600;
          line-height: 1.2;
          letter-spacing: 0.03em;
        }
        .plane-popup-detail {
          color: rgba(var(--cyan-alt-rgb), 0.92);
          font-size: 11px;
          font-weight: 500;
          line-height: 1.28;
        }
        .plane-popup-status {
          color: rgba(186, 210, 224, 0.92);
          font-size: 10px;
          font-weight: 500;
          line-height: 1.28;
          letter-spacing: 0.05em;
          text-transform: uppercase;
        }
        .jfk-airport-marker {
          position: relative;
          width: 44px;
          height: 44px;
          pointer-events: none;
          filter: drop-shadow(0 8px 12px rgba(0, 0, 0, 0.45));
        }
        .jfk-airport-pin {
          position: absolute;
          left: 50%;
          bottom: 0;
          width: 32px;
          height: 32px;
          border-radius: 50% 50% 50% 7px;
          transform: translateX(-50%) rotate(-45deg);
          background: linear-gradient(135deg, rgba(8, 18, 28, 0.96), rgba(12, 38, 52, 0.96));
          border: 1px solid rgba(var(--cyan-alt-rgb), 0.78);
          box-shadow: 0 0 12px rgba(var(--cyan-alt-rgb), 0.32), inset 0 1px 0 rgba(255,255,255,0.18);
        }
        .jfk-airport-pin span {
          position: absolute;
          inset: 0;
          display: grid;
          place-items: center;
          transform: rotate(45deg);
          color: #dff8ff;
          font-size: 9px;
          font-weight: 800;
          letter-spacing: 0.3px;
        }
      `}</style>

      <div
        ref={containerRef}
        role="application"
        aria-label="Live flight map around your current location. Press R to reset view, Escape to clear selected flight."
        tabIndex={0}
        onKeyDown={onMapKeyDown}
        style={{ width: '100%', height: '100%' }}
      />

      {/* Track mode banner */}
      {track?.path?.length > 0 && selectedFlightForTracking && (
        <div style={{
          position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
          zIndex: 10,
          background: 'rgba(var(--cyan-alt-rgb), 0.1)',
          border: '1px solid rgba(var(--cyan-alt-rgb), 0.35)',
          borderRadius: 5,
          padding: '5px 16px',
          backdropFilter: 'blur(12px)',
          display: 'flex', alignItems: 'center', gap: 10,
          boxShadow: '0 2px 16px rgba(var(--cyan-alt-rgb), 0.12)',
          maxWidth: 'min(92vw, 680px)',
          pointerEvents: 'none',
        }}>
          <div style={{
            width: 7, height: 7, borderRadius: '50%',
            background: 'var(--cyan-alt)',
            boxShadow: '0 0 6px var(--cyan-alt)',
            animation: 'pulse-dot 1.4s ease-in-out infinite',
          }} />
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 11, color: 'var(--cyan-alt)', letterSpacing: 2.5 }}>
            VIEWING FLIGHT PATH
          </span>
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: 'rgba(var(--cyan-alt-rgb), 0.55)',
            letterSpacing: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {normalizeDisplayText(selectedFlightForTracking.callsign, selectedFlightForTracking.icao24)} · LAST 90 MIN
          </span>
        </div>
      )}

      {(timeline?.mode === 'timelapse' || timeline?.mode === 'history') && timeline?.range?.startMs && timeline?.range?.endMs && (
        <div style={{
          position: 'absolute', top: 58, left: '50%', transform: 'translateX(-50%)',
          zIndex: 10,
          background: 'rgba(var(--red-alt-rgb), 0.09)',
          border: '1px solid rgba(var(--red-alt-rgb), 0.3)',
          borderRadius: 5,
          padding: '5px 14px',
          backdropFilter: 'blur(12px)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          boxShadow: '0 2px 16px rgba(0, 0, 0, 0.12)',
          maxWidth: 'min(92vw, 760px)',
          pointerEvents: 'none',
        }}>
          <span style={{ fontSize: 11, color: 'var(--red-alt)', letterSpacing: 2.5, fontWeight: 600 }}>
            {timeline.mode.toUpperCase()}
          </span>
          <span style={{
            fontSize: 10,
            color: 'rgba(var(--red-alt-rgb), 0.65)',
            letterSpacing: 0.6,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {new Date(timeline.range.startMs).toLocaleString()} → {new Date(timeline.range.endMs).toLocaleString()}
          </span>
          {timeline.mode === 'timelapse' && (
            <span style={{ fontSize: 10, color: 'var(--text-dim)', letterSpacing: 0.6 }}>
              T+{Math.round((timeline.cursorMs - timeline.range.startMs) / 1000 / 60)}m · {timeline.speed}x
            </span>
          )}
        </div>
      )}

    </div>
  )
}
