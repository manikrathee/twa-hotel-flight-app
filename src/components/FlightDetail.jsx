import { useState, useEffect } from 'react'
import useFlightDetail from '../hooks/useFlightDetail'
import AircraftSilhouette from './AircraftSilhouette'
import FlightPath from './FlightPath'
import { getAirlineName, parseFlightNumber, modelLabel } from '../utils/aircraft'
import { metersToFeet, msToKnots, headingToCardinal, msTofpm } from '../utils/geo'

export default function FlightDetail({ flight, onClose, onTrackLoad }) {
  const { track, route, aircraftInfo, loading } = useFlightDetail(flight)
  const [showPath, setShowPath] = useState(false)

  // Notify parent when track loads (for map path rendering)
  useEffect(() => { onTrackLoad?.(track) }, [track])

  const callsign = flight.callsign || flight.icao24
  const flightNum = parseFlightNumber(callsign)
  const airline = getAirlineName(callsign) || route?.airline?.name || flight.origin_country

  const typeCode = aircraftInfo?.type || aircraftInfo?.icao_type
  const model = modelLabel(aircraftInfo?.manufacturer, aircraftInfo?.model, typeCode)
  const registration = aircraftInfo?.registration

  const altFt = metersToFeet(flight.baro_altitude)
  const spdKt = msToKnots(flight.velocity)
  const vrFpm = msTofpm(flight.vertical_rate)
  const hdg = Math.round(flight.heading || 0)
  const cardinal = headingToCardinal(hdg)

  const origin = route?.origin
  const dest = route?.destination

  return (
    <div style={{
      width: 360,
      flexShrink: 0,
      background: 'var(--panel)',
      borderLeft: '1px solid var(--border-bright)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      animation: 'slide-right 0.25s ease',
    }}>
      {/* Header bar */}
      <div style={{
        padding: '10px 16px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
        background: 'rgba(0,195,255,0.04)',
      }}>
        <div>
          <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-dim)', letterSpacing: 1.5 }}>
            FLIGHT DETAIL
          </div>
          <div style={{
            fontSize: 18, fontFamily: 'var(--font-mono)', color: 'var(--cyan)',
            fontWeight: 600, letterSpacing: 2, marginTop: 1,
          }}>
            {flightNum}
          </div>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'none', border: '1px solid var(--border)', borderRadius: 4,
            color: 'var(--text-dim)', cursor: 'pointer', padding: '4px 8px',
            fontSize: 11, fontFamily: 'var(--font-mono)',
          }}
        >
          ✕ CLOSE
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {/* Aircraft silhouette section */}
        <div style={{
          padding: '16px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          background: 'linear-gradient(135deg, rgba(0,195,255,0.04) 0%, transparent 60%)',
        }}>
          <AircraftSilhouette typeCode={typeCode} size={110} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 4, fontFamily: 'var(--font-mono)', letterSpacing: 1 }}>
              AIRCRAFT
            </div>
            <div style={{ fontSize: 15, color: 'var(--heading)', fontWeight: 600, lineHeight: 1.2 }}>
              {loading && !typeCode ? 'Loading...' : model}
            </div>
            {registration && (
              <div style={{ fontSize: 12, color: 'var(--cyan)', fontFamily: 'var(--font-mono)', marginTop: 4, letterSpacing: 1 }}>
                {registration}
              </div>
            )}
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4 }}>
              {airline}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', marginTop: 4, letterSpacing: 0.5 }}>
              ICAO: {flight.icao24?.toUpperCase()}
              {flight.squawk && <span> · SQWK: {flight.squawk}</span>}
            </div>
          </div>
        </div>

        {/* Route */}
        {(origin || dest) && (
          <div style={{
            padding: '14px 16px',
            borderBottom: '1px solid var(--border)',
          }}>
            <div style={{ fontSize: 9, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', letterSpacing: 1.5, marginBottom: 10 }}>
              ROUTE
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <AirportBadge airport={origin} />
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 0 }}>
                <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                <div style={{
                  padding: '2px 6px',
                  fontSize: 10, color: 'var(--cyan)',
                  fontFamily: 'var(--font-mono)',
                  whiteSpace: 'nowrap',
                }}>▶</div>
                <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
              </div>
              <AirportBadge airport={dest} />
            </div>
          </div>
        )}

        {/* Live telemetry */}
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 9, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', letterSpacing: 1.5, marginBottom: 10 }}>
            LIVE TELEMETRY
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <TelemetryCard
              label="ALTITUDE"
              value={altFt.toLocaleString()}
              unit="ft"
              bar={Math.min(altFt / 45000, 1)}
              color="var(--cyan)"
            />
            <TelemetryCard
              label="SPEED"
              value={spdKt}
              unit="kts"
              bar={Math.min(spdKt / 600, 1)}
              color="var(--amber)"
            />
            <TelemetryCard
              label="V/RATE"
              value={vrFpm > 0 ? `+${vrFpm.toLocaleString()}` : vrFpm.toLocaleString()}
              unit="fpm"
              color={vrFpm > 100 ? 'var(--green)' : vrFpm < -100 ? 'var(--red)' : 'var(--text-dim)'}
              noBar
            />
          </div>
          <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <TelemetryCard
              label="HEADING"
              value={`${hdg}° ${cardinal}`}
              unit=""
              noBar
              color="var(--text)"
            />
            <TelemetryCard
              label="DIST FROM TWA"
              value={Math.round(flight.distKm * 0.621)}
              unit="mi"
              noBar
              color="var(--text)"
            />
          </div>
        </div>

        {/* Altitude bar */}
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, alignItems: 'center' }}>
            <span style={{ fontSize: 9, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', letterSpacing: 1.5 }}>ALTITUDE PROFILE</span>
            <span style={{ fontSize: 11, color: 'var(--cyan)', fontFamily: 'var(--font-mono)' }}>{altFt.toLocaleString()} ft</span>
          </div>
          <AltitudeBar altFt={altFt} vrFpm={vrFpm} />
        </div>

        {/* Flight path toggle */}
        <div style={{ padding: '14px 16px' }}>
          <button
            onClick={() => setShowPath(v => !v)}
            style={{
              width: '100%',
              background: showPath ? 'rgba(0,195,255,0.12)' : 'transparent',
              border: '1px solid var(--border-bright)',
              borderRadius: 6,
              color: 'var(--cyan)',
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              padding: '8px 14px',
              cursor: 'pointer',
              letterSpacing: 1.5,
              transition: 'background 0.15s',
            }}
          >
            {showPath ? '▲ HIDE FLIGHT PATH' : '▼ SHOW FLIGHT PATH'}
          </button>

          {showPath && track && (
            <div style={{ marginTop: 12, animation: 'fade-in 0.2s ease' }}>
              <FlightPath track={track} currentAlt={flight.baro_altitude} />
            </div>
          )}
          {showPath && !track && loading && (
            <div style={{ marginTop: 12, textAlign: 'center', color: 'var(--text-dim)', fontSize: 12, fontFamily: 'var(--font-mono)' }}>
              Loading path data...
            </div>
          )}
          {showPath && !track && !loading && (
            <div style={{ marginTop: 12, textAlign: 'center', color: 'var(--text-dim)', fontSize: 12 }}>
              Path data not available
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function AirportBadge({ airport }) {
  if (!airport) return <div style={{ width: 80 }} />
  return (
    <div style={{ textAlign: 'center', minWidth: 72 }}>
      <div style={{
        fontSize: 16, fontFamily: 'var(--font-mono)', fontWeight: 700,
        color: 'var(--heading)', letterSpacing: 1,
      }}>
        {airport.iata_code || airport.icao_code || '—'}
      </div>
      <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 2, lineHeight: 1.3 }}>
        {airport.municipality || airport.name?.slice(0, 18)}
      </div>
    </div>
  )
}

function TelemetryCard({ label, value, unit, bar, color, noBar }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid var(--border)',
      borderRadius: 6,
      padding: '8px 10px',
    }}>
      <div style={{ fontSize: 9, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', letterSpacing: 1.5, marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 16, fontFamily: 'var(--font-mono)', fontWeight: 500, color: color || 'var(--heading)' }}>
        {value}
        {unit && <span style={{ fontSize: 10, color: 'var(--text-dim)', marginLeft: 3 }}>{unit}</span>}
      </div>
      {!noBar && bar !== undefined && (
        <div style={{ marginTop: 6, height: 2, background: 'rgba(255,255,255,0.08)', borderRadius: 1 }}>
          <div style={{
            height: '100%', borderRadius: 1,
            background: color || 'var(--cyan)',
            width: `${Math.round(bar * 100)}%`,
            transition: 'width 0.4s ease',
          }} />
        </div>
      )}
    </div>
  )
}

function AltitudeBar({ altFt, vrFpm }) {
  const levels = [0, 5000, 10000, 18000, 24000, 33000, 42000]
  const pct = Math.min(altFt / 42000, 1)
  const isClimbing = vrFpm > 100
  const isDescending = vrFpm < -100

  return (
    <div style={{ position: 'relative' }}>
      {/* Altitude level labels */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        marginBottom: 4,
        paddingRight: 2,
      }}>
        {levels.map(l => (
          <span key={l} style={{ fontSize: 9, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
            {l === 0 ? 'GND' : `${Math.round(l/1000)}k`}
          </span>
        ))}
      </div>
      {/* Bar track */}
      <div style={{
        height: 8, background: 'rgba(255,255,255,0.06)',
        borderRadius: 4, position: 'relative', overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute',
          left: 0, top: 0, bottom: 0,
          width: `${Math.round(pct * 100)}%`,
          background: isClimbing
            ? 'linear-gradient(90deg, var(--cyan), var(--green))'
            : isDescending
            ? 'linear-gradient(90deg, var(--cyan), var(--amber))'
            : 'var(--cyan)',
          borderRadius: 4,
          transition: 'width 0.6s ease',
          boxShadow: '0 0 8px var(--cyan)',
        }} />
        {/* Flight level markers */}
        {[18000, 24000, 33000].map(l => (
          <div key={l} style={{
            position: 'absolute', top: 0, bottom: 0,
            left: `${Math.round(l / 42000 * 100)}%`,
            width: 1,
            background: 'rgba(255,255,255,0.12)',
          }} />
        ))}
      </div>
      <div style={{ marginTop: 4, fontSize: 9, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', textAlign: 'right' }}>
        {isClimbing ? '↑ CLIMBING' : isDescending ? '↓ DESCENDING' : '— LEVEL'}
        {' '}FL{Math.round(altFt / 100)}
      </div>
    </div>
  )
}
