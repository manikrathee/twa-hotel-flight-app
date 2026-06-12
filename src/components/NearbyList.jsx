import { memo, useDeferredValue, useMemo } from 'react'
import { getAirlineName, parseFlightNumber } from '../utils/aircraft'
import { metersToFeet, msToKnots } from '../utils/geo'

const KM_APPROACH = 16
const KM_TERMINAL = 48

const CHIP_STYLE = {
  borderRadius: 16,
  border: '1px solid rgba(255,255,255,0.08)',
  background: 'linear-gradient(180deg, rgba(11, 18, 28, 0.34), rgba(11, 18, 28, 0.12))',
  boxShadow: '0 16px 36px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.04)',
  backdropFilter: 'blur(16px)',
}

function normalizeFlightId(value) {
  return String(value || '').trim().toLowerCase()
}

function toFiniteNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function sortFlightsByDistance(flights) {
  return [...flights].sort((a, b) => (a.distKm || Infinity) - (b.distKm || Infinity))
}

function ZoneHeader({ label, count, color, sublabel }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        padding: '0 2px',
      }}
    >
      <div style={{ width: 5, height: 5, borderRadius: '50%', background: color, flexShrink: 0 }} />
      <span style={{ fontSize: 11, color, fontWeight: 700, letterSpacing: '0.08em' }}>
        {label}
      </span>
      {sublabel && (
        <span style={{ fontSize: 11, color: 'rgba(var(--text-soft-rgb), 0.82)' }}>
          {sublabel}
        </span>
      )}
      <span
        style={{
          marginLeft: 'auto',
          minWidth: 24,
          textAlign: 'center',
          borderRadius: 999,
          border: '1px solid rgba(255,255,255,0.08)',
          background: 'rgba(255,255,255,0.04)',
          padding: '2px 6px',
          fontSize: 10,
          fontWeight: 700,
          color,
        }}
      >
        {count}
      </span>
    </div>
  )
}

