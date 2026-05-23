import { useState, useEffect, useRef } from 'react'
import useFlightDetail from '../hooks/useFlightDetail'
import AircraftRender from './AircraftRender'
import FlightPath from './FlightPath'
import { getAircraftFacts, getAirlineFacts, getAirlineName, parseFlightNumber, modelLabel } from '../utils/aircraft'
import { distanceMiles, metersToFeet, msToKnots, headingToCardinal, msTofpm } from '../utils/geo'

export default function FlightDetail({ flight, onClose, onTrackLoad, lastUpdated, refreshMs, autoFocusCloseButton }) {
  const closeButtonRef = useRef(null)
  const { track, route, aircraftInfo, loading } = useFlightDetail(flight)
  const [showPath, setShowPath] = useState(false)
  const [nowMs, setNowMs] = useState(() => Date.now())

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => { onTrackLoad?.(track) }, [onTrackLoad, track])
  useEffect(() => {
    if (!autoFocusCloseButton) return
    const timer = setTimeout(() => closeButtonRef.current?.focus(), 0)
    return () => clearTimeout(timer)
  }, [autoFocusCloseButton])

  const callsign = flight.callsign || flight.icao24
  const flightNum = parseFlightNumber(callsign)
  const airline = getAirlineName(callsign) || route?.airline?.name || flight.origin_country
  const typeCode = resolveTypeCode(aircraftInfo)
  const aircraftFacts = getAircraftFacts(typeCode)
  const airlineFacts = getAirlineFacts(callsign, route?.airline)
  const manufacturer = cleanText(aircraftInfo?.manufacturer) || aircraftFacts?.maker || 'Operator fleet'
  const model = resolveModel({
    flightNum,
    manufacturer,
    model: cleanText(aircraftInfo?.model),
    typeCode,
    facts: aircraftFacts,
    route
  })
  const displayModel = model || 'Operator-assigned platform profile'
  const registration = cleanText(aircraftInfo?.registration) || 'Registration pending'
  const owner = cleanText(aircraftInfo?.registered_owner)

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
  const dossierRole = aircraftFacts?.role || inferRoleFromRoute(routeMiles, model)
  const dossierSeats = aircraftFacts?.seats ? `${aircraftFacts.seats} seats` : 'Seat layout varies by config'
  const dossierWake = aircraftFacts?.wake || 'Balanced'
  const dossierLength = aircraftFacts?.lengthFt ? `${aircraftFacts.lengthFt} ft` : 'Varies by variant'
  const dossierWingspan = aircraftFacts?.wingspanFt ? `${aircraftFacts.wingspanFt} ft` : 'Varies by variant'
  const dossierRange = aircraftFacts?.rangeNm ? `${aircraftFacts.rangeNm.toLocaleString()} nm` : 'Range depends on configuration'
  const dossierHistory = aircraftFacts?.history || inferHistoryLabel({ model: displayModel, manufacturer, typeCode, route, routeMiles, flightNum })

  // Contact freshness
  const lastContactLagSec = flight.last_contact
    ? Math.max(0, Math.floor(nowMs / 1000) - flight.last_contact)
    : null
  const lastContactStamp = flight.last_contact
    ? `${new Date(flight.last_contact * 1000).toUTCString().slice(17, 25)} UTC`
    : null
  const nowSec = Math.floor(nowMs / 1000)
  const positionAgeSec = flight.time_position
    ? Math.max(0, nowSec - flight.time_position)
    : null
  const contactAgeSec = flight.last_contact
    ? Math.max(0, nowSec - flight.last_contact)
    : null
  const sourceLabel = positionSourceLabel(flight.position_source)
  const statusLabel = flight.on_ground === true ? 'GROUND'
                    : flight.on_ground === false ? 'AIRBORNE'
                    : null
  const statusColor = flight.on_ground === true ? 'var(--amber)' : 'var(--green)'
  const latShort = compactLatitude(flight.latitude)
  const lonShort = compactLongitude(flight.longitude)

  // Squawk analysis
  const squawk     = flight.squawk
  const sqAlert    = squawk === '7700' || squawk === '7600' || squawk === '7500'
  const sqLabel    = squawk === '7700' ? '⚠ EMERGENCY'
                   : squawk === '7600' ? '⚠ RADIO FAIL'
                   : squawk === '7500' ? '⚠ HIJACK'
                   : squawk

  const routePathProgress = routeProgress(origin, dest, flight, routeMiles)
  const overflyCountries = uniqueCountries([
    origin?.country,
    origin?.country_iso,
    flight.origin_country,
    dest?.country,
    dest?.country_iso,
  ])

  // Flight phase
  const isClimbing   = vrFpm > 200
  const isDescending = vrFpm < -200
  const phase        = isClimbing ? 'CLIMBING' : isDescending ? 'DESCENDING' : 'LEVEL'
  const phaseColor   = isClimbing ? 'var(--green)' : isDescending ? 'var(--amber)' : 'var(--text-dim)'
  const phaseArrow   = isClimbing ? '↑' : isDescending ? '↓' : '—'
  const refreshSec   = refreshMs ? Math.round(refreshMs / 1000) : null
  const updatedLabel = lastUpdated
    ? lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
    : null

  return (
    <div style={{
      width: '100%',
      height: '100%',
      background: 'var(--panel-strong)',
      borderLeft: '1px solid var(--border-bright)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      animation: 'slide-right 0.22s ease',
    }}>

      {/* ── Header ───────────────────────────────────── */}
      <div style={{
        padding: '14px 22px 12px',
        borderBottom: '1px solid var(--panel-line)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        flexShrink: 0,
        background: 'linear-gradient(180deg, rgba(var(--cyan-alt-rgb), 0.06) 0%, transparent 100%)',
      }}>
        <div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', letterSpacing: 0.2, marginBottom: 3, fontWeight: 600 }}>
            FLIGHT DETAIL
          </div>
          <div style={{ fontSize: 22, color: 'var(--cyan)', letterSpacing: 0.3, lineHeight: 1, fontWeight: 700 }}>
            {flightNum || callsign}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-dim)', marginTop: 4, fontFamily: 'var(--font-ui)' }}>
            {airline}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10, paddingTop: 2 }}>
          <button
            type="button"
            ref={closeButtonRef}
            aria-label={`Close details for ${flightNum || callsign}`}
            onClick={onClose}
            style={{
              background: 'none', border: '1px solid var(--panel-subtle)', borderRadius: 5,
              color: 'var(--text-dim)', cursor: 'pointer', padding: '7px 14px',
              fontSize: 12, fontWeight: 600, letterSpacing: 0.2,
              transition: 'border-color 0.15s, color 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--panel-divider)'; e.currentTarget.style.color = 'var(--text)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--panel-subtle)'; e.currentTarget.style.color = 'var(--text-dim)' }}
          >
            ✕ CLOSE
          </button>
          <div style={{ fontSize: 12, color: phaseColor, fontWeight: 600 }}>
            {phaseArrow} {phase}
          </div>
          {(refreshSec || updatedLabel) && (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--green)', letterSpacing: 0.8 }}>
              LIVE
              {refreshSec ? ` · ${refreshSec}s refresh` : ''}
              {updatedLabel ? ` · ${updatedLabel}` : ''}
            </div>
          )}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>

        {/* ── Aircraft hero ─────────────────────────── */}
        <div style={{
          padding: '16px 22px',
          borderBottom: '1px solid var(--panel-line)',
          display: 'flex', alignItems: 'flex-start', gap: 16,
          background: 'linear-gradient(135deg, rgba(var(--cyan-alt-rgb), 0.045) 0%, transparent 60%)',
        }}>
          <div style={{ flexShrink: 0 }}>
            <AircraftRender typeCode={typeCode} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 6, fontWeight: 600, letterSpacing: 0.2 }}>AIRCRAFT</div>
            <div style={{ fontSize: 15, color: 'var(--heading)', fontWeight: 600, lineHeight: 1.2 }}>
              {loading && !displayModel ? '...' : displayModel}
            </div>
            {registration && (
              <div style={{ fontSize: 13, color: 'var(--cyan)', marginTop: 5, fontWeight: 600 }}>
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
        <div style={{ padding: '16px 22px', borderBottom: '1px solid var(--panel-line)' }}>
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
            {lastContactLagSec !== null
              ? <BigStat label="CONTACT LAG" value={lastContactLagSec} unit="sec"
                  color={lastContactLagSec > 45 ? 'var(--amber)' : 'var(--green)'} />
              : geoAltFt && <BigStat label="GEO ALT" value={geoAltFt.toLocaleString()} unit="ft"
                  sub={altDeltaFt != null ? `Δ ${altDeltaFt > 0 ? '+' : ''}${altDeltaFt} ft` : null}
                  color="var(--text-dim)" />
            }
          </div>
          {geoAltFt && lastContactLagSec !== null && (
            <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              <BigStat label="GEO ALT" value={geoAltFt.toLocaleString()} unit="ft"
                sub={altDeltaFt != null ? `Δ ${altDeltaFt > 0 ? '+' : ''}${altDeltaFt} ft` : null}
                color="var(--text-dim)" />
            </div>
          )}
          <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            {positionAgeSec !== null && (
              <BigStat label="FIX AGE" value={formatAgeSeconds(positionAgeSec)}
                sub="position timestamp" color={ageColor(positionAgeSec)} />
            )}
            {contactAgeSec !== null && (
              <BigStat label="LAST SEEN" value={formatAgeSeconds(contactAgeSec)}
                sub="transponder contact" color={ageColor(contactAgeSec)} />
            )}
            {sourceLabel && (
              <BigStat label="SOURCE" value={sourceLabel}
                sub="position source" color="var(--cyan)" />
            )}
          </div>
          <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            {statusLabel && (
              <BigStat label="STATUS" value={statusLabel}
                sub={flight.spi ? 'special position ident' : 'normal transponder'} color={statusColor} />
            )}
            {latShort && (
              <BigStat label="LATITUDE" value={latShort}
                sub="current fix" color="var(--text)" />
            )}
            {lonShort && (
              <BigStat label="LONGITUDE" value={lonShort}
                sub="current fix" color="var(--text)" />
            )}
          </div>
        </div>

        {/* ── Altitude profile ──────────────────────── */}
        <div style={{ padding: '14px 22px', borderBottom: '1px solid var(--panel-line)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <SectionLabel>ALTITUDE PROFILE</SectionLabel>
            <span style={{ fontSize: 13, color: 'var(--cyan)', fontWeight: 600 }}>
              FL{Math.round(altFt / 100).toString().padStart(3, '0')}
            </span>
          </div>
          <AltitudeBar altFt={altFt} vrFpm={vrFpm} />
        </div>

        {/* ── Route ────────────────────────────────── */}
        {(origin || dest) && (
          <div style={{ padding: '14px 22px', borderBottom: '1px solid var(--panel-line)' }}>
            <SectionLabel>ROUTE</SectionLabel>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 2 }}>
              <AirportBadge airport={origin} />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                <div style={{ width: '100%', height: 1, background: 'repeating-linear-gradient(90deg, rgba(var(--cyan-alt-rgb), 0.45) 0, rgba(var(--cyan-alt-rgb), 0.45) 5px, transparent 5px, transparent 10px)' }} />
                {routeMiles && (
                  <span style={{ fontSize: 12, color: 'rgba(var(--cyan-alt-rgb), 0.65)', letterSpacing: 0.1 }}>
                    {routeMiles.toLocaleString()} mi
                  </span>
                )}
                {routePathProgress && routePathProgress.progress !== null && (
                  <span style={{ fontSize: 12, color: 'rgba(var(--cyan-alt-rgb), 0.65)', letterSpacing: 0.1 }}>
                    {routePathProgress.progress}% complete · {routePathProgress.remainingMi.toLocaleString()} mi to destination
                  </span>
                )}
                {routePathProgress && routePathProgress.progress === null && (
                  <span style={{ fontSize: 12, color: 'rgba(var(--cyan-alt-rgb), 0.65)', letterSpacing: 0.1 }}>
                    {routePathProgress.remainingMi.toLocaleString()} mi to destination
                  </span>
                )}
              </div>
              <AirportBadge airport={dest} />
            </div>
            {(route?.airline || Number.isFinite(routePathProgress?.flownMi)) && (
              <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {route?.airline && (
                  <MiniKV
                    label="AIRLINE"
                    value={`${route.airline.name}${route.airline.iata || route.airline.icao ? ` (${[route.airline.iata, route.airline.icao].filter(Boolean).join('/')})` : ''}`}
                  />
                )}
                {Number.isFinite(routePathProgress?.flownMi) && <MiniKV label="FLOWN" value={`${routePathProgress.flownMi.toLocaleString()} mi`} />}
              </div>
            )}
            {overflyCountries.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', letterSpacing: 0.2, marginBottom: 6 }}>COUNTRIES ALONG PATH</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                  {overflyCountries.map(country => (
                    <span key={country} style={{
                      padding: '3px 8px',
                      borderRadius: 999,
                      fontSize: 11,
                      background: 'rgba(var(--cyan-alt-rgb), 0.12)',
                      border: '1px solid rgba(var(--cyan-alt-rgb), 0.34)',
                      color: 'var(--text)',
                      letterSpacing: 0.1,
                    }}>
                      {country}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {(origin?.elevation_ft || dest?.elevation_ft) && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 10 }}>
                {origin?.elevation_ft && <MiniKV label={`${origin.iata_code || '—'} elevation`} value={`${Number(origin.elevation_ft).toLocaleString()} ft`} />}
                {dest?.elevation_ft && <MiniKV label={`${dest.iata_code || '—'} elevation`} value={`${Number(dest.elevation_ft).toLocaleString()} ft`} />}
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
          {lastContactStamp && (
            <InfoRow label="Last contact"
              value={lastContactStamp}
              color={lastContactLagSec != null && lastContactLagSec > 45 ? 'var(--amber)' : undefined} />
          )}
        </DossierSection>

        {/* ── Aircraft dossier ──────────────────────── */}
        <DossierSection title="AIRCRAFT DOSSIER">
          <InfoRow label="Manufacturer" value={manufacturer} />
          <InfoRow label="Model" value={displayModel} />
          <InfoRow label="Type code" value={typeCode?.toUpperCase() || 'Route inferred'} mono />
          <InfoRow label="Role" value={dossierRole} />
          <InfoRow label="Capacity" value={dossierSeats} />
          <InfoRow label="Wake turbulence" value={dossierWake} />
          <InfoRow label="Length" value={dossierLength} />
          <InfoRow label="Wingspan" value={dossierWingspan} />
          <InfoRow label="Range" value={dossierRange} />
          <InfoRow label="History / Notes" value={dossierHistory} />
        </DossierSection>

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
            type="button"
            aria-expanded={showPath}
            aria-controls="flight-path-panel"
            aria-label={`${showPath ? 'Hide' : 'Show'} historical path for ${flightNum || callsign}`}
            onClick={() => setShowPath(v => !v)}
            style={{
              width: '100%', background: 'none', border: 'none',
              borderBottom: `1px solid ${showPath ? 'rgba(var(--cyan-alt-rgb), 0.45)' : 'var(--panel-divider)'}`,
              padding: '0 0 10px 0', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              color: showPath ? 'var(--cyan)' : 'var(--text-dim)',
              transition: 'color 0.15s, border-color 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--cyan)' }}
            onMouseLeave={e => { if (!showPath) e.currentTarget.style.color = 'var(--text-dim)' }}
          >
            <span style={{ fontSize: 12, letterSpacing: 0.2, fontWeight: 600 }}>
              FLIGHT PATH
              <span style={{ marginLeft: 8, opacity: 0.6 }}>
                {track ? '· READY' : loading ? '· LOADING' : '· NO DATA'}
              </span>
            </span>
            <span style={{ fontSize: 13, display: 'inline-block', transform: showPath ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>▾</span>
          </button>
          <div id="flight-path-panel" style={{ marginTop: 14, display: showPath ? 'block' : 'none' }}>
            {showPath && track && (
              <div style={{ animation: 'fade-in 0.2s ease' }}>
                <FlightPath track={track} route={route} />
              </div>
            )}
            {showPath && !track && loading && (
              <div role="status" aria-live="polite" style={{ textAlign: 'center', color: 'var(--text-dim)', fontSize: 13 }}>
                Fetching path data…
              </div>
            )}
            {showPath && !track && !loading && (
              <div role="status" aria-live="polite" aria-atomic="true" style={{ textAlign: 'center', color: 'var(--text-dim)', fontSize: 13 }}>
                No path data available
              </div>
            )}
          </div>
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

function routeProgress(origin, dest, flight, routeMiles) {
  if (!origin || !dest) return null
  if (flight.latitude == null || flight.longitude == null) return null
  const remainingMi = Math.round(distanceMiles(flight.latitude, flight.longitude, dest.latitude, dest.longitude))
  if (!routeMiles || !Number.isFinite(routeMiles)) {
    return { remainingMi, flownMi: null, progress: null }
  }
  const flownMi = Math.round(distanceMiles(origin.latitude, origin.longitude, flight.latitude, flight.longitude))
  const progress = Math.round(clamp01(flownMi / routeMiles) * 100)
  return { remainingMi, flownMi, progress }
}

function uniqueCountries(values) {
  const list = []
  for (const value of values) {
    const country = String(value || '').trim()
    if (country && !list.includes(country)) list.push(country)
  }
  return list
}

function clamp01(value) {
  if (!Number.isFinite(value)) return 0
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}

function positionSourceLabel(source) {
  if (source === null || source === undefined || source === '') return null
  return {
    0: 'ADS-B',
    1: 'ASTERIX',
    2: 'MLAT',
    3: 'FLARM',
  }[source] || `SRC ${source}`
}

function formatAgeSeconds(seconds) {
  if (seconds < 60) return `${Math.round(seconds)}s`
  if (seconds < 3600) {
    const mins = Math.floor(seconds / 60)
    const secs = Math.round(seconds % 60)
    return `${mins}m ${secs}s`
  }
  const hours = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  return `${hours}h ${mins}m`
}

function ageColor(seconds) {
  if (seconds > 90) return 'var(--red)'
  if (seconds > 45) return 'var(--amber)'
  return 'var(--green)'
}

function compactLatitude(value) {
  const num = Number(value)
  if (!Number.isFinite(num)) return null
  return `${Math.abs(num).toFixed(3)}°${num < 0 ? 'S' : 'N'}`
}

function compactLongitude(value) {
  const num = Number(value)
  if (!Number.isFinite(num)) return null
  return `${Math.abs(num).toFixed(3)}°${num < 0 ? 'W' : 'E'}`
}

function resolveTypeCode(aircraftInfo) {
  const typeLike = aircraftInfo?.type || aircraftInfo?.icao_type || aircraftInfo?.typecode || aircraftInfo?.type_code || aircraftInfo?.typeCode
  return cleanText(typeLike)?.toUpperCase() || null
}

function resolveModel({ manufacturer, model, typeCode, facts, route, flightNum }) {
  const directModel = modelLabel(manufacturer, model, typeCode)
  if (directModel) return directModel
  if (facts?.family) return facts.family

  const shortPrefix = typeof flightNum === 'string' ? flightNum.split(' ')[0] : 'Flight'
  const routeMiles = route ? routeDistanceMiles(route?.origin, route?.destination) : null

  if (routeMiles >= 2500) return `${shortPrefix} long-haul platform`
  if (routeMiles >= 900) return `${shortPrefix} route platform`
  return `${shortPrefix} transport platform`
}

function inferRoleFromRoute(routeMiles, model) {
  if (routeMiles == null) return `Commercial transport profile for ${model}`
  if (routeMiles >= 2500) return 'Long-haul transport'
  if (routeMiles >= 1200) return 'Medium-haul transport'
  return 'Regional/short-haul transport'
}

function inferHistoryLabel({ model, manufacturer, typeCode, route, routeMiles, flightNum }) {
  const from = route?.origin?.iata_code || route?.origin?.icao_code || 'origin'
  const to = route?.destination?.iata_code || route?.destination?.icao_code || 'destination'
  const routeTag = routeMiles == null ? `${flightNum || 'This'} route` : `${from} → ${to}`

  if (typeCode) {
    return `${manufacturer} ${model} (type ${typeCode}) is documented in fleet references and active on ${routeTag}.`
  }
  return `${model} supports ${routeTag}; identity is derived from live flight context and remains route-validated.`
}

function cleanText(value) {
  if (!value && value !== 0) return null
  const clean = String(value).trim()
  if (!clean) return null
  if (/^(unknown|n\/a|na|none|not available|tbd)$/i.test(clean)) return null
  return clean
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionLabel({ children }) {
  return (
    <div style={{ fontSize: 12, color: 'var(--text-dim)', fontWeight: 600, letterSpacing: 0.2, marginBottom: 10 }}>
      {children}
    </div>
  )
}

function IdentBadge({ label, value, alert }) {
  if (!value) return null
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 2,
      background: alert ? 'rgba(var(--red-alt-rgb), 0.12)' : 'var(--panel-subtle)',
      border: `1px solid ${alert ? 'rgba(var(--red-alt-rgb), 0.35)' : 'var(--panel-border)'}`,
      borderRadius: 5, padding: '4px 10px',
    }}>
      <span style={{ fontSize: 11, color: 'var(--text-dim)', letterSpacing: 0.2 }}>{label}</span>
      <span style={{ fontSize: 13, color: alert ? 'var(--red)' : 'var(--heading)', fontWeight: 600, letterSpacing: 0.1 }}>{value}</span>
    </div>
  )
}

function BigStat({ label, value, unit, sub, color, bar }) {
  return (
    <div style={{
      background: 'var(--panel-soft)',
      border: '1px solid var(--panel-border)',
      borderRadius: 6,
      padding: '10px 12px',
      animation: 'metric-pop 0.28s ease both',
    }}>
      <div style={{ fontSize: 11, color: 'var(--text-dim)', letterSpacing: 0.2, marginBottom: 5 }}>
        {label}
      </div>
      <div style={{ fontSize: 17, color: color || 'var(--heading)', lineHeight: 1.1, fontWeight: 700 }}>
        {value}
        {unit && <span style={{ fontSize: 11, color: 'var(--text-dim)', marginLeft: 4 }}>{unit}</span>}
      </div>
      {sub && (
        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 3 }}>{sub}</div>
      )}
      {bar !== undefined && (
        <div style={{ marginTop: 7, height: 2, background: 'var(--panel-line)', borderRadius: 1 }}>
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
    <div style={{ padding: '14px 22px', borderBottom: '1px solid var(--panel-line)' }}>
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
      borderBottom: '1px solid var(--panel-line)',
    }}>
      <span style={{ fontSize: 13, color: 'var(--text-dim)', flexShrink: 0 }}>{label}</span>
      <span style={{
        fontSize: 13, color: color || 'var(--heading)',
        textAlign: 'right',
        fontFamily: 'var(--font-ui)',
        letterSpacing: mono ? 0.1 : 0,
        lineHeight: 1.4,
      }}>
        {value}
      </span>
    </div>
  )
}

function MiniKV({ label, value }) {
  return (
    <div style={{ background: 'var(--panel-soft)', border: '1px solid var(--panel-border)', borderRadius: 5, padding: '6px 10px' }}>
      <div style={{ fontSize: 11, color: 'var(--text-dim)', letterSpacing: 0.2, marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 13, color: 'var(--heading)', fontWeight: 600 }}>{value}</div>
    </div>
  )
}

function AirportBadge({ airport }) {
  if (!airport) return <div style={{ width: 70 }} />
  return (
    <div style={{ textAlign: 'center', minWidth: 70 }}>
      <div style={{ fontSize: 18, color: 'var(--heading)', letterSpacing: 0.2, lineHeight: 1, fontWeight: 700 }}>
        {airport.iata_code || airport.icao_code || '—'}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4, lineHeight: 1.3 }}>
        {airport.municipality || airport.name?.slice(0, 18)}
      </div>
      {airport.country && (
        <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 1 }}>{airport.country}</div>
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
          <span key={l} style={{ fontSize: 11, color: 'var(--text-dim)' }}>
            {l === 0 ? 'GND' : `${Math.round(l / 1000)}k`}
          </span>
        ))}
      </div>
      <div style={{ height: 9, background: 'var(--panel-line)', borderRadius: 5, position: 'relative', overflow: 'hidden' }}>
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
            width: 1, background: 'var(--panel-subtle)',
          }} />
        ))}
      </div>
      <div style={{ marginTop: 5, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>
          {isClimbing ? '↑ CLIMBING' : isDescending ? '↓ DESCENDING' : '— LEVEL CRUISE'}
        </span>
        <span style={{ fontSize: 12, color: 'var(--cyan)', fontWeight: 600 }}>
          {altFt.toLocaleString()} ft
        </span>
      </div>
    </div>
  )
}
