import { useState, useCallback, useEffect, useMemo } from 'react'
import HUDBar from './components/HUDBar'
import FlightMap from './components/FlightMap'
import NearbyList from './components/NearbyList'
import FlightDetail from './components/FlightDetail'
import { getFallbackFeedLabel } from './api/fallbackFeed'
import useFlights from './hooks/useFlights'
import useWeather from './hooks/useWeather'
import useFlightHistory from './hooks/useFlightHistory'
import useDeviceLocation from './hooks/useDeviceLocation'
import { INITIAL_VIEW } from './components/flightMapConfig'
import { JFK, MAP_RADIUS_MI } from './config/airspace'

const LIST_PANEL_MIN = 232
const LIST_PANEL_MAX = 396
const DETAIL_PANEL_MIN = 350
const DETAIL_PANEL_MAX = 690
const PANEL_COLLAPSED_WIDTH = 50
const LIST_PANEL_MIN_RESPONSIVE = 208
const DETAIL_PANEL_MIN_RESPONSIVE = 220
const AUTO_COLLAPSE_LIST_AT = 1040
const AUTO_COLLAPSE_DETAIL_AT = 680
const VIEWPORT_LIST_RATIO = { normal: 0.21, constrained: 0.18 }
const VIEWPORT_LIST_RATIO_WITH_DETAILS = { normal: 0.175, constrained: 0.15 }
const VIEWPORT_DETAIL_RATIO = { normal: 0.36, constrained: 0.31 }

const MODE_LIVE = 'live'
const MODE_TIMELAPSE = 'timelapse'
const MODE_HISTORY = 'history'

const HISTORY_WINDOWS = [
  { label: 'Last day', ms: 24 * 60 * 60 * 1000 },
  { label: 'Last 3 days', ms: 3 * 24 * 60 * 60 * 1000 },
  { label: 'Last week', ms: 7 * 24 * 60 * 60 * 1000 },
]

const TIMELAPSE_SPEEDS = [2, 3, 4]
const HAS_OPENSKY_AUTH = import.meta.env.VITE_OPENSKY_AUTH_ENABLED === 'true'

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v))
}

function clampPanelSize(value, minimum, maximum) {
  return clamp(Math.round(value), minimum, maximum)
}

function normalizeFlightId(value) {
  return String(value || '').trim().toLowerCase()
}

