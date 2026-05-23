import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import HUDBar from './components/HUDBar'
import FlightMap from './components/FlightMap'
import NearbyList from './components/NearbyList'
import FlightDetail from './components/FlightDetail'
import useFlights from './hooks/useFlights'
import useWeather from './hooks/useWeather'
import useFlightHistory from './hooks/useFlightHistory'

const LIST_PANEL_MIN = 320
const LIST_PANEL_MAX = 560
const DETAIL_PANEL_MIN = 420
const DETAIL_PANEL_MAX = 760
const VIEWPORT_LIST_RATIO = { normal: 0.30, constrained: 0.24 }
const VIEWPORT_LIST_RATIO_WITH_DETAILS = { normal: 0.22, constrained: 0.18 }
const VIEWPORT_DETAIL_RATIO = { normal: 0.41, constrained: 0.36 }

const MODE_LIVE = 'live'
const MODE_HISTORY = 'history'
const MODE_TIMELAPSE = 'timelapse'

const HISTORY_WINDOWS = [
  { label: 'Last day', ms: 24 * 60 * 60 * 1000 },
  { label: 'Last 3 days', ms: 3 * 24 * 60 * 60 * 1000 },
  { label: 'Last week', ms: 7 * 24 * 60 * 60 * 1000 },
]

const TIMELAPSE_SPEEDS = [2, 3, 4]

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v))
}

function clampPanelSize(value, minimum, maximum) {
  return clamp(Math.round(value), minimum, maximum)
}

