import { useState, useEffect } from 'react'
import { weatherCodeToCondition, estimateActiveRunways } from '../api/weather'
import { headingToCardinal } from '../utils/geo'
import ApiStatusIndicator from './ApiStatusIndicator'

function Clock() {
  const [time, setTime] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  const local = time.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
    timeZone: 'America/New_York',
    timeZoneName: 'short',
  })
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
      <span style={{ fontSize: 13, color: 'var(--heading)', fontWeight: 600 }}>
        {local}
      </span>
    </div>
  )
}

function DataSourceBadge({ dataSource }) {
  if (!dataSource || dataSource.type === 'live') return null
  const isMock = dataSource.type === 'mock' || dataSource.cacheSource === 'mock'
  const stamp = dataSource.cachedAt
    ? dataSource.cachedAt.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: 'America/New_York',
      })
    : null
  const label = stamp ? `${isMock ? 'MOCK' : 'CACHE'} · ${stamp}` : (isMock ? 'MOCK' : 'CACHE')
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      background: 'rgba(var(--amber-rgb), 0.09)',
      border: '1px solid rgba(var(--amber-rgb), 0.38)',
      borderRadius: 999,
      padding: '3px 9px',
      marginRight: 8,
      fontSize: 12,
      color: 'var(--amber)',
      fontWeight: 600,
    }}>
      <span style={{ fontSize: 9, opacity: 0.7 }}>⬡</span>
      <span>{label}</span>
    </div>
  )
}

function ModeControls({
  viewMode,
  historyWindows,
  onViewModeChange,
  historyWindowMs,
  onHistoryWindowChange,
  timelapseSpeed,
  onTimelapseSpeedChange,
  timelapsePlaying,
  onTimelapsePlayingChange,
  hasHistoryData,
}) {
  const canUseWindow = viewMode !== 'live'

  return (
    <div style={{
      display: 'flex',
      gap: 10,
      alignItems: 'center',
      fontSize: 11,
      color: 'var(--text-dim)',
      paddingTop: 2,
      flexWrap: 'wrap',
    }}>
      <select
        value={viewMode}
        aria-label="Select flight map mode"
        onChange={e => onViewModeChange(e.target.value)}
        style={{
          borderRadius: 5,
          border: '1px solid var(--panel-border)',
          background: 'var(--panel-strong)',
          color: 'var(--heading)',
          padding: '5px 7px',
          fontSize: 11,
          fontWeight: 600,
        }}
      >
        <option value="live">Live</option>
        <option value="history">History</option>
        <option value="timelapse">Timelapse</option>
      </select>

      <select
        value={historyWindowMs}
        aria-label="Select flight history window"
        disabled={!canUseWindow}
        onChange={e => onHistoryWindowChange(Number(e.target.value))}
        style={{
          borderRadius: 5,
          border: '1px solid var(--panel-border)',
          background: canUseWindow ? 'var(--panel-strong)' : 'transparent',
          color: canUseWindow ? 'var(--heading)' : 'var(--text-dim)',
          padding: '5px 7px',
          fontSize: 11,
        }}
      >
        {historyWindows.map(window => (
          <option key={window.ms} value={window.ms}>{window.label}</option>
        ))}
      </select>

      <select
        value={timelapseSpeed}
        aria-label="Select timelapse speed"
        disabled={viewMode !== 'timelapse' || !hasHistoryData}
        onChange={e => onTimelapseSpeedChange(Number(e.target.value))}
        style={{
          borderRadius: 5,
          border: '1px solid var(--panel-border)',
          background: hasHistoryData ? 'var(--panel-strong)' : 'transparent',
          color: hasHistoryData ? 'var(--heading)' : 'var(--text-dim)',
          padding: '5px 7px',
          fontSize: 11,
        }}
      >
        {[2, 3, 4].map(speed => (
          <option key={speed} value={speed}>{`${speed}x`}</option>
        ))}
      </select>

      <button
        type="button"
        onClick={() => onTimelapsePlayingChange(!timelapsePlaying)}
        disabled={viewMode !== 'timelapse' || !hasHistoryData}
        aria-label={timelapsePlaying ? 'Pause timelapse replay' : 'Play timelapse replay'}
        style={{
          borderRadius: 5,
          border: '1px solid var(--panel-border)',
          background: 'var(--panel-strong)',
          color: timelapsePlaying ? 'var(--green)' : 'var(--text)',
          fontSize: 11,
          fontWeight: 600,
          padding: '5px 7px',
          whiteSpace: 'nowrap',
          opacity: viewMode === 'timelapse' && hasHistoryData ? 1 : 0.5,
        }}
      >
        {timelapsePlaying ? '⏸ Pause' : '▶ Play'}
      </button>

      <span style={{
        color: 'var(--text-dim)',
        whiteSpace: 'nowrap',
        fontSize: 10,
      }}>
        {hasHistoryData ? 'HISTORY READY' : 'NO HISTORY'}
      </span>
    </div>
  )
}

