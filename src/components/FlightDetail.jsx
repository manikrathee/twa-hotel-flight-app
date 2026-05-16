import { useState, useEffect } from 'react'
import useFlightDetail from '../hooks/useFlightDetail'
import AircraftSilhouette from './AircraftSilhouette'
import FlightPath from './FlightPath'
import { getAircraftFacts, getAirlineFacts, getAirlineName, parseFlightNumber, modelLabel } from '../utils/aircraft'
import { distanceMiles, metersToFeet, msToKnots, headingToCardinal, msTofpm } from '../utils/geo'

export default function FlightDetail({ flight, onClose, onTrackLoad }) {
  const { track, route, aircraftInfo, loading } = useFlightDetail(flight)
  const [showPath, setShowPath] = useState(false)

  // Notify parent when track loads (for map path rendering)
  useEffect(() => { onTrackLoad?.(track) }, [onTrackLoad, track])

  const callsign = flight.callsign || flight.icao24
  const flightNum = parseFlightNumber(callsign)
  const airline = getAirlineName(callsign) || route?.airline?.name || flight.origin_country

  const typeCode = aircraftInfo?.type || aircraftInfo?.icao_type
  const aircraftFacts = getAircraftFacts(typeCode)
  const airlineFacts = getAirlineFacts(callsign, route?.airline)
  const model = modelLabel(aircraftInfo?.manufacturer, aircraftInfo?.model, typeCode)
  const registration = aircraftInfo?.registration
  const photo = aircraftInfo?.url_photo_thumbnail || aircraftInfo?.url_photo
  const owner = aircraftInfo?.registered_owner

  const altFt = metersToFeet(flight.baro_altitude)
  const spdKt = msToKnots(flight.velocity)
  const vrFpm = msTofpm(flight.vertical_rate)
  const hdg = Math.round(flight.heading || 0)
  const cardinal = headingToCardinal(hdg)

  const origin = route?.origin
  const dest = route?.destination
  const routeMiles = routeDistanceMiles(origin, dest)

  return (
    <div style={{
      width: 360,
      flexShrink: 0,
      background: 'rgba(5,5,18,0.98)',
      borderLeft: '1px solid rgba(0,212,200,0.15)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      animation: 'slide-right 0.25s ease',
    }}>
      {/* Header bar */}
      <div style={{
        padding: '10px 16px 10px',
        borderBottom: '1px solid rgba(0,212,200,0.08)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
        background: 'rgba(0,212,200,0.03)',
      }}>
        <div>
          <div style={{ fontSize: 9, fontFamily: 'var(--font-display)', color: 'var(--text-dim)', letterSpacing: 3 }}>
            FLIGHT DETAIL
          </div>
          <div style={{
            fontSize: 22, fontFamily: 'var(--font-display)', color: 'var(--cyan)',
            letterSpacing: 3, marginTop: 0, lineHeight: 1.1,
          }}>
            {flightNum}
          </div>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'none', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4,
            color: 'var(--text-dim)', cursor: 'pointer', padding: '4px 10px',
            fontSize: 9, fontFamily: 'var(--font-display)', letterSpacing: 2,
            transition: 'border-color 0.15s, color 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.25)'; e.currentTarget.style.color = 'var(--text)' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = 'var(--text-dim)' }}
        >
          ✕ CLOSE
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {/* Aircraft silhouette section */}
        <div style={{
          padding: '16px',
          borderBottom: '1px solid rgba(0,212,200,0.07)',
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          background: 'linear-gradient(135deg, rgba(0,212,200,0.05) 0%, transparent 55%)',
        }}>
          {photo ? (
            <img
              src={photo}
              alt=""
              style={{
                width: 110,
                height: 132,
                objectFit: 'cover',
                border: '1px solid var(--border)',
                borderRadius: 6,
                background: 'rgba(255,255,255,0.04)',
              }}
            />
          ) : (
            <AircraftSilhouette typeCode={typeCode} size={110} />
          )}
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 9, color: 'var(--text-dim)', marginBottom: 5, fontFamily: 'var(--font-display)', letterSpacing: 3 }}>
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
            {owner && owner !== airline && (
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4, lineHeight: 1.3 }}>
                Operated by {owner}
              </div>
            )}
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
            borderBottom: '1px solid rgba(0,212,200,0.07)',
          }}>
            <div style={{ fontSize: 9, color: 'var(--text-dim)', fontFamily: 'var(--font-display)', letterSpacing: 3, marginBottom: 10 }}>
              ROUTE
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <AirportBadge airport={origin} />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                <div style={{ width: '100%', height: 1, background: 'repeating-linear-gradient(90deg, rgba(0,212,200,0.4) 0px, rgba(0,212,200,0.4) 4px, transparent 4px, transparent 8px)' }} />
                <div style={{ fontSize: 9, color: 'rgba(0,212,200,0.5)', fontFamily: 'var(--font-mono)' }}>▶</div>
              </div>
              <AirportBadge airport={dest} />
            </div>
            {routeMiles && (
              <div style={{
                marginTop: 10,
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 8,
              }}>
                <MiniStat label="ROUTE DIST" value={routeMiles.toLocaleString()} unit="mi" />
                <MiniStat label="AIRLINE" value={airlineCode(route?.airline)} />
              </div>
            )}
          </div>
        )}

        {(aircraftFacts || aircraftInfo?.manufacturer || typeCode) && (
          <DossierSection title="AIRCRAFT DOSSIER">
            <InfoRow label="Manufacturer" value={aircraftInfo?.manufacturer || aircraftFacts?.maker} />
            <InfoRow label="Model family" value={aircraftFacts?.family} />
            <InfoRow label="Type code" value={typeCode?.toUpperCase()} />
            <InfoRow label="Mission" value={aircraftFacts?.role} />
            <InfoRow label="Typical seats" value={aircraftFacts?.seats} />
            <InfoRow label="Wake class" value={aircraftFacts?.wake} />
            <InfoRow label="Length" value={aircraftFacts?.lengthFt ? `${aircraftFacts.lengthFt} ft` : null} />
            <InfoRow label="Wingspan" value={aircraftFacts?.wingspanFt ? `${aircraftFacts.wingspanFt} ft` : null} />
            <InfoRow label="Nominal range" value={aircraftFacts?.rangeNm ? `${aircraftFacts.rangeNm.toLocaleString()} nm` : null} />
          </DossierSection>
        )}

        {(airlineFacts || route?.airline) && (
          <DossierSection title="AIRLINE DOSSIER">
            <InfoRow label="Name" value={route?.airline?.name || airline} />
            <InfoRow label="Founded" value={airlineFacts?.founded} />
            <InfoRow label="Headquarters" value={airlineFacts?.hq} />
            <InfoRow label="Alliance" value={airlineFacts?.alliance} />
            <InfoRow label="Country" value={route?.airline?.country || flight.origin_country} />
          </DossierSection>
        )}

        {/* Live telemetry */}
        <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(0,212,200,0.07)' }}>
          <div style={{ fontSize: 9, color: 'var(--text-dim)', fontFamily: 'var(--font-display)', letterSpacing: 3, marginBottom: 10 }}>
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
        <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(0,212,200,0.07)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, alignItems: 'center' }}>
            <span style={{ fontSize: 9, color: 'var(--text-dim)', fontFamily: 'var(--font-display)', letterSpacing: 3 }}>ALTITUDE PROFILE</span>
            <span style={{ fontSize: 11, color: 'var(--cyan)', fontFamily: 'var(--font-mono)' }}>{altFt.toLocaleString()} ft</span>
          </div>
          <AltitudeBar altFt={altFt} vrFpm={vrFpm} />
        </div>

        {/* Flight path toggle */}
        <div style={{ padding: '12px 16px' }}>
          <button
            onClick={() => setShowPath(v => !v)}
            style={{
              width: '100%',
              background: 'none',
              border: 'none',
              borderBottom: showPath ? '1px solid rgba(0,212,200,0.35)' : '1px solid rgba(255,255,255,0.06)',
              padding: '0 0 9px 0',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              color: showPath ? 'var(--cyan)' : 'var(--text-dim)',
              transition: 'color 0.15s, border-color 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--cyan)' }}
            onMouseLeave={e => { if (!showPath) e.currentTarget.style.color = 'var(--text-dim)' }}
          >
            <span style={{ fontSize: 9, fontFamily: 'var(--font-display)', letterSpacing: 3 }}>FLIGHT PATH</span>
            <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', transition: 'transform 0.15s', display: 'inline-block', transform: showPath ? 'rotate(180deg)' : 'none' }}>▾</span>
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