export default function App() {
  const [selectedId, setSelectedId] = useState(null)
  const [selectedSource, setSelectedSource] = useState('live')
  const [track, setTrack] = useState(null)
  const [runwayAlert, setRunwayAlert] = useState(null)
  const [viewportWidth, setViewportWidth] = useState(() => {
    if (typeof window === 'undefined') return 1360
    return window.innerWidth
  })
  const searchInputRef = useRef(null)

  const [viewMode, setViewMode] = useState(MODE_LIVE)
  const [historyWindowMs, setHistoryWindowMs] = useState(HISTORY_WINDOWS[0].ms)
  const [timelapsePlaying, setTimelapsePlaying] = useState(true)
  const [timelapseSpeed, setTimelapseSpeed] = useState(TIMELAPSE_SPEEDS[1] ?? 2)
  const isHistoryMode = viewMode !== MODE_LIVE

  const {
    flights,
    loading,
    error,
    lastUpdated,
    rateLimitStatus,
    backoffUntil,
    isStale,
    dataSource,
    pollMs,
    isConstrained,
  } = useFlights(selectedId)

  const history = useFlightHistory({
    enabled: isHistoryMode,
    windowMs: historyWindowMs,
    isPlaying: viewMode === MODE_TIMELAPSE && timelapsePlaying,
    speedMultiplier: timelapseSpeed,
    refreshKey: `${lastUpdated?.getTime() ?? 0}-${viewMode}-${historyWindowMs}`,
  })

  const { weather } = useWeather()
  const hasFlights = flights.length > 0
  const isInitialLoad = loading && !hasFlights && !isHistoryMode
  const constrainedMode = isConstrained || rateLimitStatus === 'blocked' || dataSource?.type === 'cache' || flights.length > 120
  const widthMode = constrainedMode ? 'constrained' : 'normal'

  const selectedLiveFlight = flights.find(f => f.icao24 === selectedId) ?? null
  const selectedHistoryFlight = selectedId ? (history.latestByIcao?.get(selectedId) ?? null) : null
  const selectedFlight = useMemo(() => {
    if (selectedSource === 'history') return selectedHistoryFlight || selectedLiveFlight || null
    return selectedLiveFlight || selectedHistoryFlight || null
  }, [selectedId, selectedSource, selectedHistoryFlight, selectedLiveFlight])

  const activeFlights = isHistoryMode ? history.activeFlights : flights
  const hasSelectedFlight = Boolean(selectedFlight)
  const effectiveSelectedId = selectedFlight ? selectedId : null
  const selectedHistoryTrack = selectedId ? (history.trackByIcao?.get(selectedId) || null) : null
  const trackForMap = selectedSource === 'history' ? selectedHistoryTrack : track
  const detailRefreshMs = selectedFlight ? 1000 : pollMs
  const historyTimeline = isHistoryMode ? {
    mode: viewMode,
    speed: timelapseSpeed,
    playing: timelapsePlaying,
    range: history.range,
    cursorMs: history.cursorMs,
  } : null

  const listWidth = useMemo(() => {
    const ratios = hasSelectedFlight ? VIEWPORT_LIST_RATIO_WITH_DETAILS : VIEWPORT_LIST_RATIO
    return clampPanelSize(viewportWidth * ratios[widthMode], LIST_PANEL_MIN, LIST_PANEL_MAX)
  }, [viewportWidth, widthMode, hasSelectedFlight])

  const detailWidth = useMemo(() => {
    return clampPanelSize(viewportWidth * VIEWPORT_DETAIL_RATIO[widthMode], DETAIL_PANEL_MIN, DETAIL_PANEL_MAX)
  }, [viewportWidth, widthMode])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const onResize = () => setViewportWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const activateFlight = useCallback((icao24) => {
    if (!icao24) return
    setSelectedId(icao24)
    setSelectedSource('live')
    setTrack(null)
    setRunwayAlert(null)
  }, [])

  const handleSelect = useCallback((icao24, source = 'live') => {
    setSelectedId(prev => {
      if (prev === icao24 && selectedSource === source) {
        setSelectedSource('live')
        setTrack(null)
        return null
      }

      setSelectedSource(source)
      if (source === 'live') setTrack(null)
      return icao24
    })

    if (source === 'live') setRunwayAlert(null)
  }, [selectedSource])

  const handleHistorySelect = useCallback((icao24) => {
    handleSelect(icao24, 'history')
  }, [handleSelect])

  const handleClose = useCallback(() => {
    setSelectedId(null)
    setSelectedSource('live')
    setTrack(null)
  }, [])

  const onViewModeChange = useCallback((mode) => {
    setViewMode(mode)
    if (mode !== MODE_TIMELAPSE) setTimelapsePlaying(true)

    if (mode === MODE_LIVE) {
      setSelectedSource('live')
      setTrack(null)
      return
    }

    setSelectedSource('history')
    setTrack(null)
    setRunwayAlert(null)
  }, [])

  const handleRunwaySelection = useCallback((payload) => {
    if (!payload?.flightId) {
      setRunwayAlert(null)
      return
    }

    setRunwayAlert({
      runwayId: payload.runwayId ?? payload.runwayLabel ?? 'Runway',
      runwayLabel: payload.runwayLabel ?? payload.runwayId ?? 'Runway',
      flightId: payload.flightId,
      flightLabel: payload.flightLabel || payload.flightId,
    })
  }, [])

  const handleRunwayAlertClick = useCallback(() => {
    if (!runwayAlert?.flightId) return
    activateFlight(runwayAlert.flightId)
  }, [activateFlight, runwayAlert])

  const handleRunwayAlertDismiss = useCallback(() => setRunwayAlert(null), [])

  useEffect(() => {
    if (!runwayAlert) return
    if (!runwayAlert.flightId || !runwayAlert.flightLabel) {
      setRunwayAlert(null)
      return
    }
    if (!flights.some(f => f.icao24 === runwayAlert.flightId)) {
      setRunwayAlert(null)
    }
  }, [flights, runwayAlert])

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
  }, [effectiveSelectedId, handleClose])

  if (error && flights.length === 0 && !isHistoryMode) {
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
          isConstrained={constrainedMode}
          viewMode={viewMode}
          historyWindows={HISTORY_WINDOWS}
          onViewModeChange={onViewModeChange}
          historyWindowMs={historyWindowMs}
          onHistoryWindowChange={setHistoryWindowMs}
          timelapseSpeed={timelapseSpeed}
          onTimelapseSpeedChange={setTimelapseSpeed}
          timelapsePlaying={timelapsePlaying}
          onTimelapsePlayingChange={setTimelapsePlaying}
          hasHistoryData={history.isReady}
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
        flights={isHistoryMode ? history.activeFlights : flights}
        weather={weather}
        rateLimitStatus={rateLimitStatus}
        backoffUntil={backoffUntil}
        lastUpdated={lastUpdated}
        isStale={isStale}
        dataSource={dataSource}
        isConstrained={constrainedMode}
        viewMode={viewMode}
        historyWindows={HISTORY_WINDOWS}
        onViewModeChange={onViewModeChange}
        historyWindowMs={historyWindowMs}
        onHistoryWindowChange={setHistoryWindowMs}
        timelapseSpeed={timelapseSpeed}
        onTimelapseSpeedChange={setTimelapseSpeed}
        timelapsePlaying={timelapsePlaying}
        onTimelapsePlayingChange={setTimelapsePlaying}
        hasHistoryData={history.isReady}
      />

      <div className="main-layout">
        <NearbyList
          flights={activeFlights}
          selectedId={effectiveSelectedId}
          onSelect={isHistoryMode ? handleHistorySelect : handleSelect}
          searchInputRef={searchInputRef}
          width={listWidth}
          loading={loading}
          error={error}
        />

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden', minWidth: 0 }}>
          <FlightMap
            flights={activeFlights}
            selectedFlight={selectedFlight}
            onSelect={isHistoryMode ? handleHistorySelect : handleSelect}
            onHistorySelect={isHistoryMode ? handleHistorySelect : null}
            onRunwaySelect={handleRunwaySelection}
            track={trackForMap}
            detailPanelWidth={selectedFlight ? detailWidth : 0}
            historyPathFeatures={isHistoryMode ? history.pathFeatures : null}
            congestionFeatures={isHistoryMode ? history.congestion : null}
            timeline={historyTimeline}
          />
          {runwayAlert && (
            <div style={{
              position: 'absolute',
              top: 72,
              left: 16,
              zIndex: 20,
              background: 'var(--panel-overlay-soft)',
              border: '1px solid rgba(var(--cyan-alt-rgb), 0.35)',
              borderRadius: 7,
              padding: '10px 12px',
              maxWidth: 420,
              backdropFilter: 'blur(12px)',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}>
              <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'rgba(var(--cyan-alt-rgb), 0.75)', letterSpacing: 1.8 }}>
                {runwayAlert.runwayLabel}
              </span>
              <span style={{ fontSize: 11, color: 'var(--text-dim)', letterSpacing: 0.5 }}>
                inbound:
              </span>
              <button
                type="button"
                onClick={handleRunwayAlertClick}
                style={{
                  background: 'rgba(var(--cyan-alt-rgb), 0.1)',
                  color: 'var(--cyan-alt)',
                  border: '1px solid rgba(var(--cyan-alt-rgb), 0.5)',
                  borderRadius: 4,
                  padding: '4px 9px',
                  fontFamily: 'var(--font-display)',
                  fontSize: 11,
                  letterSpacing: 1,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {runwayAlert.flightLabel}
              </button>
              <button
                type="button"
                onClick={handleRunwayAlertDismiss}
                aria-label="Dismiss runway arrival notification"
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 4,
                  border: '1px solid rgba(var(--text-soft-rgb), 0.35)',
                  background: 'rgba(var(--text-soft-rgb), 0.06)',
                  color: 'var(--text-dim)',
                  fontFamily: 'var(--font-display)',
                  cursor: 'pointer',
                  fontSize: 12,
                }}
              >
                ×
              </button>
            </div>
          )}
        </div>

        <div
          className={`detail-overlay${selectedFlight ? ' open' : ''}`}
          style={{ width: detailWidth }}
        >
          {selectedFlight && (
            <FlightDetail
              key={`${selectedSource}-${selectedFlight?.icao24}`}
              flight={selectedFlight}
              onClose={handleClose}
              autoFocusCloseButton
              onTrackLoad={selectedSource === 'live' ? setTrack : undefined}
              preloadedTrack={selectedSource === 'history' ? trackForMap : null}
              lastUpdated={lastUpdated}
              refreshMs={detailRefreshMs}
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
