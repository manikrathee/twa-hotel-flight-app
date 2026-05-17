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
  const [theme, setTheme] = useState('dark')
  const toggleTheme = useCallback(() => setTheme(t => t === 'dark' ? 'light' : 'dark'), [])
  const { flights, loading, error, lastUpdated, rateLimitStatus, backoffUntil, isStale, dataSource, pollMs } = useFlights(selectedId)
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
      <div className="app" data-theme={theme}>
        <HUDBar flights={[]} weather={weather} rateLimitStatus={rateLimitStatus} backoffUntil={backoffUntil} lastUpdated={lastUpdated} isStale={isStale} dataSource={dataSource} theme={theme} onThemeToggle={toggleTheme} />
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 10,
        }}>
          <div style={{
            width: 79, height: 79, borderRadius: '50%',
            border: '1px solid rgba(227,30,38,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 24px rgba(227,30,38,0.12)',
            marginBottom: 8,
          }}>
            <span style={{ fontSize: 33, color: 'var(--red)' }}>⚠</span>
          </div>
          <div style={{ fontSize: 25, fontFamily: 'var(--font-display)', color: 'var(--text)', letterSpacing: 3 }}>
            NO ADS-B FEED
          </div>
          <div style={{ fontSize: 18, fontFamily: 'var(--font-mono)', color: 'var(--red-dim)', letterSpacing: 1 }}>{error}</div>
          <div style={{ fontSize: 17, fontFamily: 'var(--font-mono)', color: 'var(--text-dim)', opacity: 0.6, marginTop: 4 }}>
            Retrying automatically every 15 seconds
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="app" data-theme={theme}>
      <HUDBar flights={flights} weather={weather} rateLimitStatus={rateLimitStatus} backoffUntil={backoffUntil} lastUpdated={lastUpdated} isStale={isStale} dataSource={dataSource} theme={theme} onThemeToggle={toggleTheme} />

      {/* main-layout is position:relative so the detail overlay can be absolute */}
      <div className="main-layout">
        <NearbyList
          flights={flights}
          selectedId={selectedId}
          onSelect={handleSelect}
          theme={theme}
        />

        {/* Map always fills remaining space — NEVER resizes when panel opens */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden', minWidth: 0 }}>
          <FlightMap
            flights={flights}
            selectedFlight={selectedFlight}
            onSelect={handleSelect}
            track={track}
            theme={theme}
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
              lastUpdated={lastUpdated}
              refreshMs={pollMs}
              theme={theme}
            />
          )}
        </div>
      </div>

      {loading && flights.length === 0 && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(3,3,12,0.92)',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', gap: 26, zIndex: 9000,
          backdropFilter: 'blur(6px)',
        }}>
          <RadarLoader />
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 26, color: 'var(--cyan)', letterSpacing: 5, marginTop: 4 }}>
            ACQUIRING TRAFFIC
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 17, color: 'var(--text-dim)', letterSpacing: 1.5 }}>
            Connecting to OpenSky Network · KJFK
          </div>
        </div>
      )}
    </div>
  )
}

function RadarLoader() {
  return (
    <div style={{ position: 'relative', width: 132, height: 132 }}>
      <style>{`
        @keyframes radar-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
      <svg width="132" height="132" viewBox="0 0 132 132">
        {[26, 43, 59].map(r => (
          <circle key={r} cx="66" cy="66" r={r} fill="none"
            stroke="rgba(0,195,255,0.15)" strokeWidth="1.5" />
        ))}
        <line x1="66" y1="66" x2="66" y2="8" stroke="var(--cyan)" strokeWidth="2.5" opacity="0.8"
          style={{ transformOrigin: '66px 66px', animation: 'radar-spin 2s linear infinite' }} />
        <circle cx="66" cy="66" r="4" fill="var(--cyan)" />
      </svg>
    </div>
  )
}