function routeDistanceMiles(origin, dest) {
  if (!origin || !dest) return null
  const values = [origin.latitude, origin.longitude, dest.latitude, dest.longitude].map(Number)
  if (values.some(v => !Number.isFinite(v))) return null
  return Math.round(distanceMiles(values[0], values[1], values[2], values[3]))
}

function airlineCode(airline) {
  if (!airline) return '—'
  const code = airline.iata || airline.icao || '—'
  return airline.country_iso ? `${code} / ${airline.country_iso}` : code
}

function DossierSection({ title, children }) {
  return (
    <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
      <div style={{ fontSize: 9, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', letterSpacing: 1.5, marginBottom: 10 }}>
        {title}
      </div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr',
        gap: 6,
      }}>
        {children}
      </div>
    </div>
  )
}

function InfoRow({ label, value }) {
  if (value === null || value === undefined || value === '') return null
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      gap: 12,
      padding: '6px 0',
      borderBottom: '1px solid rgba(255,255,255,0.04)',
    }}>
      <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{label}</span>
      <span style={{
        fontSize: 11,
        color: 'var(--heading)',
        textAlign: 'right',
        fontFamily: 'var(--font-mono)',
        lineHeight: 1.3,
      }}>
        {value}
      </span>
    </div>
  )
}

