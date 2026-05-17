import { useEffect, useRef, useCallback, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { INITIAL_VIEW, JFK_RUNWAYS, MAP_STYLE, RUNWAY_LABELS, TWA_HOTEL } from './flightMapConfig'
import { buildPlaneFeatures, buildPlaneSourceDiff, createPlaneImageData, getTrackCoordinates } from './flightMapHelpers'

export default function FlightMap({ flights, selectedFlight, onSelect, track }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const isLoadedRef = useRef(false)
  const pulseMarkerRef = useRef(null)
  const prevIcaoSetRef = useRef(null)
  const onSelectRef = useRef(onSelect)
  const selectedFlightRef = useRef(selectedFlight)
  const [mapReady, setMapReady] = useState(false)
  const selectedIcao = selectedFlight?.icao24 ?? null
  const selectedLng = selectedFlight?.longitude
  const selectedLat = selectedFlight?.latitude

  useEffect(() => { onSelectRef.current = onSelect }, [onSelect])
  useEffect(() => { selectedFlightRef.current = selectedFlight }, [selectedFlight])

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
        .setLngLat(TWA_HOTEL)
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
        if (icao24) onSelectRef.current?.(icao24)
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

  // Pulse ring on selected plane (single DOM marker)
  useEffect(() => {
    pulseMarkerRef.current?.remove()
    pulseMarkerRef.current = null
    const selected = selectedFlightRef.current
    if (!mapReady || !mapRef.current || !selected) return
    if (selected.longitude == null || selected.latitude == null) return

    const el = document.createElement('div')
    el.style.cssText = [
      'width:44px', 'height:44px', 'border-radius:50%',
      'border:2px solid rgba(0,195,255,0.6)',
      'background:rgba(0,195,255,0.06)',
      'animation:ring-expand 1.5s ease-out infinite',
      'pointer-events:none',
    ].join(';')
    pulseMarkerRef.current = new maplibregl.Marker({ element: el, anchor: 'center' })
      .setLngLat([selected.longitude, selected.latitude])
      .addTo(mapRef.current)

    // Selection should not hijack camera; keep runway framing stable.
  }, [selectedFlight?.icao24, mapReady])

  // Update pulse ring position as plane moves
  useEffect(() => {
    if (!pulseMarkerRef.current || selectedLng == null || selectedLat == null) return
    pulseMarkerRef.current.setLngLat([selectedLng, selectedLat])
  }, [selectedIcao, selectedLng, selectedLat])

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
    const coords = getTrackCoordinates(track, cutoffSec)

    if (coords.length < 2) {
      src.setData({ type: 'FeatureCollection', features: [] })
      return
    }

    src.setData({
      type: 'FeatureCollection',
      features: [{ type: 'Feature', geometry: { type: 'LineString', coordinates: coords } }],
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
          border-radius: 5px !important;
          box-shadow: 0 2px 12px rgba(0,0,0,0.5) !important;
        }
        .maplibregl-ctrl-group button {
          background: transparent !important;
          color: rgba(0,212,200,0.7) !important;
          border-bottom-color: rgba(0,212,200,0.1) !important;
        }
        .maplibregl-ctrl-group button:hover { background: rgba(0,212,200,0.08) !important; color: rgba(0,212,200,1) !important; }
        .maplibregl-ctrl-compass .maplibregl-ctrl-icon { filter: invert(1) hue-rotate(160deg) brightness(0.75); }
        .maplibregl-ctrl-attrib {
          background: rgba(3,3,12,0.9) !important;
          color: rgba(84,96,112,0.8) !important;
          font-size: 9px !important;
          font-family: 'DM Mono', monospace !important;
        }
        .maplibregl-ctrl-attrib a { color: rgba(0,212,200,0.45) !important; }
        .twa-popup .maplibregl-popup-content {
          background: rgba(4,4,16,0.94) !important;
          border: 1px solid rgba(0,212,200,0.25) !important;
          color: rgba(0,212,200,0.9) !important;
          font-family: 'DM Mono', monospace !important;
          font-size: 11px !important;
          padding: 5px 10px !important;
          border-radius: 4px !important;
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
          borderRadius: 5,
          padding: '5px 16px',
          backdropFilter: 'blur(12px)',
          display: 'flex', alignItems: 'center', gap: 10,
          boxShadow: '0 2px 16px rgba(0,195,255,0.12)',
          pointerEvents: 'none',
        }}>
          <div style={{
            width: 7, height: 7, borderRadius: '50%',
            background: 'var(--cyan)',
            boxShadow: '0 0 6px var(--cyan)',
            animation: 'pulse-dot 1.4s ease-in-out infinite',
          }} />
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 11, color: 'var(--cyan)', letterSpacing: 2.5 }}>
            VIEWING FLIGHT PATH
          </span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'rgba(0,195,255,0.55)', letterSpacing: 1 }}>
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
          borderRadius: 5,
          color: 'rgba(0,212,200,0.7)',
          fontFamily: 'var(--font-display)',
          fontSize: 11,
          letterSpacing: 2,
          padding: '5px 11px',
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
        borderRadius: 5,
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
      <span style={{ fontSize: 9, fontFamily: 'var(--font-display)', letterSpacing: 2, color: 'rgba(84,96,112,0.9)' }}>{label}</span>
    </div>
  )
}
