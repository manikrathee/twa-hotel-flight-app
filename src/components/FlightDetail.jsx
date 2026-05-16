import { useState, useEffect } from 'react'
import useFlightDetail from '../hooks/useFlightDetail'
import AircraftSilhouette from './AircraftSilhouette'
import FlightPath from './FlightPath'
import { getAircraftFacts, getAirlineFacts, getAirlineName, parseFlightNumber, modelLabel } from '../utils/aircraft'
import { distanceMiles, metersToFeet, msToKnots, headingToCardinal, msTofpm } from '../utils/geo'

export default function FlightDetail({ flight, onClose, onTrackLoad }) {
  const { track, route, aircraftInfo, loading } = useFlightDetail(flight)
  const [showPath, setShowPath] = useState(false)

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

  const altFt      = metersToFeet(flight.baro_altitude)
  const geoAltFt   = flight.geo_altitude ? metersToFeet(flight.geo_altitude) : null
  const altDeltaFt = geoAltFt != null ? geoAltFt - altFt : null
  const spdKt      = msToKnots(flight.velocity)
  const spdMph     = Math.round((flight.velocity || 0) * 2.23694)
  const vrFpm      = msTofpm(flight.vertical_rate)
  const hdg        = Math.round(flight.heading || 0)
  const cardinal   = headingToCardinal(hdg)
  const distMi     = Math.round(flight.distKm * 0.621)

  const origin     = route?.origin
  const dest       = route?.destination
  const routeMiles = routeDistanceMiles(origin, dest)

  // Contact freshness
  const lastContactAgo = flight.last_contact
    ? Math.round(Date.now() / 1000 - flight.last_contact)
    : null

  // Squawk analysis
  const squawk     = flight.squawk
  const sqAlert    = squawk === '7700' || squawk === '7600' || squawk === '7500'
  const sqLabel    = squawk === '7700' ? '⚠ EMERGENCY'
                   : squawk === '7600' ? '⚠ RADIO FAIL'
                   : squawk === '7500' ? '⚠ HIJACK'
                   : squawk

  // Flight phase
  const isClimbing   = vrFpm > 200
  const isDescending = vrFpm < -200
  const phase        = isClimbing ? 'CLIMBING' : isDescending ? 'DESCENDING' : 'LEVEL'
  const phaseColor   = isClimbing ? 'var(--green)' : isDescending ? 'var(--amber)' : 'var(--text-dim)'
  const phaseArrow   = isClimbing ? '↑' : isDescending ? '↓' : '—'

  return (
    <div style={{
      width: '100%',
      height: '100%',
      background: 'rgba(4,4,18,0.99)',
      borderLeft: '1px solid rgba(0,212,200,0.18)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>

      {/* ── Header ───────────────────────────────────── */}
      <div style={{
        padding: '14px 22px 12px',
        borderBottom: '1px solid rgba(0,212,200,0.1)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        flexShrink: 0,
        background: 'linear-gradient(180deg, rgba(0,212,200,0.07) 0%, transparent 100%)',
      }}>
        <div>
          <div style={{ fontSize: 10, fontFamily: 'var(--font-display)', color: 'var(--text-dim)', letterSpacing: 3, marginBottom: 3 }}>
            FLIGHT DETAIL
          </div>
          <div style={{ fontSize: 32, fontFamily: 'var(--font-display)', color: 'var(--cyan)', letterSpacing: 4, lineHeight: 1 }}>
            {flightNum || callsign}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-dim)', marginTop: 4, fontFamily: 'var(--font-ui)' }}>
            {airline}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10, paddingTop: 2 }}>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 5,
              color: 'var(--text-dim)', cursor: 'pointer', padding: '7px 14px',
              fontSize: 11, fontFamily: 'var(--font-display)', letterSpacing: 2,
              transition: 'border-color 0.15s, color 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)'; e.currentTarget.style.color = 'var(--text)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'; e.currentTarget.style.color = 'var(--text-dim)' }}
          >
            ✕ CLOSE
          </button>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: phaseColor, letterSpacing: 1 }}>
            {phaseArrow} {phase}
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>

        {/* ── Aircraft hero ─────────────────────────── */}
        <div style={{
          padding: '16px 22px',
          borderBottom: '1px solid rgba(0,212,200,0.08)',
          display: 'flex', alignItems: 'flex-start', gap: 16,
          background: 'linear-gradient(135deg, rgba(0,212,200,0.04) 0%, transparent 60%)',
        }}>
          <div style={{ flexShrink: 0 }}>
            {photo
              ? <img src={photo} alt="" style={{ width: 120, height: 80, objectFit: 'cover', border: '1px solid var(--border)', borderRadius: 6, background: 'rgba(255,255,255,0.04)' }} />
              : <AircraftSilhouette typeCode={typeCode} size={100} />
            }
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 6, fontFamily: 'var(--font-display)', letterSpacing: 3 }}>AIRCRAFT</div>
            <div style={{ fontSize: 18, color: 'var(--heading)', fontWeight: 600, lineHeight: 1.2 }}>
              {loading && !typeCode ? '...' : (model || 'Unknown')}
            </div>
            {registration && (
              <div style={{ fontSize: 15, color: 'var(--cyan)', fontFamily: 'var(--font-mono)', marginTop: 5, letterSpacing: 1.5 }}>
                {registration}
              </div>
            )}
            {owner && owner !== airline && (
              <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4 }}>op. {owner}</div>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              <IdentBadge label="ICAO" value={flight.icao24?.toUpperCase()} />
              {squawk && <IdentBadge label="SQWK" value={sqLabel} alert={sqAlert} />}
              {flight.origin_country && <IdentBadge label="COUNTRY" value={flight.origin_country} />}
            </div>
          </div>
        </div>

        {/* ── Live telemetry ────────────────────────── */}
        <div style={{ padding: '16px 22px', borderBottom: '1px solid rgba(0,212,200,0.08)' }}>
          <SectionLabel>LIVE TELEMETRY</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
            <BigStat label="ALTITUDE" value={altFt.toLocaleString()} unit="ft"
              sub={`FL${Math.round(altFt / 100).toString().padStart(3, '0')}`} color="var(--cyan)"
              bar={Math.min(altFt / 45000, 1)} />
            <BigStat label="SPEED" value={spdKt} unit="kts"
              sub={`${spdMph} mph`} color="var(--amber)"
              bar={Math.min(spdKt / 600, 1)} />
            <BigStat label="V/RATE" value={vrFpm > 0 ? `+${vrFpm.toLocaleString()}` : vrFpm.toLocaleString()} unit="fpm"
              color={phaseColor} sub={`${phaseArrow} ${phase}`} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <BigStat label="HEADING" value={`${hdg}°`} unit="" sub={cardinal} color="var(--text)" />
            <BigStat label="DIST · JFK" value={distMi} unit="mi"
              sub={`${Math.round(flight.distKm)} km`} color="var(--text)" />
            {lastContactAgo !== null
              ? <BigStat label="LAST CONTACT" value={lastContactAgo < 60 ? lastContactAgo : Math.round(lastContactAgo / 60)}
                  unit={lastContactAgo < 60 ? 'sec' : 'min'}
                  color={lastContactAgo > 45 ? 'var(--amber)' : 'var(--green)'} />
              : geoAltFt && <BigStat label="GEO ALT" value={geoAltFt.toLocaleString()} unit="ft"
                  sub={altDeltaFt != null ? `Δ ${altDeltaFt > 0 ? '+' : ''}${altDeltaFt} ft` : null}
                  color="var(--text-dim)" />
            }
          </div>
          {geoAltFt && lastContactAgo !== null && (
            <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              <BigStat label="GEO ALT" value={geoAltFt.toLocaleString()} unit="ft"
                sub={altDeltaFt != null ? `Δ ${altDeltaFt > 0 ? '+' : ''}${altDeltaFt} ft` : null}
                color="var(--text-dim)" />
            </div>
          )}
        </div>

        {/* ── Altitude profile ──────────────────────── */}
        <div style={{ padding: '14px 22px', borderBottom: '1px solid rgba(0,212,200,0.08)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <SectionLabel>ALTITUDE PROFILE</SectionLabel>
            <span style={{ fontSize: 13, color: 'var(--cyan)', fontFamily: 'var(--font-mono)' }}>
              FL{Math.round(altFt / 100).toString().padStart(3, '0')}
            </span>
          </div>
          <AltitudeBar altFt={altFt} vrFpm={vrFpm} />
        </div>

        {/* ── Route ────────────────────────────────── */}
        {(origin || dest) && (
          <div style={{ padding: '14px 22px', borderBottom: '1px solid rgba(0,212,200,0.08)' }}>
            <SectionLabel>ROUTE</SectionLabel>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 2 }}>
              <AirportBadge airport={origin} />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                <div style={{ width: '100%', height: 1, background: 'repeating-linear-gradient(90deg, rgba(0,212,200,0.45) 0, rgba(0,212,200,0.45) 5px, transparent 5px, transparent 10px)' }} />
                {routeMiles && (
                  <span style={{ fontSize: 12, color: 'rgba(0,212,200,0.65)', fontFamily: 'var(--font-mono)', letterSpacing: 0.5 }}>
                    {routeMiles.toLocaleString()} mi
                  </span>
                )}
              </div>
              <AirportBadge airport={dest} />
            </div>
            {(origin?.elevation_ft || dest?.elevation_ft) && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 10 }}>
                {origin?.elevation_ft && <MiniKV label={`${origin.iata_code || '—'} elevation`} value={`${Number(origin.elevation_ft).toLocaleString()} ft`} />}
                {dest?.elevation_ft && <MiniKV label={`${dest.iata_code || '—'} elevation`} value={`${Number(dest.elevation_ft).toLocaleString()} ft`} />}
              </div>
            )}
            {route?.airline && (
              <div style={{ marginTop: 10, fontSize: 13, color: 'var(--text-dim)' }}>
                {route.airline.name}
                {(route.airline.iata || route.airline.icao) && (
                  <span style={{ marginLeft: 8, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'rgba(0,212,200,0.55)' }}>
                    {[route.airline.iata, route.airline.icao].filter(Boolean).join(' / ')}
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Position & Identification ────────────── */}
        <DossierSection title="POSITION & IDENTIFICATION">
          {flight.latitude  != null && <InfoRow label="Latitude"  value={`${flight.latitude.toFixed(5)}°N`} mono />}
          {flight.longitude != null && <InfoRow label="Longitude" value={`${Math.abs(flight.longitude).toFixed(5)}°${flight.longitude < 0 ? 'W' : 'E'}`} mono />}
          <InfoRow label="ICAO 24-bit" value={flight.icao24?.toUpperCase()} mono />
          {squawk && <InfoRow label="Squawk" value={sqLabel} color={sqAlert ? 'var(--red)' : 'var(--heading)'} mono />}
          <InfoRow label="Origin country" value={flight.origin_country} />
          {flight.time_position && (
            <InfoRow label="Position fix" value={new Date(flight.time_position * 1000).toUTCString().slice(17, 25) + ' UTC'} mono />
          )}
          {lastContactAgo != null && (
            <InfoRow label="Last contact"
              value={lastContactAgo < 60 ? `${lastContactAgo}s ago` : `${Math.round(lastContactAgo / 60)}m ago`}
              color={lastContactAgo > 60 ? 'var(--amber)' : undefined} />
          )}
        </DossierSection>

        {/* ── Aircraft dossier ──────────────────────── */}
        {(aircraftFacts || aircraftInfo?.manufacturer || typeCode) && (
          <DossierSection title="AIRCRAFT DOSSIER">
            <InfoRow label="Manufacturer" value={aircraftInfo?.manufacturer || aircraftFacts?.maker} />
            <InfoRow label="Model" value={aircraftInfo?.model || aircraftFacts?.family} />
            <InfoRow label="Type code" value={typeCode?.toUpperCase()} mono />
            <InfoRow label="Role" value={aircraftFacts?.role} />
            <InfoRow label="Capacity" value={aircraftFacts?.seats ? `${aircraftFacts.seats} seats` : null} />
            <InfoRow label="Wake turbulence" value={aircraftFacts?.wake} />
            <InfoRow label="Length" value={aircraftFacts?.lengthFt ? `${aircraftFacts.lengthFt} ft` : null} />
            <InfoRow label="Wingspan" value={aircraftFacts?.wingspanFt ? `${aircraftFacts.wingspanFt} ft` : null} />
            <InfoRow label="Range" value={aircraftFacts?.rangeNm ? `${aircraftFacts.rangeNm.toLocaleString()} nm` : null} />
          </DossierSection>
        )}

        {/* ── Airline dossier ───────────────────────── */}
        {(airlineFacts || route?.airline) && (
          <DossierSection title="AIRLINE DOSSIER">
            <InfoRow label="Airline" value={route?.airline?.name || airline} />
            {(route?.airline?.iata || route?.airline?.icao) && (
              <InfoRow label="IATA / ICAO" value={[route.airline.iata, route.airline.icao].filter(Boolean).join(' / ')} mono />
            )}
            {route?.airline?.country_iso && <InfoRow label="Country" value={route.airline.country || route.airline.country_iso} />}
            <InfoRow label="Founded" value={airlineFacts?.founded} />
            <InfoRow label="Headquarters" value={airlineFacts?.hq} />
            <InfoRow label="Alliance" value={airlineFacts?.alliance} />
          </DossierSection>
        )}

        {/* ── Flight path ───────────────────────────── */}
        <div style={{ padding: '14px 22px 24px' }}>
          <button
            onClick={() => setShowPath(v => !v)}
            style={{
              width: '100%', background: 'none', border: 'none',
              borderBottom: `1px solid ${showPath ? 'rgba(0,212,200,0.4)' : 'rgba(255,255,255,0.07)'}`,
              padding: '0 0 10px 0', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              color: showPath ? 'var(--cyan)' : 'var(--text-dim)',
              transition: 'color 0.15s, border-color 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--cyan)' }}
            onMouseLeave={e => { if (!showPath) e.currentTarget.style.color = 'var(--text-dim)' }}
          >
            <span style={{ fontSize: 10, fontFamily: 'var(--font-display)', letterSpacing: 3 }}>
              FLIGHT PATH
              <span style={{ marginLeft: 8, opacity: 0.6 }}>
                {track ? '· READY' : loading ? '· LOADING' : '· NO DATA'}
              </span>
            </span>
            <span style={{ fontSize: 13, fontFamily: 'var(--font-mono)', display: 'inline-block', transform: showPath ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>▾</span>
          </button>
          {showPath && track && (
            <div style={{ marginTop: 14, animation: 'fade-in 0.2s ease' }}>
              <FlightPath track={track} currentAlt={flight.baro_altitude} />
            </div>
          )}
          {showPath && !track && loading && (
            <div style={{ marginTop: 14, textAlign: 'center', color: 'var(--text-dim)', fontSize: 13, fontFamily: 'var(--font-mono)' }}>
              Fetching path data…
            </div>
          )}
          {showPath && !track && !loading && (
            <div style={{ marginTop: 14, textAlign: 'center', color: 'var(--text-dim)', fontSize: 13 }}>
              No path data available
            </div>
          )}
        </div>

      </div>
    </div>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function routeDistanceMiles(origin, dest) {
  if (!origin || !dest) return null
  const vals = [origin.latitude, origin.longitude, dest.latitude, dest.longitude].map(Number)
  if (vals.some(v => !Number.isFinite(v))) return null
  return Math.round(distanceMiles(vals[0], vals[1], vals[2], vals[3]))
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionLabel({ children }) {
  return (
    <div style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--font-display)', letterSpacing: 3, marginBottom: 12 }}>
      {children}
    </div>
  )
}

function IdentBadge({ label, value, alert }) {
  if (!value) return null
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 2,
      background: alert ? 'rgba(227,30,38,0.12)' : 'rgba(255,255,255,0.04)',
      border: `1px solid ${alert ? 'rgba(227,30,38,0.35)' : 'rgba(255,255,255,0.1)'}`,
      borderRadius: 5, padding: '4px 10px',
    }}>
      <span style={{ fontSize: 9, color: 'var(--text-dim)', fontFamily: 'var(--font-display)', letterSpacing: 2 }}>{label}</span>
      <span style={{ fontSize: 13, color: alert ? 'var(--red)' : 'var(--heading)', fontFamily: 'var(--font-mono)', letterSpacing: 0.5 }}>{value}</span>
    </div>
  )
}

function BigStat({ label, value, unit, sub, color, bar }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 6,
      padding: '10px 12px',
    }}>
      <div style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--font-display)', letterSpacing: 2, marginBottom: 5 }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontFamily: 'var(--font-mono)', color: color || 'var(--heading)', lineHeight: 1.1 }}>
        {value}
        {unit && <span style={{ fontSize: 11, color: 'var(--text-dim)', marginLeft: 4 }}>{unit}</span>}
      </div>
      {sub && (
        <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 3, fontFamily: 'var(--font-mono)' }}>{sub}</div>
      )}
      {bar !== undefined && (
        <div style={{ marginTop: 7, height: 2, background: 'rgba(255,255,255,0.07)', borderRadius: 1 }}>
          <div style={{ height: '100%', borderRadius: 1, background: color || 'var(--cyan)', width: `${Math.round(bar * 100)}%`, transition: 'width 0.5s ease' }} />
        </div>
      )}
    </div>
  )
}

