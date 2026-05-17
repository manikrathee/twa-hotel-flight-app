import { useEffect, useRef, useCallback, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { JFK, TWA_HOTEL, JFK_ONE_MILE_MAX_BOUNDS } from '../config/airspace'

const TWA_HOTEL_LNGLAT = [TWA_HOTEL.lon, TWA_HOTEL.lat]

// Initial camera: standing at TWA Hotel looking NW down runway 31L/13R approach path
// Pitch 52° = strong perspective. Bearing 312° = NW up, runway center goes toward horizon.
const INITIAL_VIEW = {
  center: [JFK.lon, JFK.lat],
  zoom: 14.9,
  pitch: 52,
  bearing: 312,
}

// CartoDB dark raster + our vector layers (no API key needed)
const MAP_STYLE = {
  version: 8,
  sources: {
    'carto': {
      type: 'raster',
      tiles: [
        'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
        'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
        'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
      ],
      tileSize: 256,
      maxzoom: 20,
    },
  },
  layers: [{ id: 'carto-raster', type: 'raster', source: 'carto' }],
  glyphs: 'https://fonts.openmaptiles.org/{fontstack}/{range}.pbf',
}

// JFK runway centerlines (FAA-approximate coordinates)
const JFK_RUNWAYS = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { id: '04L/22R', width: 150 },
      geometry: { type: 'LineString', coordinates: [[-73.7895, 40.6173], [-73.7648, 40.6652]] },
    },
    {
      type: 'Feature',
      properties: { id: '04R/22L', width: 150 },
      geometry: { type: 'LineString', coordinates: [[-73.7841, 40.6169], [-73.7594, 40.6648]] },
    },
    {
      type: 'Feature',
      properties: { id: '13L/31R', width: 200 },
      geometry: { type: 'LineString', coordinates: [[-73.7973, 40.6556], [-73.7469, 40.6260]] },
    },
    {
      type: 'Feature',
      properties: { id: '13R/31L', width: 200 },
      geometry: { type: 'LineString', coordinates: [[-73.8016, 40.6511], [-73.7592, 40.6225]] },
    },
  ],
}

// Runway labels (threshold positions for text placement)
const RUNWAY_LABELS = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', properties: { label: '13R' }, geometry: { type: 'Point', coordinates: [-73.7592, 40.6225] } },
    { type: 'Feature', properties: { label: '31L' }, geometry: { type: 'Point', coordinates: [-73.8016, 40.6511] } },
    { type: 'Feature', properties: { label: '13L' }, geometry: { type: 'Point', coordinates: [-73.7469, 40.6260] } },
    { type: 'Feature', properties: { label: '31R' }, geometry: { type: 'Point', coordinates: [-73.7973, 40.6556] } },
    { type: 'Feature', properties: { label: '04L' }, geometry: { type: 'Point', coordinates: [-73.7895, 40.6173] } },
    { type: 'Feature', properties: { label: '22R' }, geometry: { type: 'Point', coordinates: [-73.7648, 40.6652] } },
    { type: 'Feature', properties: { label: '04R' }, geometry: { type: 'Point', coordinates: [-73.7841, 40.6169] } },
    { type: 'Feature', properties: { label: '22L' }, geometry: { type: 'Point', coordinates: [-73.7594, 40.6648] } },
  ],
}

// Draw plane icon to canvas ImageData — synchronous, no SVG/fetch needed
function createPlaneImageData() {
  const S = 32
  const canvas = document.createElement('canvas')
  canvas.width = S
  canvas.height = S
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, S, S)
  ctx.fillStyle = 'white'
  ctx.beginPath()
  // Plane pointing UP (north), classic silhouette
  ctx.moveTo(16, 1)    // nose
  ctx.lineTo(20, 13)   // right wing root leading
  ctx.lineTo(31, 16)   // right wingtip
  ctx.lineTo(20, 18)   // right wing root trailing
  ctx.lineTo(18.5, 30) // right tail
  ctx.lineTo(16, 27)   // tail notch
  ctx.lineTo(13.5, 30) // left tail
  ctx.lineTo(12, 18)   // left wing root trailing
  ctx.lineTo(1, 16)    // left wingtip
  ctx.lineTo(12, 13)   // left wing root leading
  ctx.closePath()
  ctx.fill()
  return ctx.getImageData(0, 0, S, S)
}

