import { useState, useCallback } from 'react'
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
  const { flights, loading, error, lastUpdated, rateLimitStatus, backoffUntil, isStale, dataSource } = useFlights()
  const { weather } = useWeather()

  const selectedFlight = flights.find(f => f.icao24 === selectedId) ?? null

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
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 8,
        }}>
          <div style={{
            width: 58, height: 58, borderRadius: '50%',
            border: '1px solid rgba(227,30,38,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 24px rgba(227,30,38,0.12)',
            marginBottom: 6,
          }}>
            <span style={{ fontSize: 24, color: 'var(--red)' }}>⚠</span>
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--heading)', letterSpacing: 0.2 }}>
            NO ADS-B FEED
          </div>
          <div style={{ fontSize: 13, color: 'var(--red-dim)', letterSpacing: 0.1 }}>{error}</div>
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
          selectedId={selectedId}
          onSelect={handleSelect}
          width={listWidth}
        />

        {/* Map always fills remaining space — NEVER resizes when panel opens */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden', minWidth: 0 }}>
          <FlightMap
            flights={flights}
            selectedFlight={selectedFlight}
            onSelect={handleSelect}
            track={track}
          />
        </div>

        {/* Detail panel: absolute overlay, slides in/out via CSS — map never reflows */}
        <div
          className={`detail-overlay${selectedFlight ? ' open' : ''}`}
          style={{ width: detailWidth }}
        >
          {selectedFlight && (
            <FlightDetail
              key={selectedId}
              flight={selectedFlight}
              onClose={handleClose}
              onTrackLoad={setTrack}
            />
          )}
        </div>
      </div>

      {loading && flights.length === 0 && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(3,3,12,0.92)',
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
            stroke="rgba(0,195,255,0.15)" strokeWidth="1.5" />
        ))}
        <line x1="48" y1="48" x2="48" y2="8" stroke="var(--cyan)" strokeWidth="2.5" opacity="0.8"
          style={{ transformOrigin: '48px 48px', animation: 'radar-spin 2s linear infinite' }} />
        <circle cx="48" cy="48" r="3" fill="var(--cyan)" />
      </svg>
    </div>
  )
}