function DossierSection({ title, children }) {
  const valid = Array.isArray(children) ? children.filter(Boolean) : children
  if (!valid || (Array.isArray(valid) && valid.length === 0)) return null
  return (
    <div style={{ padding: '14px 22px', borderBottom: '1px solid rgba(0,212,200,0.07)' }}>
      <SectionLabel>{title}</SectionLabel>
      <div>{children}</div>
    </div>
  )
}

function InfoRow({ label, value, mono, color }) {
  if (value === null || value === undefined || value === '') return null
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', gap: 16,
      padding: '7px 0',
      borderBottom: '1px solid rgba(255,255,255,0.04)',
    }}>
      <span style={{ fontSize: 13, color: 'var(--text-dim)', flexShrink: 0 }}>{label}</span>
      <span style={{
        fontSize: 13, color: color || 'var(--heading)',
        textAlign: 'right',
        fontFamily: mono ? 'var(--font-mono)' : 'var(--font-ui)',
        letterSpacing: mono ? 0.5 : 0,
        lineHeight: 1.4,
      }}>
        {value}
      </span>
    </div>
  )
}

function MiniKV({ label, value }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 5, padding: '6px 10px' }}>
      <div style={{ fontSize: 9, color: 'var(--text-dim)', fontFamily: 'var(--font-display)', letterSpacing: 2, marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 14, color: 'var(--heading)', fontFamily: 'var(--font-mono)' }}>{value}</div>
    </div>
  )
}