export default function App() {
  const [selectedId, setSelectedId] = useState(null)
  const [selectedSource, setSelectedSource] = useState(MODE_LIVE)
  const [track, setTrack] = useState(null)
  const [runwayAlert, setRunwayAlert] = useState(null)
  const [listCollapsed, setListCollapsed] = useState(false)
  const [detailCollapsed, setDetailCollapsed] = useState(false)
  const [listExpandedOverride, setListExpandedOverride] = useState(false)
  const [detailExpandedOverride, setDetailExpandedOverride] = useState(false)
  const [viewportWidth, setViewportWidth] = useState(() => {
    if (typeof window === 'undefined') return 1360
    return window.innerWidth
  })
  const [viewMode, setViewMode] = useState(MODE_LIVE)
  const [historyWindowMs, setHistoryWindowMs] = useState(HISTORY_WINDOWS[0].ms)
  const [timelapsePlaying, setTimelapsePlaying] = useState(true)
  const [timelapseSpeed, setTimelapseSpeed] = useState(TIMELAPSE_SPEEDS[1] ?? 2)
  const isHistoryMode = viewMode !== MODE_LIVE

  const deviceLocation = useDeviceLocation({
    fallbackCenter: JFK,
    fallbackRadiusMi: MAP_RADIUS_MI,
    timeoutMs: 9000,
  })
  const searchCenter = deviceLocation.center || JFK
  const searchRadiusMi = deviceLocation.radiusMi
  const searchUsesDeviceCenter = deviceLocation.isDeviceLocation

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
  } = useFlights(selectedId, {
    searchCenter,
    searchRadiusMi,
    applyJfkRouteFilter: !searchUsesDeviceCenter,
  })

  const history = useFlightHistory({
    enabled: true,
    windowMs: historyWindowMs,
    isPlaying: viewMode === MODE_TIMELAPSE && timelapsePlaying,
    speedMultiplier: timelapseSpeed,
    refreshKey: `${lastUpdated?.getTime() ?? 0}-${viewMode}-${historyWindowMs}`,
    selectedIcao: selectedId,
  })

  const { weather } = useWeather()
  const hasFlights = flights.length > 0
  const isInitialLoad = loading && !hasFlights && !isHistoryMode
  const constrainedMode = isConstrained || rateLimitStatus === 'blocked' || dataSource?.type === 'cache'
  const widthMode = constrainedMode ? 'constrained' : 'normal'
  const activeFlights = isHistoryMode ? history.activeFlights : flights

  const selectedLiveFlight = selectedId
    ? flights.find(f => String(f.icao24 || '').toLowerCase() === selectedId)
    : null
  const selectedHistoryFlight = selectedId ? (history.latestByIcao?.get(selectedId) ?? null) : null

  const searchCenterLat = searchCenter?.lat
  const searchCenterLon = searchCenter?.lon

  const mapInitialView = useMemo(() => {
    if (!Number.isFinite(searchCenterLat) || !Number.isFinite(searchCenterLon)) return INITIAL_VIEW
    const zoom = searchRadiusMi > 80
      ? 9.4
      : searchRadiusMi > 35
        ? 10
        : searchRadiusMi > 18
          ? 10.8
          : 11.6

    return {
      ...INITIAL_VIEW,
      center: [searchCenterLon, searchCenterLat],
      zoom,
      bearing: 0,
      pitch: 52,
    }
  }, [searchCenterLat, searchCenterLon, searchRadiusMi])
  const selectedFlightForMap = useMemo(() => {
    if (!selectedId) return null
    return activeFlights.find(f => String(f.icao24 || '').toLowerCase() === selectedId) || null
  }, [activeFlights, selectedId])

  const selectedFlight = useMemo(() => {
    if (!selectedId) return null

    if (selectedSource === MODE_HISTORY || isHistoryMode) {
      return selectedFlightForMap || selectedHistoryFlight || selectedLiveFlight
    }

    return selectedLiveFlight || selectedFlightForMap || selectedHistoryFlight
  }, [isHistoryMode, selectedFlightForMap, selectedId, selectedSource, selectedHistoryFlight, selectedLiveFlight])

  const hasSelectedFlight = Boolean(selectedFlight)
  const effectiveSelectedId = selectedFlight ? selectedId : null
  const selectedHistoryTrack = selectedId ? (history.trackByIcao?.get(selectedId) || null) : null
  const trackForMap = selectedSource === MODE_HISTORY ? selectedHistoryTrack : track
  const detailRefreshMs = selectedFlight ? 1000 : pollMs
  const detailFeedMode = useMemo(() => {
    if (selectedSource === MODE_HISTORY || isHistoryMode) return MODE_HISTORY
    return dataSource?.type === 'fallback' ? 'fallback' : 'live'
  }, [selectedSource, isHistoryMode, dataSource?.type])
  const detailTrackRefreshKey = useMemo(() => {
    return `${selectedId ?? ''}:${selectedSource}:${detailFeedMode}:${lastUpdated?.getTime() ?? 0}`
  }, [selectedId, selectedSource, detailFeedMode, lastUpdated])
  const detailConnectionLabel = dataSource?.type === 'fallback'
    ? getFallbackFeedLabel()
    : dataSource?.type === 'cache'
      ? (dataSource?.cacheSource === 'mock'
        ? 'Simulated traffic cache'
        : dataSource?.cacheSource === 'snapshot'
          ? 'Local snapshot cache'
          : 'Local DB cache')
      : (dataSource?.authConfigured ?? HAS_OPENSKY_AUTH) === false
        ? 'OpenSky anonymous quota'
        : 'OpenSky Network'
  const historyTimeline = isHistoryMode ? {
    mode: viewMode,
    speed: timelapseSpeed,
    playing: timelapsePlaying,
    range: history.range,
    cursorMs: history.cursorMs,
  } : null

  const listWidth = useMemo(() => {
    const ratios = hasSelectedFlight ? VIEWPORT_LIST_RATIO_WITH_DETAILS : VIEWPORT_LIST_RATIO
    const min = Math.min(LIST_PANEL_MIN, Math.max(LIST_PANEL_MIN_RESPONSIVE, Math.round(viewportWidth * 0.24)))
    const max = Math.min(LIST_PANEL_MAX, Math.round(viewportWidth * (hasSelectedFlight ? 0.44 : 0.52)))
    return clampPanelSize(viewportWidth * ratios[widthMode], min, Math.max(min, max))
  }, [viewportWidth, widthMode, hasSelectedFlight])

  const detailWidth = useMemo(() => {
    const min = Math.min(DETAIL_PANEL_MIN, Math.max(DETAIL_PANEL_MIN_RESPONSIVE, Math.round(viewportWidth * 0.31)))
    const max = Math.min(DETAIL_PANEL_MAX, Math.round(viewportWidth * 0.64))
    return clampPanelSize(viewportWidth * VIEWPORT_DETAIL_RATIO[widthMode], min, Math.max(min, max))
  }, [viewportWidth, widthMode])

  const autoCollapseList = hasSelectedFlight && viewportWidth < AUTO_COLLAPSE_LIST_AT
  const autoCollapseDetail = hasSelectedFlight && viewportWidth < AUTO_COLLAPSE_DETAIL_AT
  const effectiveListCollapsed = listCollapsed || (autoCollapseList && !listExpandedOverride)
  const effectiveDetailCollapsed = detailCollapsed || (autoCollapseDetail && !detailExpandedOverride)

  const listPanelWidth = effectiveListCollapsed ? PANEL_COLLAPSED_WIDTH : listWidth
  const detailPanelVisible = Boolean(selectedFlight)
  const detailPanelWidth = detailPanelVisible
    ? (effectiveDetailCollapsed ? PANEL_COLLAPSED_WIDTH : detailWidth)
    : 0

  useEffect(() => {
    if (typeof window === 'undefined') return
    const onResize = () => setViewportWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const activateFlight = useCallback((icao24) => {
    const nextId = normalizeFlightId(icao24)
    if (!nextId) return
    setSelectedId(nextId)
    setSelectedSource(MODE_LIVE)
    setTrack(null)
    setRunwayAlert(null)
    setDetailCollapsed(false)
    setListExpandedOverride(false)
    setDetailExpandedOverride(false)
  }, [])

  const handleSelect = useCallback((icao24, source = MODE_LIVE) => {
    const nextId = normalizeFlightId(icao24)
    if (!nextId) return

    setSelectedId(prev => {
      if (prev === nextId && selectedSource === source) {
        setSelectedSource(MODE_LIVE)
        setTrack(null)
        return null
      }

      setSelectedSource(source)
      if (source === MODE_LIVE) setTrack(null)
      return nextId
    })

    setDetailCollapsed(false)
    setListExpandedOverride(false)
    setDetailExpandedOverride(false)
    if (source === MODE_LIVE) setRunwayAlert(null)
  }, [selectedSource])

  const handleHistorySelect = useCallback((icao24) => {
    handleSelect(icao24, MODE_HISTORY)
  }, [handleSelect])

  const handleClose = useCallback(() => {
    setSelectedId(null)
    setSelectedSource(MODE_LIVE)
    setTrack(null)
    setDetailCollapsed(false)
    setDetailExpandedOverride(false)
  }, [])

  const onViewModeChange = useCallback((mode) => {
    setViewMode(mode)
    if (mode !== MODE_TIMELAPSE) setTimelapsePlaying(true)

    if (mode === MODE_LIVE) {
      setSelectedSource(MODE_LIVE)
      setTrack(null)
      return
    }

    setSelectedSource(MODE_HISTORY)
    setTrack(null)
    setRunwayAlert(null)
  }, [])

  const handleRunwaySelection = useCallback((payload) => {
    const runwayId = payload?.runwayId ?? payload?.runwayLabel ?? null
    const runwayLabel = payload?.runwayLabel ?? payload?.runwayId ?? runwayId

    if (!runwayId) {
      setRunwayAlert(null)
      return
    }

    setSelectedId(null)
    setSelectedSource(MODE_LIVE)
    setTrack(null)

    setRunwayAlert({
      runwayId,
      runwayLabel,
      flightId: payload?.flightId ? normalizeFlightId(payload.flightId) : null,
      flightLabel: payload?.flightLabel || payload?.flightId || null,
    })
  }, [])

  const runwayFlightIds = (() => (
    new Set(
      flights
        .map(f => f?.icao24)
        .filter(Boolean)
        .map(id => normalizeFlightId(id))
    )
  ))()

  const visibleRunwayAlert = (() => {
    if (!runwayAlert) return null
    const validFlightId = normalizeFlightId(runwayAlert.flightId)
    if (!validFlightId || !runwayAlert.flightLabel) return null
    if (!runwayFlightIds.has(validFlightId)) return null
    return {
      ...runwayAlert,
      flightId: validFlightId,
      flightLabel: runwayAlert.flightLabel,
    }
  })()

  const handleRunwayAlertClick = useCallback(() => {
    if (!visibleRunwayAlert?.flightId) return
    activateFlight(visibleRunwayAlert.flightId)
  }, [activateFlight, visibleRunwayAlert])

  const handleRunwayAlertDismiss = useCallback(() => setRunwayAlert(null), [])
  const toggleListCollapsed = useCallback(() => {
    if (effectiveListCollapsed) {
      setListCollapsed(false)
      setListExpandedOverride(true)
      return
    }

    setListCollapsed(true)
    setListExpandedOverride(false)
  }, [effectiveListCollapsed])
  const expandDetailPanel = useCallback(() => {
    setDetailCollapsed(false)
    setDetailExpandedOverride(true)
  }, [])
  const collapseDetailPanel = useCallback(() => {
    setDetailCollapsed(true)
    setDetailExpandedOverride(false)
  }, [])

  useEffect(() => {
    const onGlobalKeyDown = (event) => {
      if (event.key === 'Escape' && effectiveSelectedId) {
        event.preventDefault()
        handleClose()
        return
      }
    }

    window.addEventListener('keydown', onGlobalKeyDown)
    return () => window.removeEventListener('keydown', onGlobalKeyDown)
  }, [effectiveSelectedId, handleClose])

  if (error && flights.length === 0 && !isHistoryMode && dataSource?.type !== 'cache') {
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
          selectedRunwayId={runwayAlert?.runwayId ?? null}
          onRunwaySelect={handleRunwaySelection}
          viewMode={viewMode}
          historyWindows={HISTORY_WINDOWS}
          onViewModeChange={onViewModeChange}
          historyWindowMs={historyWindowMs}
          onHistoryWindowChange={setHistoryWindowMs}
          timelapseSpeed={timelapseSpeed}
          onTimelapseSpeedChange={setTimelapseSpeed}
          timelapsePlaying={timelapsePlaying}
          onTimelapsePlayingChange={setTimelapsePlaying}
          hasHistoryData={history.hasData}
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
            LIVE FEED HOLD
          </div>
          <div role="alert" style={{ fontSize: 13, color: 'var(--red-dim)', letterSpacing: 0.1 }}>
            Traffic data temporarily unavailable
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
        selectedRunwayId={runwayAlert?.runwayId ?? null}
        onRunwaySelect={handleRunwaySelection}
        viewMode={viewMode}
        historyWindows={HISTORY_WINDOWS}
        onViewModeChange={onViewModeChange}
        historyWindowMs={historyWindowMs}
        onHistoryWindowChange={setHistoryWindowMs}
        timelapseSpeed={timelapseSpeed}
        onTimelapseSpeedChange={setTimelapseSpeed}
        timelapsePlaying={timelapsePlaying}
        onTimelapsePlayingChange={setTimelapsePlaying}
        hasHistoryData={history.hasData}
      />

      <div className="main-layout">
        <NearbyList
          flights={activeFlights}
          selectedId={effectiveSelectedId}
          onSelect={isHistoryMode ? handleHistorySelect : handleSelect}
          width={listPanelWidth}
          loading={loading}
          error={error}
          collapsed={effectiveListCollapsed}
          onToggleCollapse={toggleListCollapsed}
        />

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden', minWidth: 0 }}>
          <FlightMap
            flights={activeFlights}
            selectedFlight={selectedFlight}
            selectedRunwayId={runwayAlert?.runwayId ?? null}
            onSelect={isHistoryMode ? handleHistorySelect : handleSelect}
            onHistorySelect={isHistoryMode ? handleHistorySelect : null}
            onRunwaySelect={handleRunwaySelection}
            track={trackForMap}
            leftPanelWidth={listPanelWidth}
            rightPanelWidth={detailPanelWidth}
            historyPathFeatures={history.pathFeatures}
            congestionFeatures={isHistoryMode ? history.congestion : null}
            timeline={historyTimeline}
            initialView={mapInitialView}
          />
          {visibleRunwayAlert && (
            <div style={{
              position: 'absolute',
              top: 72,
              left: listPanelWidth + 12,
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
                {visibleRunwayAlert.runwayLabel}
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
                {visibleRunwayAlert.flightLabel}
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
          style={{ width: detailPanelWidth }}
        >
          {selectedFlight && !effectiveDetailCollapsed && (
            <FlightDetail
              key={`${selectedSource}-${selectedFlight?.icao24}`}
              flight={selectedFlight}
              onClose={handleClose}
              onCollapse={collapseDetailPanel}
              autoFocusCloseButton
              onTrackLoad={selectedSource === MODE_LIVE ? setTrack : undefined}
              feedMode={detailFeedMode}
              trackRefreshKey={detailTrackRefreshKey}
              preloadedTrack={selectedSource === MODE_HISTORY ? trackForMap : null}
              lastUpdated={lastUpdated}
              refreshMs={detailRefreshMs}
            />
          )}
          {selectedFlight && effectiveDetailCollapsed && (
            <div style={{
              width: '100%',
              height: '100%',
              background: 'var(--panel-strong)',
              borderLeft: '1px solid var(--border-bright)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              paddingTop: 16,
              gap: 12,
            }}>
              <button
                type="button"
                onClick={expandDetailPanel}
                aria-label="Expand flight detail panel"
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 6,
                  border: '1px solid rgba(var(--cyan-alt-rgb), 0.35)',
                  background: 'rgba(var(--cyan-alt-rgb), 0.08)',
                  color: 'var(--cyan-alt)',
                  cursor: 'pointer',
                  fontSize: 15,
                  lineHeight: '28px',
                  textAlign: 'center',
                }}
              >
                ‹
              </button>
              <div style={{
                writingMode: 'vertical-rl',
                transform: 'rotate(180deg)',
                fontSize: 10,
                letterSpacing: 1.2,
                color: 'var(--text-dim)',
                fontFamily: 'var(--font-mono)',
              }}>
                FLIGHT DETAIL
              </div>
            </div>
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
            Connecting to {detailConnectionLabel}
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
