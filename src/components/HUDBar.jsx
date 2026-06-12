import { useState, useEffect } from 'react'
import { weatherCodeToCondition, estimateActiveRunways } from '../api/weather'
import { headingToCardinal } from '../utils/geo'

const HAS_OPENSKY_AUTH = import.meta.env.VITE_OPENSKY_AUTH_ENABLED === 'true'
const ALL_RUNWAY_IDS = ['04L/22R', '04R/22L', '13L/31R', '13R/31L']

const TILE_SHELL = {
  minHeight: 66,
  padding: '10px 13px',
  borderRadius: 18,
  background: 'linear-gradient(180deg, rgba(19, 33, 47, 0.92), rgba(9, 15, 24, 0.92))',
  border: '1px solid rgba(255,255,255,0.08)',
  boxShadow: '0 16px 32px rgba(0,0,0,0.26), inset 0 1px 0 rgba(255,255,255,0.05)',
  backdropFilter: 'blur(14px)',
}

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
    <span
      style={{
        width: '100%',
        minWidth: 0,
        textAlign: 'center',
        fontSize: 14,
        fontWeight: 650,
        letterSpacing: '0.045em',
        fontVariantNumeric: 'tabular-nums',
        fontFeatureSettings: '"tnum" 1, "ss01" 1',
        color: 'var(--heading)',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}
    >
      {local}
    </span>
  )
}

function CenterBadgeLogo() {
  return (
    <svg width="78" height="58" viewBox="0 0 78 58" aria-hidden="true">
      <defs>
        <linearGradient id="twa-glow" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="rgba(255,255,255,0.96)" />
          <stop offset="100%" stopColor="rgba(196,232,244,0.94)" />
        </linearGradient>
      </defs>
      <circle cx="39" cy="29" r="26.5" fill="rgba(0,195,255,0.08)" stroke="rgba(0,195,255,0.22)" />
      <path d="M15 17h48" stroke="rgba(0,195,255,0.18)" strokeWidth="1.4" strokeLinecap="round" />
      <text
        x="39"
        y="31"
        textAnchor="middle"
        fontFamily="Georgia, 'Times New Roman', serif"
        fontWeight="700"
        fontSize="22"
        letterSpacing="5"
        fill="url(#twa-glow)"
      >
        TWA
      </text>
      <text
        x="39"
        y="42.5"
        textAnchor="middle"
        fontFamily="JetBrains Mono, monospace"
        fontWeight="600"
        fontSize="6.6"
        letterSpacing="3.1"
        fill="rgba(0,195,255,0.84)"
      >
        FLIGHT DESK
      </text>
    </svg>
  )
}