export default function FlightMap({ flights, selectedFlight, onSelect, track }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const isLoadedRef = useRef(false)
  const pulseMarkerRef = useRef(null)
  const prevIcaoSetRef = useRef(null)
  const [mapReady, setMapReady] = useState(false)

  // Init map once
  useEffect(() => {
    if (mapRef.current || !containerRef.current) return

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      ...INITIAL_VIEW,
      attributionControl: false,
      maxPitch: 85,
      maxBounds: JFK_ONE_MILE_MAX_BOUNDS,
      minZoom: 14.5,
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
          'line-color': 'rgba(200,220,255,0.06)',
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
          'line-color': 'rgba(160,175,200,0.2)',
          'line-width': 16,
        },
      })
      // Centerline dashes
      map.addLayer({
        id: 'runways-center',
        type: 'line',
        source: 'runways',
        paint: {
          'line-color': 'rgba(255,255,255,0.5)',
          'line-width': 1.2,
          'line-dasharray': [12, 10],
        },
      })

      // Runway threshold labels (DOM elements — avoids glyph server dependency)
      RUNWAY_LABELS.features.forEach(f => {
        const el = document.createElement('div')
        el.textContent = f.properties.label
        el.style.cssText = [
          'color:rgba(255,255,255,0.5)',
          'font-family:var(--font-ui)',
          'font-size:11px',
          'font-weight:600',
          'letter-spacing:0.3px',
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
          'line-color': '#00c3ff',
          'line-width': 2,
          'line-opacity': 0.7,
          'line-dasharray': [6, 4],
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
          'icon-color': ['case', ['get', 'selected'], '#00c3ff', '#c8d8e8'],
          'icon-halo-color': ['case',
            ['get', 'selected'], 'rgba(0,195,255,0.4)',
            'rgba(0,0,0,0.2)',
          ],
          'icon-halo-width': ['case', ['get', 'selected'], 6, 1.5],
        },
      })

      // ── TWA Hotel marker ─────────────────────────────────────────────
      const hotelEl = document.createElement('div')
      hotelEl.style.cssText = [
        'width:18px', 'height:18px', 'border-radius:50%',
        'border:2px solid #e31e26',
        'background:rgba(227,30,38,0.2)',
        'box-shadow:0 0 14px rgba(227,30,38,0.7),0 0 4px rgba(227,30,38,0.9)',
        'cursor:default', 'pointer-events:none',
      ].join(';')
      new maplibregl.Marker({ element: hotelEl, anchor: 'center' })
        .setLngLat(TWA_HOTEL_LNGLAT)
        .setPopup(new maplibregl.Popup({ closeButton: false, className: 'twa-popup' })
          .setText('TWA Hotel · KJFK'))
        .addTo(map)

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
        if (icao24) onSelect(icao24)
      })

      isLoadedRef.current = true
      mapRef.current = map
      setMapReady(true)
    })

    return () => {
      isLoadedRef.current = false
      map.remove()
      mapRef.current = null
    }
  }, [])

  // Update plane positions — incremental updateData() after first load
  useEffect(() => {
    if (!mapReady || !mapRef.current) {
      prevIcaoSetRef.current = null
      return
    }
    const src = mapRef.current.getSource('planes')
    if (!src) return

    const features = flights
      .filter(f => f.icao24 != null && f.latitude != null && f.longitude != null)
      .map(f => ({
        type: 'Feature',
        properties: {
          icao24: f.icao24,
          callsign: (f.callsign || f.icao24).trim(),
          heading: f.heading || 0,
          selected: f.icao24 === selectedFlight?.icao24,
        },
        geometry: { type: 'Point', coordinates: [f.longitude, f.latitude] },
      }))

    if (prevIcaoSetRef.current === null) {
      src.setData({ type: 'FeatureCollection', features })
      prevIcaoSetRef.current = new Set(features.map(f => f.properties.icao24))
      return
    }

    const prevSet = prevIcaoSetRef.current
    const nextMap = new Map(features.map(f => [f.properties.icao24, f]))
    const add = features.filter(f => !prevSet.has(f.properties.icao24))
    // updateData requires GeoJSONFeatureDiff format: { id, newGeometry, addOrUpdateProperties }
    const update = features
      .filter(f => prevSet.has(f.properties.icao24))
      .map(f => ({
        id: f.properties.icao24,
        newGeometry: f.geometry,
        addOrUpdateProperties: Object.entries(f.properties).map(([key, value]) => ({ key, value })),
      }))
    const remove = [...prevSet].filter(id => !nextMap.has(id))

    if (add.length || update.length || remove.length) {
      src.updateData({ add, update, remove })
    }

    prevIcaoSetRef.current = new Set(nextMap.keys())
  }, [flights, selectedFlight?.icao24, mapReady])

  // Pulse ring on selected plane (single DOM marker)
  useEffect(() => {
    pulseMarkerRef.current?.remove()
    pulseMarkerRef.current = null
    if (!mapReady || !mapRef.current || !selectedFlight) return

      const el = document.createElement('div')
      el.style.cssText = [
      'width:36px', 'height:36px', 'border-radius:50%',
      'border:2px solid rgba(0,195,255,0.6)',
      'background:rgba(0,195,255,0.06)',
      'animation:ring-expand 1.2s ease-out infinite',
      'pointer-events:none',
    ].join(';')
    pulseMarkerRef.current = new maplibregl.Marker({ element: el, anchor: 'center' })
      .setLngLat([selectedFlight.longitude, selectedFlight.latitude])
      .addTo(mapRef.current)

    // Fly to selected if no track (track-fit handles the other case)
    // Maintain at least zoom 8, but don't force closer than current view
    if (!track) {
      const currentZoom = mapRef.current.getZoom()
      mapRef.current.flyTo({
        center: [selectedFlight.longitude, selectedFlight.latitude],
        zoom: Math.max(currentZoom, 14.5),
        pitch: 52,
        bearing: 312,
        duration: 900,
        essential: true,
      })
    }
  }, [selectedFlight?.icao24, mapReady])

  // Update pulse ring position as plane moves
  useEffect(() => {
    if (!pulseMarkerRef.current || !selectedFlight) return
    pulseMarkerRef.current.setLngLat([selectedFlight.longitude, selectedFlight.latitude])
  }, [selectedFlight?.longitude, selectedFlight?.latitude])

  // Draw flight path
  useEffect(() => {
    if (!mapReady || !mapRef.current) return
    const src = mapRef.current.getSource('path')
    if (!src) return

    if (!track?.path?.length) {
      src.setData({ type: 'FeatureCollection', features: [] })
      return
    }

    // Trim to last 90 minutes so a cross-country flight doesn't zoom out to the whole US
    const cutoffSec = Math.floor(Date.now() / 1000) - 90 * 60
    const recentPath = track.path.filter(p => p[0] >= cutoffSec)
    const pathToUse = recentPath.length >= 2 ? recentPath : track.path

    const coords = pathToUse
      .filter(p => p[1] != null && p[2] != null)
      .map(p => [p[2], p[1]])  // [lng, lat]

    if (coords.length < 2) return

    src.setData({
      type: 'FeatureCollection',
      features: [{ type: 'Feature', geometry: { type: 'LineString', coordinates: coords } }],
    })

    const bounds = coords.reduce(
      (b, c) => b.extend(c),
      new maplibregl.LngLatBounds(coords[0], coords[0])
    )
    mapRef.current.fitBounds(bounds, {
      padding: 80, maxZoom: 16, minZoom: 14.5, pitch: 30, bearing: 0, duration: 1200,
    })
  }, [track, mapReady])

  const resetView = useCallback(() => {
    mapRef.current?.flyTo({ ...INITIAL_VIEW, duration: 900, essential: true })
  }, [])

  return (
    <div style={{ flex: 1, width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}>
      <style>{`
        .maplibregl-ctrl-group {
          background: rgba(4,4,16,0.94) !important;
          border: 1px solid rgba(0,212,200,0.2) !important;
          border-radius: 10px !important;
          box-shadow: 0 2px 12px rgba(0,0,0,0.5) !important;
        }
        .maplibregl-ctrl-group button {
          background: transparent !important;
          color: rgba(0,212,200,0.7) !important;
          border-bottom-color: rgba(0,212,200,0.1) !important;
          width: 32px !important;
          height: 32px !important;
        }
        .maplibregl-ctrl-group button:hover { background: rgba(0,212,200,0.08) !important; color: rgba(0,212,200,1) !important; }
        .maplibregl-ctrl-compass .maplibregl-ctrl-icon { filter: invert(1) hue-rotate(160deg) brightness(0.75); }
        .maplibregl-ctrl-attrib {
          background: rgba(3,3,12,0.9) !important;
          color: rgba(84,96,112,0.8) !important;
          font-size: 11px !important;
          font-family: 'Inter', sans-serif !important;
        }
        .maplibregl-ctrl-attrib a { color: rgba(0,212,200,0.45) !important; }
        .twa-popup .maplibregl-popup-content {
          background: rgba(4,4,16,0.94) !important;
          border: 1px solid rgba(0,212,200,0.25) !important;
          color: rgba(0,212,200,0.9) !important;
          font-family: 'Inter', sans-serif !important;
          font-size: 12px !important;
          padding: 5px 10px !important;
          border-radius: 8px !important;
        }
      `}</style>

      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      {/* Track mode banner */}
      {track?.path?.length > 0 && selectedFlight && (
        <div style={{
          position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
          zIndex: 10,
          background: 'rgba(0,195,255,0.1)',
          border: '1px solid rgba(0,195,255,0.35)',
          borderRadius: 999,
          padding: '6px 14px',
          backdropFilter: 'blur(12px)',
          display: 'flex', alignItems: 'center', gap: 10,
          boxShadow: '0 2px 16px rgba(0,195,255,0.12)',
          pointerEvents: 'none',
          animation: 'fade-in 0.3s ease',
        }}>
          <div style={{
            width: 7, height: 7, borderRadius: '50%',
            background: 'var(--cyan)',
            boxShadow: '0 0 6px var(--cyan)',
            animation: 'pulse-dot 1.4s ease-in-out infinite',
          }} />
          <span style={{ fontSize: 12, color: 'var(--cyan)', fontWeight: 700, letterSpacing: 0.2 }}>
            VIEWING FLIGHT PATH
          </span>
          <span style={{ fontSize: 12, color: 'rgba(0,195,255,0.7)', fontWeight: 500 }}>
            {(selectedFlight.callsign || selectedFlight.icao24).trim()} · LAST 90 MIN
          </span>
        </div>
      )}

      {/* Reset view button */}
      <button
        onClick={resetView}
        title="Reset to JFK runway view"
        style={{
          position: 'absolute', bottom: 44, right: 12,
          zIndex: 10,
          background: 'rgba(4,4,16,0.94)',
          border: '1px solid rgba(0,212,200,0.2)',
          borderRadius: 10,
          color: 'rgba(0,212,200,0.7)',
          fontSize: 12,
          fontWeight: 600,
          padding: '6px 10px',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          boxShadow: '0 2px 12px rgba(0,0,0,0.4)',
          transition: 'color 0.15s, border-color 0.15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.color = 'rgba(0,212,200,1)'; e.currentTarget.style.borderColor = 'rgba(0,212,200,0.4)' }}
        onMouseLeave={e => { e.currentTarget.style.color = 'rgba(0,212,200,0.7)'; e.currentTarget.style.borderColor = 'rgba(0,212,200,0.2)' }}
      >
        ⊕ JFK VIEW
      </button>

      {/* Legend */}
      <div style={{
        position: 'absolute', bottom: 44, left: 12, zIndex: 10,
        background: 'rgba(3,3,12,0.92)',
        border: '1px solid rgba(0,212,200,0.1)',
        borderRadius: 10,
        padding: '6px 10px',
        backdropFilter: 'blur(10px)',
        display: 'flex', flexDirection: 'column', gap: 5,
        boxShadow: '0 2px 12px rgba(0,0,0,0.4)',
      }}>
        <Row color="var(--cyan)" label="FLIGHT PATH" line />
        <Row color="#e31e26" label="TWA HOTEL" dot />
        <Row color="rgba(160,175,200,0.4)" label="JFK RUNWAYS" line />
      </div>
    </div>
  )
}

function Row({ color, label, line, dot }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
      {line && <div style={{ width: 16, height: 1.5, background: color, borderRadius: 1, opacity: 0.9 }} />}
      {dot && <div style={{ width: 8, height: 8, borderRadius: '50%', border: `1.5px solid ${color}`, background: `${color}22` }} />}
      <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(84,96,112,0.9)' }}>{label}</span>
    </div>
  )
}
