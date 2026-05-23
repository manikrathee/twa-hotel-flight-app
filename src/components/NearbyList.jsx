import { memo, useDeferredValue } from 'react'
import { getAirlineName, parseFlightNumber } from '../utils/aircraft'
import { metersToFeet, msToKnots } from '../utils/geo'

// Distance thresholds in km (roughly 10mi and 30mi)
const KM_APPROACH = 16
const KM_TERMINAL = 48
const MAX_ENROUTE = 10

function ZoneHeader({ label, count, color, sublabel }) {
  return (
    <div style={{
      padding: '8px 16px 6px 16px',
      display: 'flex', alignItems: 'center', gap: 10,
      borderBottom: '1px solid var(--panel-line)',
      borderTop: '1px solid var(--panel-line)',
      background: 'var(--panel-soft)',
      flexShrink: 0,
    }}>
      <div style={{ width: 5, height: 5, borderRadius: '50%', background: color, flexShrink: 0 }} />
      <span style={{ fontSize: 12, color, fontWeight: 600 }}>
        {label}
      </span>
      {sublabel && (
        <span style={{ fontSize: 12, color: 'var(--text-dim)', marginLeft: 2 }}>
          {sublabel}
        </span>
      )}
      <div style={{ marginLeft: 'auto', fontSize: 12, color, opacity: 0.85, fontWeight: 600 }}>
        {count}
      </div>
    </div>
  )
}

export default function NearbyList({ flights, selectedId, onSelect, width }) {
  const deferredFlights = useDeferredValue(flights)

  const approach = deferredFlights.filter(f => f.distKm < KM_APPROACH)
  const terminal = deferredFlights.filter(f => f.distKm >= KM_APPROACH && f.distKm < KM_TERMINAL)
  const enrouteAll = deferredFlights.filter(f => f.distKm >= KM_TERMINAL)
  const enroute = enrouteAll.slice(0, MAX_ENROUTE)

  const totalShown = approach.length + terminal.length + enroute.length

  return (
    <div style={{
      width,
      flexShrink: 0,
      background: 'var(--panel)',
      backdropFilter: 'blur(16px)',
      borderRight: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '14px 16px 12px',
      borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
        background: 'var(--panel-strong)',
      }}>
        <div style={{ fontSize: 14, color: 'var(--heading)', fontWeight: 700 }}>
          NEARBY TRAFFIC
        </div>
        <div style={{
          fontSize: 13, color: 'var(--cyan)',
          background: 'rgba(var(--cyan-alt-rgb), 0.14)', padding: '2px 9px', borderRadius: 999,
          border: '1px solid rgba(var(--cyan-alt-rgb), 0.28)',
          fontWeight: 600,
        }}>
          {deferredFlights.length}
        </div>
      </div>

      {/* Column headers */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 68px 74px',
        gap: 0,
        padding: '8px 16px 8px 18px',
        borderBottom: '1px solid var(--panel-line)',
        flexShrink: 0,
      }}>
        {['CALLSIGN', 'ALT', 'SPD'].map(h => (
          <span key={h} style={{ fontSize: 12, color: 'var(--text-dim)', fontWeight: 600 }}>{h}</span>
        ))}
      </div>

      {/* Flight list — grouped by proximity zone */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {totalShown === 0 && (
          <div style={{ padding: 24, color: 'var(--text-dim)', fontSize: 13, textAlign: 'center' }}>
            Loading traffic...
          </div>
        )}

        {approach.length > 0 && (
          <>
            <ZoneHeader label="APPROACH" count={approach.length} color="var(--amber)" sublabel="< 10mi" />
            {approach.map(f => (
              <FlightRow key={f.icao24} flight={f} selected={f.icao24 === selectedId} onSelect={onSelect} />
            ))}
          </>
        )}

        {terminal.length > 0 && (
          <>
            <ZoneHeader label="TERMINAL AREA" count={terminal.length} color="var(--cyan)" sublabel="10 – 30mi" />
            {terminal.map(f => (
              <FlightRow key={f.icao24} flight={f} selected={f.icao24 === selectedId} onSelect={onSelect} />
            ))}
          </>
        )}

        {enroute.length > 0 && (
          <>
            <ZoneHeader
              label="ENROUTE"
              count={enrouteAll.length > MAX_ENROUTE ? `${MAX_ENROUTE}/${enrouteAll.length}` : enroute.length}
              color="rgba(var(--text-soft-rgb), 0.45)"
              sublabel="> 30mi"
            />
            {enroute.map(f => (
              <FlightRow key={f.icao24} flight={f} selected={f.icao24 === selectedId} onSelect={onSelect} />
            ))}
          </>
        )}
      </div>
    </div>
  )
}