function HUDTile({
  label,
  accent = 'var(--heading)',
  detail,
  wide = false,
  center = false,
  narrow = false,
  value,
  children,
}) {
  return (
    <div
      style={{
        ...TILE_SHELL,
        minWidth: narrow ? 116 : wide ? 206 : 124,
        display: 'grid',
        alignContent: 'space-between',
        gap: 7,
        justifyItems: center ? 'center' : 'stretch',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: center ? 'center' : 'space-between',
          gap: 9,
          minWidth: 0,
        }}
      >
        <span
          style={{
            fontSize: 10,
            color: 'var(--text-dim)',
            letterSpacing: 1.35,
            textTransform: 'uppercase',
            whiteSpace: 'nowrap',
          }}
        >
          {label}
        </span>
        {!center && (
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: accent,
              boxShadow: `0 0 12px ${accent}`,
              flex: '0 0 auto',
            }}
          />
        )}
      </div>
      {children || (
        <div style={{ display: 'grid', gap: 3, justifyItems: center ? 'center' : 'start', minWidth: 0 }}>
          <div
            style={{
              fontSize: 14,
              lineHeight: 1.15,
              fontWeight: 650,
              color: accent,
              minWidth: 0,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {value}
          </div>
          <div
            style={{
              fontSize: 11,
              lineHeight: 1.2,
              color: 'rgba(var(--text-soft-rgb), 0.9)',
              minWidth: 0,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {detail || ' '}
          </div>
        </div>
      )}
    </div>
  )
}

function WindTile({ direction, cardinal, speed, gust }) {
  const gustSpread = Number.isFinite(gust) && Number.isFinite(speed) ? Math.max(0, gust - speed) : null
  const directionLabel = Number.isFinite(direction) ? `${cardinal} ${direction}°` : '—'
  const flowLabel = gustSpread && gustSpread >= 6 ? `gust +${gustSpread} mph` : 'steady flow'

  return (
    <HUDTile label="Wind" accent="var(--cyan-alt)" wide>
      <div style={{ display: 'grid', gridTemplateColumns: '38px minmax(0, 1fr)', gap: 10, alignItems: 'center' }}>
        <div
          style={{
            width: 38,
            height: 38,
            borderRadius: '50%',
            border: '1px solid rgba(var(--cyan-alt-rgb), 0.26)',
            background: 'radial-gradient(circle, rgba(var(--cyan-alt-rgb), 0.2), rgba(255,255,255,0.02) 68%)',
            display: 'grid',
            placeItems: 'center',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.07)',
          }}
        >
          <div
            style={{
              width: 0,
              height: 0,
              borderLeft: '7px solid transparent',
              borderRight: '7px solid transparent',
              borderBottom: '14px solid rgba(var(--cyan-alt-rgb), 0.98)',
              transform: `rotate(${Number.isFinite(direction) ? direction : 0}deg)`,
              transition: 'transform 320ms ease-out',
              filter: 'drop-shadow(0 0 7px rgba(0,195,255,0.24))',
            }}
          />
        </div>
        <div style={{ display: 'grid', gap: 2, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 650, color: 'var(--cyan-alt)', whiteSpace: 'nowrap' }}>
            {Number.isFinite(speed) ? `${speed} mph` : '—'}
          </div>
          <div style={{ fontSize: 11, color: 'rgba(var(--text-soft-rgb), 0.9)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {directionLabel} · {flowLabel}
          </div>
        </div>
      </div>
    </HUDTile>
  )
}

function RunwayTile({ activeRunways, selectedRunwayId, onRunwaySelect }) {
  const activeSet = new Set((activeRunways || []).map(runway => String(runway).trim().toUpperCase()))
  const selected = String(selectedRunwayId || '').trim().toUpperCase()

  return (
    <HUDTile label="Runways" accent="var(--amber)">
      <div style={{ display: 'grid', gap: 7 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 6 }}>
          {ALL_RUNWAY_IDS.map((runwayId) => {
            const isActive = activeSet.has(runwayId)
            const isSelected = selected === runwayId
            return (
              <button
                key={runwayId}
                type="button"
                onClick={() => onRunwaySelect?.({
                  runwayId,
                  runwayLabel: runwayId,
                  flightId: null,
                  flightLabel: null,
                })}
                style={{
                  minHeight: 24,
                  padding: '0 8px',
                  borderRadius: 9,
                  border: `1px solid ${isSelected ? 'rgba(var(--cyan-alt-rgb), 0.42)' : isActive ? 'rgba(var(--amber-rgb), 0.3)' : 'rgba(255,255,255,0.07)'}`,
                  background: isSelected
                    ? 'rgba(var(--cyan-alt-rgb), 0.14)'
                    : isActive
                      ? 'rgba(var(--amber-rgb), 0.12)'
                      : 'rgba(255,255,255,0.03)',
                  color: isSelected ? 'var(--cyan-alt)' : isActive ? 'var(--amber)' : 'var(--text-soft)',
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {runwayId}
              </button>
            )
          })}
        </div>
      </div>
    </HUDTile>
  )
}

function resolveConditionLabel(condition) {
  if (!condition) return '—'
  if (typeof condition === 'string') return condition
  return condition.label || condition.text || '—'
}

function formatHudTime(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/New_York',
  })
}

export default function HUDBar({
  flights,
  weather,
  rateLimitStatus,
  lastUpdated,
  isStale,
  dataSource,
  isConstrained,
  selectedRunwayId,
  onRunwaySelect,
}) {
  const condition = weather ? weatherCodeToCondition(weather.weather_code) : null
  const conditionLabel = resolveConditionLabel(condition)
  const windDir = weather ? Math.round(weather.wind_direction_10m) : null
  const windSpd = weather ? Math.round(weather.wind_speed_10m) : null
  const windGust = weather ? Math.round(weather.wind_gusts_10m) : null
  const temp = weather ? Math.round(weather.temperature_2m) : null
  const cardinal = windDir !== null ? headingToCardinal(windDir) : '—'
  const runways = weather ? estimateActiveRunways(windDir) : []
  const airborne = flights.length
  const blocked = rateLimitStatus === 'blocked'
  const authConfigured = dataSource?.authConfigured ?? HAS_OPENSKY_AUTH
  const isSnapshotSource = dataSource?.type === 'cache' && dataSource?.cacheSource === 'snapshot'
  const isFallbackSource = dataSource?.type === 'fallback'
  const isCacheSource = dataSource?.type === 'cache'
  const feedContextLabel = blocked
    ? 'retry window active'
    : isFallbackSource
      ? 'backup feed online'
      : isCacheSource
        ? (dataSource?.cacheSource === 'snapshot' ? 'snapshot cache' : 'local cache ready')
        : `${airborne} tracked`
  const weatherSummary = weather
    ? (windGust > windSpd + 5 ? `gusting ${windGust} mph` : 'stable')
    : 'weather offline'
  const feedLabel = blocked
    ? 'RATE HOLD'
    : isFallbackSource
      ? 'BACKUP'
      : isSnapshotSource
        ? 'SNAPSHOT'
        : isCacheSource
          ? 'CACHE'
          : 'LIVE'
  const feedDot = blocked
    ? 'var(--red)'
    : isFallbackSource
      ? 'var(--cyan-alt)'
      : isCacheSource
        ? 'var(--amber)'
        : 'var(--green)'
  const updatedLabel = formatHudTime(lastUpdated)
  return (
    <div
      className="hudbar"
      style={{
        background: 'radial-gradient(circle at top center, rgba(var(--cyan-rgb), 0.14), rgba(8, 12, 20, 0.96) 56%), linear-gradient(90deg, rgba(255,255,255,0.02), rgba(255,255,255,0.05), rgba(255,255,255,0.02))',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        boxShadow: '0 18px 48px rgba(0,0,0,0.28)',
      }}
    >
      <div
        className="hudbar-main"
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) auto minmax(0, 1fr)',
          alignItems: 'center',
          gap: 14,
        }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: '114px minmax(0, 1fr) 154px', gap: 10, minWidth: 0 }}>
          <HUDTile label="Feed" accent={feedDot} narrow value={feedLabel} detail={feedContextLabel} />
          <RunwayTile activeRunways={runways} selectedRunwayId={selectedRunwayId} onRunwaySelect={onRunwaySelect} />
          <HUDTile label="Local time" accent="var(--cyan)" center>
            <div style={{ display: 'grid', gap: 4, justifyItems: 'center', width: '100%', minWidth: 0 }}>
              <Clock />
              <div style={{ fontSize: 11, color: 'rgba(var(--text-soft-rgb), 0.9)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>
                JFK tower clock
              </div>
            </div>
          </HUDTile>
        </div>

        <div
          style={{
            ...TILE_SHELL,
            minWidth: 224,
            minHeight: 84,
            padding: '7px 17px',
            display: 'grid',
            placeItems: 'center',
            position: 'relative',
            overflow: 'hidden',
            background: 'radial-gradient(circle at 50% 18%, rgba(var(--cyan-alt-rgb), 0.22), rgba(18, 33, 47, 0.96) 44%, rgba(9, 15, 24, 0.96) 100%)',
          }}
        >
          <div
            style={{
              position: 'absolute',
              inset: 10,
              borderRadius: 16,
              border: '1px solid rgba(var(--cyan-alt-rgb), 0.16)',
              pointerEvents: 'none',
            }}
          />
          <div
            style={{
              width: 92,
              height: 92,
              borderRadius: '50%',
              border: '1px solid rgba(var(--cyan-alt-rgb), 0.24)',
              background: 'radial-gradient(circle, rgba(var(--cyan-alt-rgb), 0.26), rgba(255,255,255,0.03) 62%, rgba(255,255,255,0) 74%)',
              display: 'grid',
              placeItems: 'center',
              boxShadow: '0 0 24px rgba(var(--cyan-alt-rgb), 0.14), inset 0 1px 0 rgba(255,255,255,0.08)',
            }}
          >
            <CenterBadgeLogo />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(188px, 1.42fr) repeat(3, minmax(96px, 1fr))', gap: 10, minWidth: 0 }}>
          <WindTile direction={windDir} cardinal={cardinal} speed={windSpd} gust={windGust} />
          <HUDTile label="Temp" accent="var(--cyan-alt)" value={temp != null ? `${temp}°F` : '—'} detail={weather ? 'ramp surface' : 'pending'} />
          <HUDTile label="Sky" accent="var(--heading)" value={conditionLabel} detail={weather ? 'live weather code' : 'pending'} />
          <HUDTile label="Weather" accent="var(--text-soft)" value={weatherSummary} detail={updatedLabel ? `MET ${updatedLabel}` : 'awaiting met'} />
        </div>
      </div>
    </div>
  )
}
