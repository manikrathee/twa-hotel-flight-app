import { useState, useCallback } from 'react'
import HUDBar from './components/HUDBar'
import FlightMap from './components/FlightMap'
import NearbyList from './components/NearbyList'
import FlightDetail from './components/FlightDetail'
import useFlights from './hooks/useFlights'
import useWeather from './hooks/useWeather'

export default function App() {
  const [selectedId, setSelectedId] = useState(null)
  const [track, setTrack] = useState(null)
  const { flights, loading, error, lastUpdated, rateLimitStatus, backoffUntil, isStale } = useFlights()
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
        <HUDBar flights={[]} weather={weather} rateLimitStatus={rateLimitStatus} backoffUntil={backoffUntil} lastUpdated={lastUpdated} isStale={isStale} />
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 10,
        }}>
          <div style={{
            width: 48, height: 48, borderRadius: '50%',
            border: '1px solid rgba(227,30,38,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 24px rgba(227,30,38,0.12)',
            marginBottom: 8,
          }}>
            <span style={{ fontSize: 20, color: 'var(--red)' }}>⚠</span>
          </div>
          <div style={{ fontSize: 15, fontFamily: 'var(--font-display)', color: 'var(--text)', letterSpacing: 3 }}>
            NO ADS-B FEED
          </div>
          <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--red-dim)', letterSpacing: 1 }}>{error}</div>
          <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-dim)', opacity: 0.6, marginTop: 4 }}>
            Retrying automatically every 15 seconds
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      <HUDBar flights={flights} weather={weather} rateLimitStatus={rateLimitStatus} backoffUntil={backoffUntil} lastUpdated={lastUpdated} isStale={isStale} />

      {/* main-layout is position:relative so the detail overlay can be absolute */}
      <div className="main-layout">
        <NearbyList
          flights={flights}
          selectedId={selectedId}
          onSelect={handleSelect}
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
        <div className={`detail-overlay${selectedFlight ? ' open' : ''}`}>
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
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, color: 'var(--cyan)', letterSpacing: 5, marginTop: 4 }}>
            ACQUIRING TRAFFIC
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)', letterSpacing: 1.5 }}>
            Connecting to OpenSky Network · KJFK
          </div>
        </div>
      )}
    </div>
  )
}

function RadarLoader() {
  return (
    <div style={{ position: 'relative', width: 80, height: 80 }}>
      <style>{`
        @keyframes radar-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
      <svg width="80" height="80" viewBox="0 0 80 80">
        {[16, 26, 36].map(r => (
          <circle key={r} cx="40" cy="40" r={r} fill="none"
            stroke="rgba(0,195,255,0.15)" strokeWidth="1" />
        ))}
        <line x1="40" y1="40" x2="40" y2="5" stroke="var(--cyan)" strokeWidth="1.5" opacity="0.8"
          style={{ transformOrigin: '40px 40px', animation: 'radar-spin 2s linear infinite' }} />
        <circle cx="40" cy="40" r="2.5" fill="var(--cyan)" />
      </svg>
    </div>
  )
}