function NearbyList({ flights, selectedId, onSelect, width, loading, error, collapsed = false, onToggleCollapse }) {
  const deferredFlights = useDeferredValue(flights)
  const sortedFlights = useMemo(() => {
    return sortFlightsByDistance(deferredFlights).filter((flight) => {
      const baroAltitude = toFiniteNumber(flight?.baro_altitude)
      const geoAltitude = toFiniteNumber(flight?.geo_altitude)
      const speed = toFiniteNumber(flight?.velocity)
      const altitude = baroAltitude ?? geoAltitude
      const hasTelemetry = altitude != null || speed != null
      const isMoving = (speed ?? 0) > 18
      const isAirborne = flight?.on_ground !== true && (altitude == null || altitude > 40 || isMoving)
      return hasTelemetry && isAirborne
    })
  }, [deferredFlights])

  const { approach, terminal, enroute, totalShown, totalShownLabel } = useMemo(() => {
    const approachZone = []
    const terminalZone = []
    const enrouteZone = []

    for (const flight of sortedFlights) {
      if (flight.distKm < KM_APPROACH) {
        approachZone.push(flight)
      } else if (flight.distKm < KM_TERMINAL) {
        terminalZone.push(flight)
      } else {
        enrouteZone.push(flight)
      }
    }

    return {
      approach: approachZone,
      terminal: terminalZone,
      enroute: enrouteZone,
      totalShown: approachZone.length + terminalZone.length + enrouteZone.length,
      totalShownLabel: `${approachZone.length + terminalZone.length + enrouteZone.length}`,
    }
  }, [sortedFlights])

  const showNoData = !loading && totalShown === 0
  const emptyMessage = error && !loading
    ? `Flight feed issue: ${error}`
    : loading
      ? 'Acquiring nearby traffic…'
      : 'No nearby traffic in range.'

  if (collapsed) {
    return (
      <div
        style={{
          width,
          position: 'absolute',
          top: 16,
          left: 16,
          bottom: 16,
          zIndex: 180,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 10,
          padding: '8px 6px',
          ...CHIP_STYLE,
          background: 'linear-gradient(180deg, rgba(11, 18, 28, 0.3), rgba(11, 18, 28, 0.08))',
        }}
      >
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label="Expand nearby traffic panel"
          style={{
            width: 30,
            height: 30,
            borderRadius: 8,
            border: '1px solid rgba(var(--cyan-alt-rgb), 0.28)',
            background: 'rgba(var(--cyan-alt-rgb), 0.08)',
            color: 'var(--cyan-alt)',
            cursor: 'pointer',
            fontSize: 16,
            lineHeight: '28px',
            textAlign: 'center',
          }}
        >
          ›
        </button>
        <div
          style={{
            writingMode: 'vertical-rl',
            transform: 'rotate(180deg)',
            fontSize: 10,
            letterSpacing: 1.35,
            color: 'var(--text-dim)',
            fontFamily: 'var(--font-mono)',
          }}
        >
          NEARBY TRAFFIC
        </div>
        <div
          style={{
            marginTop: 'auto',
            minWidth: 28,
            textAlign: 'center',
            borderRadius: 999,
            border: '1px solid rgba(var(--cyan-alt-rgb), 0.24)',
            background: 'rgba(var(--cyan-alt-rgb), 0.12)',
            color: 'var(--cyan)',
            padding: '3px 6px',
            fontSize: 11,
            fontWeight: 700,
          }}
        >
          {totalShownLabel}
        </div>
      </div>
    )
  }

  return (
      <div
        style={{
          width,
          position: 'absolute',
          top: 16,
          left: 16,
          maxHeight: 'min(calc(100% - 32px), 76vh)',
          zIndex: 180,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
    >
      <div
        style={{
          ...CHIP_STYLE,
          padding: '12px 14px 11px',
          display: 'grid',
          gap: 10,
          background: 'linear-gradient(180deg, rgba(10, 17, 27, 0.44), rgba(10, 17, 27, 0.18))',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ fontSize: 13, color: 'var(--heading)', fontWeight: 700, letterSpacing: '0.1em' }}>
            NEARBY TRAFFIC
          </div>
          <div
            style={{
              marginLeft: 'auto',
              minWidth: 30,
              textAlign: 'center',
              borderRadius: 999,
              border: '1px solid rgba(var(--cyan-alt-rgb), 0.22)',
              background: 'rgba(var(--cyan-alt-rgb), 0.08)',
              color: 'var(--cyan)',
              padding: '3px 8px',
              fontSize: 11,
              fontWeight: 700,
            }}
          >
            {totalShownLabel}
          </div>
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label="Collapse nearby traffic panel"
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              border: '1px solid rgba(var(--text-soft-rgb), 0.25)',
              background: 'rgba(255,255,255,0.03)',
              color: 'var(--text-dim)',
              cursor: 'pointer',
              fontSize: 15,
              lineHeight: '26px',
              textAlign: 'center',
            }}
          >
            ‹
          </button>
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) 54px 58px',
            gap: 0,
            padding: '0 2px',
          }}
        >
          {['CALLSIGN', 'ALT', 'SPD'].map((header) => (
            <span key={header} style={{ fontSize: 10, color: 'var(--text-dim)', fontWeight: 700, letterSpacing: '0.08em' }}>
              {header}
            </span>
          ))}
        </div>
      </div>

      <div
        style={{
          flex: '1 1 auto',
          minHeight: 0,
          overflowY: 'auto',
          display: 'grid',
          alignContent: 'start',
          gap: 9,
          paddingRight: 3,
          scrollbarWidth: 'thin',
        }}
      >
        {totalShown === 0 && (
          <div
            role="status"
            aria-live="polite"
            aria-atomic="true"
            style={{
              ...CHIP_STYLE,
              padding: 18,
              color: 'var(--text-dim)',
              fontSize: 12,
              textAlign: 'center',
              background: 'linear-gradient(180deg, rgba(10, 17, 27, 0.26), rgba(10, 17, 27, 0.08))',
            }}
          >
            {showNoData ? 'No nearby traffic in range.' : emptyMessage}
          </div>
        )}

        {approach.length > 0 && (
          <FlightZone
            label="APPROACH"
            count={approach.length}
            color="var(--amber)"
            sublabel="< 10mi"
            flights={approach}
            selectedId={selectedId}
            onSelect={onSelect}
          />
        )}

        {terminal.length > 0 && (
          <FlightZone
            label="TERMINAL AREA"
            count={terminal.length}
            color="var(--cyan)"
            sublabel="10 – 30mi"
            flights={terminal}
            selectedId={selectedId}
            onSelect={onSelect}
          />
        )}

        {enroute.length > 0 && (
          <FlightZone
            label="ENROUTE"
            count={enroute.length}
            color="rgba(var(--text-soft-rgb), 0.72)"
            sublabel="> 30mi"
            flights={enroute}
            selectedId={selectedId}
            onSelect={onSelect}
          />
        )}
      </div>
    </div>
  )
}