function AirportBadge({ airport }) {
  if (!airport) return <div style={{ width: 70 }} />
  return (
    <div style={{ textAlign: 'center', minWidth: 70 }}>
      <div style={{ fontSize: 28, fontFamily: 'var(--font-display)', color: 'var(--heading)', letterSpacing: 2, lineHeight: 1 }}>
        {airport.iata_code || airport.icao_code || '—'}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4, lineHeight: 1.3 }}>
        {airport.municipality || airport.name?.slice(0, 18)}
      </div>
      {airport.country && (
        <div style={{ fontSize: 10, color: 'rgba(84,96,112,0.7)', marginTop: 1 }}>{airport.country}</div>
      )}
    </div>
  )
}

function AltitudeBar({ altFt, vrFpm }) {
  const pct = Math.min(altFt / 42000, 1)
  const isClimbing   = vrFpm > 100
  const isDescending = vrFpm < -100
  const levels = [0, 5000, 10000, 18000, 24000, 33000, 42000]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
        {levels.map(l => (
          <span key={l} style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
            {l === 0 ? 'GND' : `${Math.round(l / 1000)}k`}
          </span>
        ))}
      </div>
      <div style={{ height: 9, background: 'rgba(255,255,255,0.06)', borderRadius: 5, position: 'relative', overflow: 'hidden' }}>
        <div style={{
          position: 'absolute', left: 0, top: 0, bottom: 0,
          width: `${Math.round(pct * 100)}%`,
          background: isClimbing
            ? 'linear-gradient(90deg, var(--cyan), var(--green))'
            : isDescending
            ? 'linear-gradient(90deg, var(--cyan), var(--amber))'
            : 'var(--cyan)',
          borderRadius: 5,
          transition: 'width 0.6s ease',
          boxShadow: '0 0 10px var(--cyan)',
        }} />
        {[18000, 24000, 33000].map(l => (
          <div key={l} style={{
            position: 'absolute', top: 0, bottom: 0,
            left: `${Math.round(l / 42000 * 100)}%`,
            width: 1, background: 'rgba(255,255,255,0.15)',
          }} />
        ))}
      </div>
      <div style={{ marginTop: 5, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
          {isClimbing ? '↑ CLIMBING' : isDescending ? '↓ DESCENDING' : '— LEVEL CRUISE'}
        </span>
        <span style={{ fontSize: 12, color: 'var(--cyan)', fontFamily: 'var(--font-mono)' }}>
          {altFt.toLocaleString()} ft
        </span>
      </div>
    </div>
  )
}