export default function HUDBar({
  flights,
  weather,
  rateLimitStatus,
  backoffUntil,
  lastUpdated,
  isStale,
  dataSource,
  isConstrained,
  viewMode = 'live',
  historyWindows = [{ label: 'Last day', ms: 24 * 60 * 60 * 1000 }],
  onViewModeChange = () => {},
  historyWindowMs = historyWindows[0]?.ms ?? 24 * 60 * 60 * 1000,
  onHistoryWindowChange = () => {},
  timelapseSpeed = 2,
  onTimelapseSpeedChange = () => {},
  timelapsePlaying = true,
  onTimelapsePlayingChange = () => {},
  hasHistoryData = false,
}) {
  const condition = weather ? weatherCodeToCondition(weather.weather_code) : null
  const windDir = weather ? Math.round(weather.wind_direction_10m) : null
  const windSpd = weather ? Math.round(weather.wind_speed_10m) : null
  const windGust = weather ? Math.round(weather.wind_gusts_10m) : null
  const temp = weather ? Math.round(weather.temperature_2m) : null
  const cardinal = windDir !== null ? headingToCardinal(windDir) : '—'
  const runways = weather ? estimateActiveRunways(windDir) : []
  const airborne = flights.length
  const blocked = rateLimitStatus === 'blocked'
  const sourceType = dataSource?.type || 'live'
  const isLiveSource = sourceType === 'live' && !blocked
  const feedLabel = isLiveSource ? 'LIVE' : sourceType === 'mock' ? 'MOCK' : 'CACHE'
  const feedColor = isLiveSource ? 'var(--green)' : blocked ? 'var(--red)' : 'var(--amber)'

  return (
    <div className="hudbar">
      <div className="hudbar-main">
        <div className="hudbar-logo">
          <img src="/twa-logo.png" alt="TWA Hotel" height={34} style={{ display: 'block' }} />
          <div style={{ lineHeight: 1.1 }}>
            <div style={{ fontSize: 13, color: 'var(--heading)', fontWeight: 700 }}>TWA Flight Deck</div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>KJFK · Hotel Ops</div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: feedColor,
            animation: isLiveSource ? 'pulse-dot 1.4s ease-in-out infinite' : 'none',
            boxShadow: isLiveSource ? `0 0 8px ${feedColor}` : 'none',
            opacity: isLiveSource ? 1 : 0.74,
          }} />
          <span style={{ fontSize: 12, color: feedColor, fontWeight: 600 }}>
            {feedLabel}
          </span>
        </div>

        <DataSourceBadge dataSource={dataSource} />
        <ApiStatusIndicator
          status={rateLimitStatus || 'ok'}
          backoffUntil={backoffUntil}
          lastUpdated={lastUpdated}
          isStale={isStale}
        />

        <div className="hudbar-stats">
          <HUDStat label="Aircraft" value={airborne || '—'} />
          {weather && <HUDStat label="Wind" value={`${cardinal} ${windSpd} mph`} />}
          {weather && windGust > windSpd + 5 && <HUDStat label="Gust" value={`${windGust} mph`} color="var(--amber)" />}
          {weather && <HUDStat label="Temp" value={`${temp}°F`} />}
          {weather && condition && <HUDStat label="Sky" value={condition} />}
          {weather && runways.length > 0 && <HUDStat label="Runways" value={runways.join(' · ')} color="var(--amber)" />}
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          {isConstrained && (
            <div style={{
              border: '1px solid rgba(var(--cyan-rgb), 0.35)',
              color: 'var(--cyan)',
              borderRadius: 999,
              padding: '3px 9px',
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 0.3,
            }}>
              AUTO MODE
            </div>
          )}
          <Clock />
        </div>
      </div>

      <div className="hudbar-controls">
        <ModeControls
          viewMode={viewMode}
          historyWindows={historyWindows}
          onViewModeChange={onViewModeChange}
          historyWindowMs={historyWindowMs}
          onHistoryWindowChange={onHistoryWindowChange}
          timelapseSpeed={timelapseSpeed}
          onTimelapseSpeedChange={onTimelapseSpeedChange}
          timelapsePlaying={timelapsePlaying}
          onTimelapsePlayingChange={onTimelapsePlayingChange}
          hasHistoryData={hasHistoryData}
        />
      </div>
    </div>
  )
}

function HUDStat({ label, value, color = 'var(--heading)' }) {
  return (
    <div style={{ display: 'grid', gap: 2 }}>
      <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{label}</span>
      <span style={{ fontSize: 13, color, fontWeight: 600, whiteSpace: 'nowrap' }}>{value}</span>
    </div>
  )
}