function MiniStat({ label, value, unit }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid var(--border)',
      borderRadius: 5,
      padding: '7px 8px',
    }}>
      <div style={{ fontSize: 8, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', letterSpacing: 1.3, marginBottom: 3 }}>
        {label}
      </div>
      <div style={{ fontSize: 13, color: 'var(--heading)', fontFamily: 'var(--font-mono)' }}>
        {value}
        {unit && <span style={{ fontSize: 9, color: 'var(--text-dim)', marginLeft: 4 }}>{unit}</span>}
      </div>
    </div>
  )
}

function AirportBadge({ airport }) {
  if (!airport) return <div style={{ width: 64 }} />
  return (
    <div style={{ textAlign: 'center', minWidth: 60 }}>
      <div style={{
        fontSize: 22, fontFamily: 'var(--font-display)', fontWeight: 400,
        color: 'var(--heading)', letterSpacing: 2, lineHeight: 1,
      }}>
        {airport.iata_code || airport.icao_code || '—'}
      </div>
      <div style={{ fontSize: 9, color: 'var(--text-dim)', marginTop: 3, lineHeight: 1.3, fontFamily: 'var(--font-ui)' }}>
        {airport.municipality || airport.name?.slice(0, 16)}
      </div>
    </div>
  )
}

function TelemetryCard({ label, value, unit, bar, color, noBar }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.025)',
      border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 5,
      padding: '8px 10px',
    }}>
      <div style={{ fontSize: 8, color: 'var(--text-dim)', fontFamily: 'var(--font-display)', letterSpacing: 2, marginBottom: 4, lineHeight: 1 }}>
        {label}
      </div>
      <div style={{ fontSize: 17, fontFamily: 'var(--font-mono)', fontWeight: 400, color: color || 'var(--heading)', lineHeight: 1.1 }}>
        {value}
        {unit && <span style={{ fontSize: 9, color: 'var(--text-dim)', marginLeft: 3 }}>{unit}</span>}
      </div>
      {!noBar && bar !== undefined && (
        <div style={{ marginTop: 6, height: 1.5, background: 'rgba(255,255,255,0.07)', borderRadius: 1 }}>
          <div style={{
            height: '100%', borderRadius: 1,
            background: color || 'var(--cyan)',
            width: `${Math.round(bar * 100)}%`,
            transition: 'width 0.4s ease',
            boxShadow: `0 0 6px ${color || 'var(--cyan)'}`,
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
