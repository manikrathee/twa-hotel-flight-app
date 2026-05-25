import { useEffect, useRef, useCallback, useMemo, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { INITIAL_VIEW, JFK_RUNWAYS, MAP_STYLE, RUNWAY_LABELS, TWA_HOTEL } from './flightMapConfig'
import { buildPlaneFeatures, buildPlaneSourceDiff, createPlaneImageData, getTrackCoordinates } from './flightMapHelpers'
import { bearingDeg, distanceKm } from '../utils/geo'
import { JFK } from '../config/airspace'

const JFK_LNGLAT = [JFK.lon, JFK.lat]
const KM_APPROACH = 16

const FALLBACK_THEME = {
  cyanRgb: '112, 201, 227',
  cyanAltRgb: '0, 195, 255',
  redAltRgb: '227, 30, 38',
  amberRgb: '243, 190, 124',
  textSoftRgb: '84, 96, 112',
}

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

function jfkMarkerNode() {
  const el = document.createElement('div')
  el.className = 'jfk-airport-marker'
  el.innerHTML = `
    <div class="jfk-airport-pin">
      <span>JFK</span>
    </div>
    <div class="jfk-airport-card">
      <div class="jfk-airport-kicker">AIRPORT MARKER</div>
      <div class="jfk-airport-title">KJFK <span>JFK</span></div>
      <div class="jfk-airport-name">John F. Kennedy International</div>
      <div class="jfk-airport-grid">
        <div><strong data-jfk-traffic>0</strong><span>Aircraft</span></div>
        <div><strong data-jfk-approach>0</strong><span>Approach &lt;10mi</span></div>
        <div><strong>14,511</strong><span>Longest(ft)</span></div>
        <div><strong>2</strong><span>Parallel pairs</span></div>
      </div>
      <div class="jfk-airport-pavement">
        <span>Pavement ID on highlighted runways</span>
        <div class="jfk-pavement-row concrete"><b>CONC</b><strong>04L/22R · 13L/31R · 13R/31L</strong></div>
        <div class="jfk-pavement-row asphalt"><b>ASPH</b><strong>04R/22L</strong></div>
      </div>
    </div>
  `
  return el
}

function updateJfkMarker(el, flights) {
  if (!el) return
  const traffic = flights.filter(f => Number.isFinite(Number(f.latitude)) && Number.isFinite(Number(f.longitude))).length
  const approach = flights.filter(f => Number(f.distKm) < KM_APPROACH).length
  el.querySelector('[data-jfk-traffic]').textContent = traffic
  el.querySelector('[data-jfk-approach]').textContent = approach
  el.classList.toggle('has-approach', approach > 0)
}

function normalizeFlightId(value) {
  return String(value || '').trim().toLowerCase()
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
export default function FlightMap({
  flights,
  selectedFlight,
  onSelect,
  onRunwaySelect,
  onHistorySelect,
  track,
  historyPathFeatures,
  congestionFeatures,
  timeline,
  detailPanelWidth = 0,
}) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const isLoadedRef = useRef(false)
  const pulseMarkerRef = useRef(null)
  const jfkMarkerRef = useRef(null)
  const onHistorySelectRef = useRef(null)
  const prevIcaoSetRef = useRef(null)
  const onRunwaySelectRef = useRef(onRunwaySelect)
  const followTargetRef = useRef({ icao: null, coords: null, shiftPx: 0 })
  const flightsRef = useRef(flights)
  const onSelectRef = useRef(onSelect)
  const [mapReady, setMapReady] = useState(false)
  const selectedFlightForMap = useMemo(() => {
    if (!selectedFlight?.icao24) return null
    const target = normalizeFlightId(selectedFlight.icao24)
    return flights.find(f => normalizeFlightId(f.icao24) === target) || null
  }, [flights, selectedFlight])
  const selectedFlightForTracking = selectedFlightForMap || selectedFlight
  const selectedIcao = selectedFlightForTracking?.icao24 ?? null
  const selectedLng = selectedFlightForTracking?.longitude
  const selectedLat = selectedFlightForTracking?.latitude
  const theme = {
    cyan: resolveThemeRGB('--cyan-rgb', FALLBACK_THEME.cyanRgb),
    cyanAlt: resolveThemeRGB('--cyan-alt-rgb', FALLBACK_THEME.cyanAltRgb),
    redAlt: resolveThemeRGB('--red-alt-rgb', FALLBACK_THEME.redAltRgb),
    amber: resolveThemeRGB('--amber-rgb', FALLBACK_THEME.amberRgb),
    textSoft: resolveThemeRGB('--text-soft-rgb', FALLBACK_THEME.textSoftRgb),
  }

  useEffect(() => { onSelectRef.current = onSelect }, [onSelect])
  useEffect(() => { onRunwaySelectRef.current = onRunwaySelect }, [onRunwaySelect])
  useEffect(() => { onHistorySelectRef.current = onHistorySelect }, [onHistorySelect])
  useEffect(() => { flightsRef.current = flights }, [flights])

  // Init map once
  useEffect(() => {
    if (mapRef.current || !containerRef.current) return

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      ...INITIAL_VIEW,
      attributionControl: false,
      maxPitch: 85,
    })

    map.addControl(new maplibregl.NavigationControl({ showCompass: true, showZoom: true }), 'top-right')
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right')

    map.on('load', () => {
      map.addImage('plane-icon', createPlaneImageData(), { sdf: true })

      // ── Runway layers ──────────────────────────────────────────────
      map.addSource('runways', { type: 'geojson', data: JFK_RUNWAYS })

      // Thick glow bg
      map.addLayer({
        id: 'runways-glow',
        type: 'line',
        source: 'runways',
        layout: { 'line-cap': 'square' },
        paint: {
          'line-color': withAlpha(theme.textSoft, 0.08),
          'line-width': 28,
          'line-blur': 6,
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
            'ASPH', withAlpha(theme.amber, 0.72),
            withAlpha(theme.cyanAlt, 0.24),
          ],
          'line-width': 16,
        },
      })
      // Centerline dashes
      map.addLayer({
        id: 'runways-center',
        type: 'line',
        source: 'runways',
        paint: {
          'line-color': withAlpha(theme.textSoft, 0.45),
          'line-width': 1.2,
          'line-dasharray': [12, 10],
        },
      })

      // Runway threshold labels (DOM elements — avoids glyph server dependency)
      RUNWAY_LABELS.features.forEach(f => {
        const el = document.createElement('div')
        el.textContent = f.properties.label
        el.style.cssText = [
          'color:rgba(var(--text-soft-rgb), 0.92)',
          'font-family:var(--font-mono)',
          'font-size:10px',
          'font-weight:600',
          'letter-spacing:1px',
          'pointer-events:none',
          'text-shadow:0 0 4px rgba(0,0,0,0.8)',
          'white-space:nowrap',
        ].join(';')
        new maplibregl.Marker({ element: el, anchor: 'center' })
          .setLngLat(f.geometry.coordinates)
          .addTo(map)
      })

      // ── Flight path ─────────────────────────────────────────────────
      map.addSource('path', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })
      map.addLayer({
        id: 'path-line',
        type: 'line',
        source: 'path',
        paint: {
          'line-color': withAlpha(theme.cyanAlt, 1),
          'line-width': 2,
          'line-opacity': 0.7,
          'line-dasharray': [6, 4],
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
          'line-color': [
            'case',
            ['==', ['get', 'sampleKind'], 'track'],
            withAlpha(theme.redAlt, 0.42),
            withAlpha(theme.cyanAlt, 0.32),
          ],
          'line-width': ['interpolate', ['linear'], ['coalesce', ['get', 'pointCount'], 2], 2, 1.4, 12, 3.4],
          'line-opacity': ['interpolate', ['linear'], ['coalesce', ['get', 'pointCount'], 2], 2, 0.22, 12, 0.9],
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
            `rgba(${theme.cyan}, 0.22)`,
            8,
            `rgba(${theme.amber}, 0.35)`,
            20,
            `rgba(${theme.redAlt}, 0.55)`,
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
        layout: {
          'icon-image': 'plane-icon',
          'icon-size': ['case', ['get', 'selected'], 1.35, 0.9],
          'icon-rotate': ['get', 'heading'],
          'icon-rotation-alignment': 'map',
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
        },
        paint: {
          'icon-color': ['case', ['get', 'selected'], withAlpha(theme.cyanAlt, 1), withAlpha(theme.textSoft, 0.86)],
          'icon-halo-color': ['case',
            ['get', 'selected'], withAlpha(theme.cyanAlt, 0.5),
            withAlpha(theme.textSoft, 0.26),
          ],
          'icon-halo-width': ['case', ['get', 'selected'], 6, 1.5],
        },
      })

      // ── TWA Hotel marker ─────────────────────────────────────────────
      const hotelEl = document.createElement('div')
      hotelEl.style.cssText = [
        'width:18px', 'height:18px', 'border-radius:50%',
        `border:2px solid rgba(${theme.redAlt},1)`,
        `background:${withAlpha(theme.redAlt, 0.18)}`,
        `box-shadow:0 0 14px ${withAlpha(theme.redAlt, 0.55)},0 0 4px ${withAlpha(theme.redAlt, 0.75)}`,
        'cursor:default', 'pointer-events:none',
      ].join(';')
      new maplibregl.Marker({ element: hotelEl, anchor: 'center' })
        .setLngLat(TWA_HOTEL)
        .setPopup(new maplibregl.Popup({ closeButton: false, className: 'twa-popup' })
          .setText('TWA Hotel · KJFK'))
        .addTo(map)

      const jfkEl = jfkMarkerNode()
      jfkMarkerRef.current = {
        marker: new maplibregl.Marker({ element: jfkEl, anchor: 'bottom', offset: [0, -18] })
          .setLngLat(JFK_LNGLAT)
          .addTo(map),
        el: jfkEl,
      }
      updateJfkMarker(jfkEl, [])

      // ── Hover tooltip popup ──────────────────────────────────────────
      const hoverPopup = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        className: 'plane-popup',
        offset: [0, -16],
      })

      map.on('mouseenter', 'planes-layer', e => {
        map.getCanvas().style.cursor = 'pointer'
        const f = e.features[0]
        if (!f) return
        const cs = f.properties.callsign || f.properties.icao24
        hoverPopup.setLngLat(e.lngLat).setText(cs).addTo(map)
      })
      map.on('mousemove', 'planes-layer', e => {
        hoverPopup.setLngLat(e.lngLat)
      })
      map.on('mouseleave', 'planes-layer', () => {
        map.getCanvas().style.cursor = ''
        hoverPopup.remove()
      })

      // ── Click to select ──────────────────────────────────────────────
      map.on('click', 'planes-layer', e => {
        const icao24 = e.features[0]?.properties?.icao24
        if (icao24) onSelectRef.current?.(icao24)
      })

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
        const [start, end] = coordinates
        const centerLon = (start[0] + end[0]) / 2
        const centerLat = (start[1] + end[1]) / 2
        const runwayBearing = bearingDeg(start[1], start[0], end[1], end[0])

        map.flyTo({
          center: [centerLon, centerLat],
          bearing: runwayBearing,
          zoom: 14.8,
          pitch: 56,
          duration: 780,
          essential: true,
        })

        const incomingFlight = getIncomingRunwayFlight(feature, flightsRef.current)
        if (!incomingFlight) {
          onRunwaySelectRef.current?.(null)
          return
        }

        onRunwaySelectRef.current?.({
          runwayId: feature.properties?.id,
          runwayLabel: feature.properties?.id,
          flightId: incomingFlight.icao24,
          flightLabel: (incomingFlight.callsign || incomingFlight.icao24).trim(),
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
      jfkMarkerRef.current?.marker.remove()
      jfkMarkerRef.current = null
      map.remove()
      mapRef.current = null
    }
  }, [theme.cyan, theme.cyanAlt, theme.redAlt, theme.textSoft, theme.amber])

  // Update plane positions — incremental updateData() after first load
  useEffect(() => {
    if (!mapReady || !mapRef.current) {
      prevIcaoSetRef.current = null
      return
    }
    const src = mapRef.current.getSource('planes')
    if (!src) return
    updateJfkMarker(jfkMarkerRef.current?.el, flights)

    if (!flights.length) {
      if (prevIcaoSetRef.current?.size) {
        src.setData({ type: 'FeatureCollection', features: [] })
      }
      prevIcaoSetRef.current = new Set()
      return
    }

    const features = buildPlaneFeatures(flights, selectedIcao)

    if (prevIcaoSetRef.current === null) {
      src.setData({ type: 'FeatureCollection', features })
      prevIcaoSetRef.current = new Set(features.map(f => f.properties.icao24))
      return
    }

    const prevSet = prevIcaoSetRef.current
    const { add, update, remove, nextSet } = buildPlaneSourceDiff(features, prevSet)

    if (add.length || update.length || remove.length) {
      src.updateData({ add, update, remove })
    }

    prevIcaoSetRef.current = nextSet
  }, [flights, selectedIcao, mapReady])

  useEffect(() => {
    if (!mapReady || !mapRef.current) return
    const src = mapRef.current.getSource('history-paths')
    if (!src) return
    src.setData(historyPathFeatures?.features?.length ? historyPathFeatures : EMPTY_GEOJSON)
  }, [mapReady, historyPathFeatures])

  useEffect(() => {
    if (!mapReady || !mapRef.current) return
    const src = mapRef.current.getSource('congestion')
    if (!src) return
    src.setData(congestionFeatures?.features?.length ? congestionFeatures : EMPTY_GEOJSON)
  }, [mapReady, congestionFeatures])

  // Pulse ring on selected plane (single DOM marker)
  useEffect(() => {
    pulseMarkerRef.current?.remove()
    pulseMarkerRef.current = null
    if (!mapReady || !mapRef.current || !selectedIcao) return

    const coords = resolvePulseCoords(mapRef.current, selectedIcao, selectedLng, selectedLat)
    if (!coords) return

    const el = document.createElement('div')
    el.style.cssText = [
      'width:44px', 'height:44px', 'border-radius:50%',
      `border:2px solid ${withAlpha(theme.cyanAlt, 0.6)}`,
      `background:${withAlpha(theme.cyanAlt, 0.06)}`,
      'animation:ring-expand 1.5s ease-out infinite',
      'pointer-events:none',
    ].join(';')
    pulseMarkerRef.current = new maplibregl.Marker({ element: el, anchor: 'center' })
      .setLngLat(coords)
      .addTo(mapRef.current)
  }, [selectedIcao, mapReady, theme.cyanAlt, selectedLat, selectedLng])

  // Update pulse ring position as plane moves
  useEffect(() => {
    if (!pulseMarkerRef.current || !mapRef.current || !selectedIcao) return

    const coords = resolvePulseCoords(mapRef.current, selectedIcao, selectedLng, selectedLat)
    if (!coords) return

    pulseMarkerRef.current.setLngLat(coords)
  }, [selectedIcao, selectedLng, selectedLat])

  // Keep selected aircraft centered in the *viewable* map area (ignoring open detail overlay).
  useEffect(() => {
    if (!mapReady || !mapRef.current || !selectedIcao) return
    const coords = resolvePulseCoords(mapRef.current, selectedIcao, selectedLng, selectedLat)
    if (!coords) return

    const map = mapRef.current
    const isCurrentFlight = followTargetRef.current.icao === selectedIcao
    const previousCoords = followTargetRef.current.coords
    const previousShift = followTargetRef.current.shiftPx
    const canvasWidth = map.getCanvas().clientWidth
    if (!canvasWidth) return

    const insetPx = Math.max(0, Number(detailPanelWidth) || 0)
    const mapShift = Math.max(0, Math.min(insetPx / 2, canvasWidth / 2 - 16))

    const movedKm = previousCoords ? distanceKm(previousCoords[1], previousCoords[0], coords[1], coords[0]) : Infinity
    const panelShiftChanged = previousShift !== mapShift
    const bounds = map.getBounds()
    const isOffscreen = bounds ? !bounds.contains(coords) : false

    if (isCurrentFlight && !panelShiftChanged && !isOffscreen && movedKm < 0.30) return

    const selectedPoint = map.project(coords)
    const nextCenter = map.unproject([selectedPoint.x + mapShift, selectedPoint.y])

    map.easeTo({
      center: nextCenter,
      duration: 450,
      essential: true,
    })

    followTargetRef.current = {
      icao: selectedIcao,
      coords,
      shiftPx: mapShift,
    }
  }, [detailPanelWidth, mapReady, selectedIcao, selectedLat, selectedLng])

  // Draw flight path
  useEffect(() => {
    if (!mapReady || !mapRef.current) return
    const src = mapRef.current.getSource('path')
    if (!src) return

    if (!selectedIcao || !track?.path?.length) {
      src.setData({ type: 'FeatureCollection', features: [] })
      return
    }

    // Trim to last 90 minutes so a cross-country flight doesn't zoom out to the whole US
    const cutoffSec = Math.floor(Date.now() / 1000) - 90 * 60
    const recentCoords = getTrackCoordinates(track, cutoffSec)
    const allCoords = recentCoords.length < 2
      ? getTrackCoordinates(track, -1)
      : recentCoords

    if (allCoords.length < 2) {
      src.setData({ type: 'FeatureCollection', features: [] })
      return
    }

    src.setData({
      type: 'FeatureCollection',
      features: [{ type: 'Feature', geometry: { type: 'LineString', coordinates: allCoords } }],
    })

  }, [selectedIcao, track, mapReady])

  const resetView = useCallback(() => {
    mapRef.current?.flyTo({ ...INITIAL_VIEW, duration: 900, essential: true })
  }, [])

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
        }
        .jfk-airport-marker {
          position: relative;
          width: 308px;
          height: 282px;
          pointer-events: none;
          filter: drop-shadow(0 18px 28px rgba(0, 0, 0, 0.48));
        }
        .jfk-airport-pin {
          position: absolute;
          left: 50%;
          bottom: 0;
          width: 42px;
          height: 42px;
          border-radius: 50% 50% 50% 7px;
          transform: translateX(-50%) rotate(-45deg);
          background: linear-gradient(135deg, rgba(8, 18, 28, 0.96), rgba(12, 38, 52, 0.96));
          border: 1px solid rgba(var(--cyan-alt-rgb), 0.78);
          box-shadow: 0 0 18px rgba(var(--cyan-alt-rgb), 0.34), inset 0 1px 0 rgba(255,255,255,0.18);
        }
        .jfk-airport-pin span {
          position: absolute;
          inset: 0;
          display: grid;
          place-items: center;
          transform: rotate(45deg);
          color: #dff8ff;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.5px;
        }
        .jfk-airport-card {
          position: absolute;
          left: 50%;
          bottom: 44px;
          width: 308px;
          transform: translateX(-50%);
          padding: 14px;
          border-radius: 14px;
          background:
            linear-gradient(180deg, rgba(9, 20, 32, 0.98), rgba(5, 12, 20, 0.94)),
            radial-gradient(circle at 20% 10%, rgba(var(--cyan-alt-rgb), 0.18), transparent 45%);
          border: 1px solid rgba(var(--cyan-alt-rgb), 0.42);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.1), 0 20px 42px rgba(0,0,0,0.38);
        }
        .jfk-airport-card::after {
          content: '';
          position: absolute;
          left: 50%;
          bottom: -7px;
          width: 14px;
          height: 14px;
          transform: translateX(-50%) rotate(45deg);
          background: rgba(5, 12, 20, 0.9);
          border-right: 1px solid rgba(var(--cyan-alt-rgb), 0.24);
          border-bottom: 1px solid rgba(var(--cyan-alt-rgb), 0.24);
        }
        .jfk-airport-kicker {
          color: rgba(var(--text-soft-rgb), 0.9);
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 1.4px;
          margin-bottom: 4px;
          text-transform: uppercase;
        }
        .jfk-airport-title {
          color: #eef8ff;
          font-size: 22px;
          font-weight: 800;
          letter-spacing: 0.3px;
          line-height: 1;
          margin-bottom: 5px;
        }
        .jfk-airport-title span {
          margin-left: 8px;
          padding-left: 9px;
          border-left: 1px solid rgba(var(--cyan-alt-rgb), 0.35);
          color: var(--cyan);
        }
        .jfk-airport-name {
          color: rgba(238,248,255,0.72);
          font-size: 12px;
          line-height: 1.2;
          margin-bottom: 13px;
        }
        .jfk-airport-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 8px;
          margin-bottom: 12px;
        }
        .jfk-airport-grid div {
          min-width: 0;
          height: 66px;
          border-radius: 9px;
          padding: 9px 8px 8px;
          background: rgba(255,255,255,0.055);
          border: 1px solid rgba(255,255,255,0.085);
          display: grid;
          place-items: center;
          align-content: center;
          gap: 7px;
          text-align: center;
        }
        .jfk-airport-grid span,
        .jfk-airport-pavement > span {
          color: rgba(var(--text-soft-rgb), 0.88);
          font-size: 9.5px;
          line-height: 1;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.7px;
        }
        .jfk-airport-grid strong {
          color: #eef8ff;
          font-size: 22px;
          line-height: 1;
          font-weight: 850;
          letter-spacing: 0.2px;
        }
        .jfk-airport-pavement {
          border-radius: 10px;
          padding: 9px 10px;
          background: rgba(var(--cyan-alt-rgb), 0.08);
          border: 1px solid rgba(var(--cyan-alt-rgb), 0.16);
          display: grid;
          gap: 8px;
        }
        .jfk-pavement-row {
          min-height: 32px;
          border-radius: 8px;
          display: grid;
          grid-template-columns: 48px 1fr;
          align-items: center;
          gap: 9px;
          padding: 6px 8px;
          background: rgba(255,255,255,0.045);
          border: 1px solid rgba(255,255,255,0.075);
        }
        .jfk-pavement-row b {
          border-radius: 999px;
          padding: 4px 0;
          text-align: center;
          font-size: 10px;
          line-height: 1;
          font-weight: 900;
          letter-spacing: 0.7px;
        }
        .jfk-pavement-row strong {
          color: rgba(238,248,255,0.92);
          font-size: 12px;
          line-height: 1.25;
          font-weight: 760;
          letter-spacing: 0.2px;
        }
        .jfk-pavement-row.concrete b {
          color: #dff8ff;
          background: rgba(var(--cyan-alt-rgb), 0.18);
          border: 1px solid rgba(var(--cyan-alt-rgb), 0.28);
        }
        .jfk-pavement-row.asphalt b {
          color: #ffe8bd;
          background: rgba(var(--amber-rgb), 0.18);
          border: 1px solid rgba(var(--amber-rgb), 0.32);
        }
        .jfk-airport-marker.has-approach .jfk-airport-pin {
          border-color: rgba(var(--amber-rgb), 0.95);
          box-shadow: 0 0 20px rgba(var(--amber-rgb), 0.34), inset 0 1px 0 rgba(255,255,255,0.18);
        }
      `}</style>

      <div
        ref={containerRef}
        role="application"
        aria-label="Live flight map around KJFK. Press R to reset view, Escape to clear selected flight."
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
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'rgba(var(--cyan-alt-rgb), 0.55)', letterSpacing: 1 }}>
            {(selectedFlightForTracking.callsign || selectedFlightForTracking.icao24).trim()} · LAST 90 MIN
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
          pointerEvents: 'none',
        }}>
          <span style={{ fontSize: 11, color: 'var(--red-alt)', letterSpacing: 2.5, fontWeight: 600 }}>
            {timeline.mode.toUpperCase()}
          </span>
          <span style={{ fontSize: 10, color: 'rgba(var(--red-alt-rgb), 0.65)', letterSpacing: 0.6 }}>
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