const FlightRow = memo(function FlightRow({ flight, selected, onSelect }) {
  const airline = getAirlineName(flight.callsign)
  const fn = parseFlightNumber(flight.callsign) || flight.icao24
  const alt = flight.baro_altitude ? `${Math.round(metersToFeet(flight.baro_altitude) / 100)}` : '—'
  const spd = flight.velocity ? msToKnots(flight.velocity) : '—'
  const vr = flight.vertical_rate || 0
  const vrIndicator = vr > 1 ? '↑' : vr < -1 ? '↓' : '—'
  const vrColor = vr > 1 ? 'var(--green)' : vr < -1 ? 'var(--red-alt)' : 'var(--text-dim)'
  const distMi = Math.round(flight.distKm * 0.621)
  const accentColor = distMi <= 5 ? 'var(--amber)' : distMi <= 20 ? 'var(--cyan)' : 'var(--panel-subtle)'

  return (
    <button
      onClick={() => onSelect(flight.icao24)}
      style={{
        width: '100%',
        background: selected ? 'rgba(var(--cyan-alt-rgb), 0.08)' : 'transparent',
        border: 'none',
        borderLeft: `2px solid ${selected ? 'var(--cyan-alt)' : accentColor}`,
        borderBottom: '1px solid var(--panel-line)',
        padding: '10px 14px 10px 16px',
        cursor: 'pointer',
        display: 'grid',
        gridTemplateColumns: '1fr 68px 74px',
        gap: 0,
        alignItems: 'center',
        textAlign: 'left',
        transition: 'background 0.18s, transform 0.18s, box-shadow 0.18s',
        transform: selected ? 'translateX(2px)' : 'none',
        boxShadow: selected ? 'inset 0 0 0 1px rgba(var(--cyan-alt-rgb), 0.22), 0 0 18px rgba(var(--cyan-alt-rgb), 0.14)' : 'none',
        animation: selected ? 'selected-glow 0.35s ease' : 'none',
      }}
      onMouseEnter={e => { if (!selected) e.currentTarget.style.background = 'rgba(var(--text-soft-rgb), 0.06)' }}
      onMouseLeave={e => { if (!selected) e.currentTarget.style.background = 'transparent' }}
    >
      <div>
        <div style={{
          fontSize: 14,
          color: selected ? 'var(--cyan)' : 'var(--heading)',
          letterSpacing: 0.1,
          fontWeight: 600,
        }}>
          {fn}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>
          {airline ? airline.replace(' Airlines', '').replace(' Airways', '') : flight.origin_country}
          <span style={{ color: 'rgba(var(--text-soft-rgb), 0.35)', margin: '0 7px' }}>·</span>
          <span style={{ color: distMi <= 5 ? 'var(--amber)' : 'var(--text-dim)' }}>{distMi}mi</span>
        </div>
      </div>
      <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 600 }}>
        <span>{alt}</span>
        <span style={{ fontSize: 12, color: 'var(--text-dim)', marginLeft: 2 }}>FL</span>
      </div>
      <div style={{ fontSize: 13 }}>
        <span style={{ color: vrColor }}>{vrIndicator}</span>
        <span style={{ color: 'var(--text)', marginLeft: 3 }}>{spd}</span>
      </div>
    </button>
  )
}, (prev, next) =>
  prev.selected === next.selected &&
  prev.flight.icao24 === next.flight.icao24 &&
  prev.flight.callsign === next.flight.callsign &&
  prev.flight.latitude === next.flight.latitude &&
  prev.flight.longitude === next.flight.longitude &&
  prev.flight.distKm === next.flight.distKm &&
  prev.flight.baro_altitude === next.flight.baro_altitude &&
  prev.flight.velocity === next.flight.velocity &&
  prev.flight.vertical_rate === next.flight.vertical_rate &&
  prev.onSelect === next.onSelect
)
