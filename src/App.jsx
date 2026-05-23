import { useState, useCallback, useEffect, useRef } from 'react'
import HUDBar from './components/HUDBar'
import FlightMap from './components/FlightMap'
import NearbyList from './components/NearbyList'
import FlightDetail from './components/FlightDetail'
import useFlights from './hooks/useFlights'
import useWeather from './hooks/useWeather'

const LIST_PANEL_MIN = 320
const LIST_PANEL_MAX = 560
const DETAIL_PANEL_MIN = 420
const DETAIL_PANEL_MAX = 760

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v))
}

export default function App() {
  const [selectedId, setSelectedId] = useState(null)
  const [track, setTrack] = useState(null)
  const [listWidth, setListWidth] = useState(390)
  const [detailWidth, setDetailWidth] = useState(560)
  const searchInputRef = useRef(null)
  const { flights, loading, error, lastUpdated, rateLimitStatus, backoffUntil, isStale, dataSource, pollMs } = useFlights(selectedId)
  const { weather } = useWeather()
  const hasFlights = flights.length > 0
  const isInitialLoad = loading && !hasFlights

  const selectedFlight = flights.find(f => f.icao24 === selectedId) ?? null
  const effectiveSelectedId = selectedFlight ? selectedId : null

  const handleSelect = useCallback((icao24) => {
    setSelectedId(prev => {
      if (prev === icao24) { setTrack(null); return null }
      setTrack(null)
      return icao24
    })
  }, [])

  const handleClose = useCallback(() => {
    setSelectedId(null)
    setTrack(null)
  }, [])

  useEffect(() => {
    const onGlobalKeyDown = (event) => {
      if (event.key === 'Escape' && effectiveSelectedId) {
        event.preventDefault()
        handleClose()
        return
      }

      if (event.key !== '/') return
      const active = document.activeElement
      const isTyping =
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        active instanceof HTMLSelectElement ||
        active?.isContentEditable

      if (isTyping) return

      event.preventDefault()
      searchInputRef.current?.focus()
      searchInputRef.current?.select()
    }

    window.addEventListener('keydown', onGlobalKeyDown)
    return () => window.removeEventListener('keydown', onGlobalKeyDown)
  }, [handleClose, effectiveSelectedId])

  if (error && flights.length === 0) {
    return (
      <div className="app">
        <HUDBar
          flights={[]}
          weather={weather}
          rateLimitStatus={rateLimitStatus}
          backoffUntil={backoffUntil}
          lastUpdated={lastUpdated}
          isStale={isStale}
          dataSource={dataSource}
          listWidth={listWidth}
          detailWidth={detailWidth}
          onListWidthChange={v => setListWidth(clamp(v, LIST_PANEL_MIN, LIST_PANEL_MAX))}
          onDetailWidthChange={v => setDetailWidth(clamp(v, DETAIL_PANEL_MIN, DETAIL_PANEL_MAX))}
        />
      <div role="status" aria-live="assertive" aria-atomic="true" style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 8,
        }}>
        <div style={{
          width: 58, height: 58, borderRadius: '50%',
          border: '1px solid rgba(var(--red-alt-rgb), 0.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 0 24px rgba(var(--red-alt-rgb), 0.18)',
          marginBottom: 6,
        }}>
          <span style={{ fontSize: 24, color: 'var(--red)' }}>⚠</span>
        </div>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--heading)', letterSpacing: 0.2 }}>
          NO ADS-B FEED
        </div>
        <div role="alert" style={{ fontSize: 13, color: 'var(--red-dim)', letterSpacing: 0.1 }}>
          ADS-B FEED UNAVAILABLE
        </div>
        <div role="alert" style={{ fontSize: 13, color: 'var(--red-dim)', letterSpacing: 0.1, textAlign: 'center' }}>
          {error}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-dim)', opacity: 0.8, marginTop: 2 }}>
          Retrying automatically every 15 seconds
        </div>
      </div>
      </div>
    )
  }

  return (
    <div className="app">
      <HUDBar
        flights={flights}
        weather={weather}
        rateLimitStatus={rateLimitStatus}
        backoffUntil={backoffUntil}
        lastUpdated={lastUpdated}
        isStale={isStale}
        dataSource={dataSource}
        listWidth={listWidth}
        detailWidth={detailWidth}
        onListWidthChange={v => setListWidth(clamp(v, LIST_PANEL_MIN, LIST_PANEL_MAX))}
        onDetailWidthChange={v => setDetailWidth(clamp(v, DETAIL_PANEL_MIN, DETAIL_PANEL_MAX))}
      />

      {/* main-layout is position:relative so the detail overlay can be absolute */}
      <div className="main-layout">
        <NearbyList
          flights={flights}
          selectedId={effectiveSelectedId}
          onSelect={handleSelect}
          searchInputRef={searchInputRef}
          width={listWidth}
          loading={loading}
          error={error}
        />

        {/* Map always fills remaining space — NEVER resizes when panel opens */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden', minWidth: 0 }}>
            <FlightMap
            flights={flights}
            selectedFlight={selectedFlight}
            onSelect={handleSelect}
            track={selectedFlight ? track : null}
          />
        </div>

        {/* Detail panel: absolute overlay, slides in/out via CSS — map never reflows */}
        <div
          className={`detail-overlay${selectedFlight ? ' open' : ''}`}
          style={{ width: detailWidth }}
        >
          {selectedFlight && (
            <FlightDetail
              key={selectedFlight?.icao24}
              flight={selectedFlight}
              onClose={handleClose}
              autoFocusCloseButton
              onTrackLoad={setTrack}
              lastUpdated={lastUpdated}
              refreshMs={pollMs}
            />
          )}
        </div>
      </div>

      {isInitialLoad && (
        <div role="status" aria-live="polite" style={{
          position: 'fixed', inset: 0, background: 'var(--panel-overlay)',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', gap: 16, zIndex: 9000,
          backdropFilter: 'blur(6px)',
        }}>
          <RadarLoader />
          <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--cyan)', letterSpacing: 0.5, marginTop: 4 }}>
            ACQUIRING TRAFFIC
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-dim)', letterSpacing: 0.2 }}>
            Connecting to OpenSky Network · KJFK
          </div>
        </div>
      )}
    </div>
  )
}

function RadarLoader() {
  return (
    <div style={{ position: 'relative', width: 96, height: 96 }}>
      <style>{`
        @keyframes radar-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
      <svg width="96" height="96" viewBox="0 0 96 96">
        {[18, 30, 42].map(r => (
          <circle key={r} cx="48" cy="48" r={r} fill="none"
            stroke="rgba(var(--cyan-alt-rgb), 0.15)" strokeWidth="1.5" />
        ))}
        <line x1="48" y1="48" x2="48" y2="8" stroke="var(--cyan)" strokeWidth="2.5" opacity="0.8"
          style={{ transformOrigin: '48px 48px', animation: 'radar-spin 2s linear infinite' }} />
        <circle cx="48" cy="48" r="3" fill="var(--cyan)" />
      </svg>
    </div>
  )
}
