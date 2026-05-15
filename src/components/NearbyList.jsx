import { getAirlineName, parseFlightNumber } from '../utils/aircraft'
import { metersToFeet, msToKnots, headingToCardinal } from '../utils/geo'

export default function NearbyList({ flights, selectedId, onSelect }) {
  const visible = flights.slice(0, 60)

  return (
    <div style={{
      width: 260,
      flexShrink: 0,
      background: 'var(--panel)',
      borderRight: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '12px 14px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-dim)', letterSpacing: 1.5 }}>
          NEARBY TRAFFIC
        </div>
        <div style={{
          fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--cyan)',
          background: 'var(--cyan-glow)', padding: '2px 7px', borderRadius: 3,
        }}>
          {flights.length}
        </div>
      </div>

      {/* Column headers */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 52px 52px',
        gap: 0,
        padding: '6px 14px',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
      }}>
        {['CALLSIGN', 'ALT', 'SPD'].map(h => (
          <span key={h} style={{ fontSize: 9, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', letterSpacing: 1.5 }}>{h}</span>
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

function FlightRow({ flight, selected, onSelect }) {
  const airline = getAirlineName(flight.callsign)
  const fn = parseFlightNumber(flight.callsign) || flight.icao24
  const alt = flight.baro_altitude ? `${Math.round(metersToFeet(flight.baro_altitude) / 100)}` : '—'
  const spd = flight.velocity ? msToKnots(flight.velocity) : '—'
  const vr = flight.vertical_rate || 0
  const vrIndicator = vr > 1 ? '↑' : vr < -1 ? '↓' : '—'
  const vrColor = vr > 1 ? 'var(--green)' : vr < -1 ? 'var(--red)' : 'var(--text-dim)'
  const distMi = Math.round(flight.distKm * 0.621)

  return (
    <button
      onClick={() => onSelect(flight.icao24)}
      style={{
        width: '100%',
        background: selected ? 'rgba(0,195,255,0.08)' : 'transparent',
        border: 'none',
        borderLeft: selected ? '2px solid var(--cyan)' : '2px solid transparent',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
        padding: '8px 14px',
        cursor: 'pointer',
        display: 'grid',
        gridTemplateColumns: '1fr 52px 52px',
        gap: 0,
        alignItems: 'center',
        textAlign: 'left',
        transition: 'background 0.15s',
      }}
      onMouseEnter={e => { if (!selected) e.currentTarget.style.background = 'rgba(255,255,255,0.03)' }}
      onMouseLeave={e => { if (!selected) e.currentTarget.style.background = 'transparent' }}
    >
      <div>
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: 12,
          color: selected ? 'var(--cyan)' : 'var(--heading)',
          fontWeight: selected ? 600 : 400,
          letterSpacing: 0.5,
        }}>
          {fn}
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 1 }}>
          {airline ? airline.replace(' Airlines', '').replace(' Airways', '') : flight.origin_country}
          {' · '}
          <span style={{ color: 'var(--text-dim)' }}>{distMi}mi</span>
        </div>
      </div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text)' }}>
        <span>{alt}</span>
        <span style={{ fontSize: 9, color: 'var(--text-dim)' }}>FL</span>
      </div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
        <span style={{ color: vrColor }}>{vrIndicator}</span>
        <span style={{ color: 'var(--text)', marginLeft: 2 }}>{spd}</span>
      </div>
    </button>
  )
}