function FlightZone({ label, count, color, sublabel, flights, selectedId, onSelect }) {
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <ZoneHeader label={label} count={count} color={color} sublabel={sublabel} />
      <div style={{ display: 'grid', gap: 6 }}>
        {flights.map((flight) => (
          <FlightRow
            key={flight.icao24}
            flight={flight}
            selected={normalizeFlightId(flight.icao24) === normalizeFlightId(selectedId)}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  )
}

const FlightRow = memo(function FlightRow({ flight, selected, onSelect }) {
  const airline = getAirlineName(flight.callsign)
  const fn = parseFlightNumber(flight.callsign) || flight.icao24
  const baroAltitude = toFiniteNumber(flight.baro_altitude)
  const geoAltitude = toFiniteNumber(flight.geo_altitude)
  const resolvedAltitude = baroAltitude ?? geoAltitude
  const alt = resolvedAltitude == null
    ? '—'
    : `${Math.round(Math.max(0, metersToFeet(resolvedAltitude)) / 100)}`
  const spdValue = toFiniteNumber(flight.velocity)
  const spd = spdValue == null ? '—' : msToKnots(Math.max(0, spdValue))
  const vr = toFiniteNumber(flight.vertical_rate) ?? 0
  const vrIndicator = vr > 1 ? '↑' : vr < -1 ? '↓' : '—'
  const vrColor = vr > 1 ? 'var(--green)' : vr < -1 ? 'var(--amber)' : 'var(--text-dim)'
  const distMi = Math.round(flight.distKm * 0.621)
  const accentColor = distMi <= 5 ? 'var(--amber)' : distMi <= 20 ? 'var(--cyan)' : 'rgba(var(--text-soft-rgb), 0.42)'

  return (
    <button
      type="button"
      onClick={() => onSelect(flight.icao24)}
      aria-label={`${selected ? 'Close details for' : 'View details for'} ${fn}`}
      aria-pressed={selected}
      style={{
        width: '100%',
        minHeight: 44,
        background: selected ? 'rgba(var(--cyan-alt-rgb), 0.12)' : 'rgba(7, 13, 21, 0.2)',
        border: `1px solid ${selected ? 'rgba(var(--cyan-alt-rgb), 0.32)' : 'rgba(255,255,255,0.06)'}`,
        borderLeft: `2px solid ${selected ? 'var(--cyan-alt)' : accentColor}`,
        borderRadius: 14,
        padding: '9px 12px 9px 13px',
        cursor: 'pointer',
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) 54px 58px',
        gap: 0,
        alignItems: 'center',
        textAlign: 'left',
        transition: 'background 0.16s, border-color 0.16s, transform 0.16s, box-shadow 0.16s',
        transform: selected ? 'translateX(2px)' : 'none',
        boxShadow: selected ? '0 12px 26px rgba(var(--cyan-alt-rgb), 0.14), inset 0 1px 0 rgba(255,255,255,0.05)' : '0 10px 24px rgba(0,0,0,0.12)',
      }}
      onMouseEnter={(event) => {
        if (!selected) event.currentTarget.style.background = 'rgba(12, 20, 31, 0.34)'
      }}
      onMouseLeave={(event) => {
        if (!selected) event.currentTarget.style.background = 'rgba(7, 13, 21, 0.2)'
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            color: selected ? 'var(--cyan)' : 'var(--heading)',
            letterSpacing: 0.1,
            fontWeight: 650,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {fn}
        </div>
        <div
          style={{
            fontSize: 11,
            color: 'var(--text-dim)',
            marginTop: 2,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {airline ? airline.replace(' Airlines', '').replace(' Airways', '') : flight.origin_country}
        </div>
      </div>

      <div style={{ display: 'grid', justifyItems: 'start', gap: 1 }}>
        <span style={{ fontSize: 12, fontWeight: 650, color: 'var(--heading)' }}>{alt}</span>
        <span style={{ fontSize: 10, color: vrColor }}>{vrIndicator}</span>
      </div>

      <div style={{ display: 'grid', justifyItems: 'start', gap: 1 }}>
        <span style={{ fontSize: 12, fontWeight: 650, color: 'var(--heading)' }}>{spd}</span>
        <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>kt</span>
      </div>
    </button>
  )
})

export default memo(NearbyList)
