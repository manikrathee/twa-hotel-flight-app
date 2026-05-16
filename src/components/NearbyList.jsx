import { memo, useDeferredValue } from 'react'
import { getAirlineName, parseFlightNumber } from '../utils/aircraft'
import { metersToFeet, msToKnots } from '../utils/geo'

export default function NearbyList({ flights, selectedId, onSelect }) {
  const deferredFlights = useDeferredValue(flights)
  const visible = deferredFlights.slice(0, 60)

  return (
    <div style={{
      width: 268,
      flexShrink: 0,
      background: 'rgba(5,5,18,0.98)',
      borderRight: '1px solid rgba(0,212,200,0.08)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '11px 14px 10px',
        borderBottom: '1px solid rgba(0,212,200,0.08)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
        background: 'rgba(0,0,0,0.2)',
      }}>
        <div style={{ fontSize: 10, fontFamily: 'var(--font-display)', color: 'var(--text-dim)', letterSpacing: 3 }}>
          NEARBY TRAFFIC
        </div>
        <div style={{
          fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--cyan)',
          background: 'rgba(0,212,200,0.1)', padding: '1px 7px', borderRadius: 2,
          border: '1px solid rgba(0,212,200,0.2)',
        }}>
          {deferredFlights.length}
        </div>
      </div>

      {/* Column headers */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 48px 52px',
        gap: 0,
        padding: '5px 14px 5px 18px',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
        flexShrink: 0,
      }}>
        {['CALLSIGN', 'ALT', 'SPD'].map(h => (
          <span key={h} style={{ fontSize: 8, color: 'var(--text-dim)', fontFamily: 'var(--font-display)', letterSpacing: 2 }}>{h}</span>
        ))}
      </div>

      {/* Flight list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {visible.length === 0 && (
          <div style={{ padding: 20, color: 'var(--text-dim)', fontSize: 12, textAlign: 'center' }}>
            Loading traffic...
          </div>
        )}
        {visible.map(f => (
          <FlightRow
            key={f.icao24}
            flight={f}
            selected={f.icao24 === selectedId}
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
  const alt = flight.baro_altitude ? `${Math.round(metersToFeet(flight.baro_altitude) / 100)}` : '—'
  const spd = flight.velocity ? msToKnots(flight.velocity) : '—'
  const vr = flight.vertical_rate || 0
  const vrIndicator = vr > 1 ? '↑' : vr < -1 ? '↓' : '—'
  const vrColor = vr > 1 ? 'var(--green)' : vr < -1 ? '#e05a3a' : 'var(--text-dim)'
  const distMi = Math.round(flight.distKm * 0.621)
  // Distance-based accent: close = amber, mid = teal, far = dim
  const accentColor = distMi <= 5 ? 'var(--amber)' : distMi <= 20 ? 'var(--cyan)' : 'rgba(255,255,255,0.1)'

  return (
    <button
      onClick={() => onSelect(flight.icao24)}
      style={{
        width: '100%',
        background: selected ? 'rgba(0,212,200,0.07)' : 'transparent',
        border: 'none',
        borderLeft: `2px solid ${selected ? 'var(--cyan)' : accentColor}`,
        borderBottom: '1px solid rgba(255,255,255,0.03)',
        padding: '7px 12px 7px 12px',
        cursor: 'pointer',
        display: 'grid',
        gridTemplateColumns: '1fr 48px 52px',
        gap: 0,
        alignItems: 'center',
        textAlign: 'left',
        transition: 'background 0.12s',
      }}
      onMouseEnter={e => { if (!selected) e.currentTarget.style.background = 'rgba(255,255,255,0.025)' }}
      onMouseLeave={e => { if (!selected) e.currentTarget.style.background = 'transparent' }}
    >
      <div>
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: 11,
          color: selected ? 'var(--cyan)' : 'var(--heading)',
          letterSpacing: 0.8,
        }}>
          {fn}
        </div>
        <div style={{ fontSize: 9.5, color: 'var(--text-dim)', marginTop: 1, fontFamily: 'var(--font-ui)' }}>
          {airline ? airline.replace(' Airlines', '').replace(' Airways', '') : flight.origin_country}
          <span style={{ color: 'rgba(255,255,255,0.2)', margin: '0 4px' }}>·</span>
          <span style={{ color: distMi <= 5 ? 'var(--amber)' : 'var(--text-dim)' }}>{distMi}mi</span>
        </div>
      </div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text)' }}>
        <span>{alt}</span>
        <span style={{ fontSize: 8, color: 'var(--text-dim)', marginLeft: 1 }}>FL</span>
      </div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>
        <span style={{ color: vrColor }}>{vrIndicator}</span>
        <span style={{ color: 'var(--text)', marginLeft: 2 }}>{spd}</span>
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
