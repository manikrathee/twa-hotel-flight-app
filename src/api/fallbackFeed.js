import { JFK_AIRSPACE_BBOX } from '../config/airspace'

const FEED_CONFIG = {
  url: (import.meta.env.VITE_FALLBACK_FEED_URL || '').trim(),
  provider: (import.meta.env.VITE_FALLBACK_FEED_PROVIDER || 'generic').trim().toLowerCase(),
  label: (import.meta.env.VITE_FALLBACK_FEED_LABEL || 'KJFK FALLBACK').trim(),
  timeoutMs: Number(import.meta.env.VITE_FALLBACK_FEED_TIMEOUT_MS || 14_000),
  fallbackToPrimaryIntervalMs: Number(import.meta.env.VITE_FALLBACK_PRIMARY_RETRY_MS || 45_000),
}

const FALLBACK_BBOX = JFK_AIRSPACE_BBOX
const MIN_TIMEOUT_MS = 2_000
const MAX_TIMEOUT_MS = 30_000
const MAX_ALTITUDE_M = 1_200_000
const MAX_SPEED_MS = 900

const PROVIDER_HANDLERS = new Set(['opensky', 'fr24', 'generic'])

function toNumber(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function toStringSafe(value) {
  if (value == null) return ''
  const next = String(value).trim()
  return next
}

function isLat(value) {
  const num = toNumber(value)
  return num != null && num >= -90 && num <= 90
}

function isLon(value) {
  const num = toNumber(value)
  return num != null && num >= -180 && num <= 180
}

function isAltitude(value) {
  const num = toNumber(value)
  return num != null && num >= 0 && num <= MAX_ALTITUDE_M
}

function isSpeed(value) {
  const num = toNumber(value)
  return num != null && num >= 0 && num <= MAX_SPEED_MS
}

function isHeading(value) {
  const num = toNumber(value)
  return num != null && num >= 0 && num <= 360
}

function normalizeFlight({
  icao24 = '',
  callsign = '',
  origin_country = null,
  time_position = null,
  last_contact = null,
  latitude = null,
  longitude = null,
  baro_altitude = null,
  on_ground = false,
  velocity = null,
  heading = null,
  vertical_rate = null,
  geo_altitude = null,
  squawk = null,
}) {
  const normalizedIcao = toStringSafe(icao24).toLowerCase()
  const lat = toNumber(latitude)
  const lon = toNumber(longitude)
  if (!normalizedIcao || !Number.isFinite(lat) || !Number.isFinite(lon)) return null

  return {
    icao24: normalizedIcao,
    callsign: toStringSafe(callsign),
    origin_country: toStringSafe(origin_country) || null,
    time_position: toNumber(time_position),
    last_contact: toNumber(last_contact),
    longitude: lon,
    latitude: lat,
    baro_altitude: toNumber(baro_altitude),
    on_ground: on_ground === true,
    velocity: toNumber(velocity),
    heading: toNumber(heading),
    vertical_rate: toNumber(vertical_rate),
    geo_altitude: toNumber(geo_altitude),
    squawk: toStringSafe(squawk) || null,
  }
}

function parseOpenSkyStates(raw) {
  if (!Array.isArray(raw?.states)) return []

  return raw.states
    .map(state => normalizeFlight({
      icao24: state[0],
      callsign: state[1],
      origin_country: state[2],
      time_position: state[3],
      last_contact: state[4],
      longitude: state[5],
      latitude: state[6],
      baro_altitude: state[7],
      on_ground: state[8],
      velocity: state[9],
      heading: state[10],
      vertical_rate: state[11],
      geo_altitude: state[13],
      squawk: state[14],
    }))
    .filter(Boolean)
}

function parseFr24ArrayRecord(raw) {
  if (!Array.isArray(raw) || raw.length < 2) return null

  // Prefer adjacent lat/lon pairs; fallback to first valid ordered pair.
  let lat = null
  let lon = null
  let latIndex = -1
  let lonIndex = -1
  for (let i = 0; i < raw.length - 1; i += 1) {
    if (isLat(raw[i]) && isLon(raw[i + 1])) {
      lat = Number(raw[i])
      lon = Number(raw[i + 1])
      latIndex = i
      lonIndex = i + 1
      break
    }
  }

  if (lat == null || lon == null) {
    for (let i = 0; i < raw.length; i += 1) {
      if (!isLat(raw[i])) continue
      for (let j = i + 1; j < raw.length; j += 1) {
        if (!isLon(raw[j])) continue
        lat = Number(raw[i])
        lon = Number(raw[j])
        latIndex = i
        lonIndex = j
        break
      }
      if (latIndex >= 0) break
    }
  }

  if (lat == null || lon == null || !Number.isFinite(lat) || !Number.isFinite(lon)) return null

  const scan = (start, matcher) => {
    for (let i = start; i < raw.length; i += 1) {
      const value = raw[i]
      if (matcher(value)) return Number(value)
    }
    return null
  }

  const altitude = scan(lonIndex + 2, isAltitude)
  const velocity = scan(lonIndex + 2, isSpeed)
  const heading = scan(lonIndex + 2, isHeading)
  const trackTime = scan(lonIndex + 2, value => Number.isFinite(Number(value)))
  const squawkRaw = toStringSafe(raw[lonIndex + 1] ?? '')

  return normalizeFlight({
    icao24: toStringSafe(raw[0]),
    callsign: toStringSafe(raw[1]),
    origin_country: null,
    time_position: trackTime,
    last_contact: trackTime,
    latitude: lat,
    longitude: lon,
    baro_altitude: altitude,
    on_ground: false,
    velocity,
    heading,
    squawk: /^[0-9]{4}$/.test(squawkRaw) ? squawkRaw : null,
  })
}

function parseFr24ObjectRecord(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null

  const squawkRaw = toStringSafe(raw.sq)
  return normalizeFlight({
    icao24: raw.hex || raw.icao24 || raw.icao || raw.id,
    callsign: raw.flight || raw.callsign,
    origin_country: raw.origin_country || raw.originCountry,
    time_position: raw.time_position ?? raw.timePosition,
    last_contact: raw.last_contact ?? raw.lastContact,
    latitude: raw.lat ?? raw.latitude,
    longitude: raw.lon ?? raw.longitude,
    baro_altitude: raw.altitude ?? raw.baro_altitude ?? raw.alt,
    on_ground: raw.on_ground || raw.onGround,
    velocity: raw.velocity ?? raw.speed,
    heading: raw.track ?? raw.heading,
    vertical_rate: raw.vRate || raw.verticalRate,
    geo_altitude: raw.geoAltitude ?? raw.ge_alt,
    squawk: /^[0-9]{4}$/.test(squawkRaw) ? squawkRaw : null,
  })
}

function parseFr24Response(raw) {
  const aircraft = raw?.aircraft
  if (!aircraft) return []

  const entries = Array.isArray(aircraft)
    ? aircraft
    : Object.values(aircraft || {})

  return entries
    .map((entry) => Array.isArray(entry) ? parseFr24ArrayRecord(entry) : parseFr24ObjectRecord(entry))
    .filter(Boolean)
}

function parseGenericResponse(raw) {
  if (Array.isArray(raw)) return raw.map(normalizeFlightRecordFromAny).filter(Boolean)
  if (Array.isArray(raw?.flights)) return raw.flights.map(normalizeFlightRecordFromAny).filter(Boolean)
  if (Array.isArray(raw?.aircraft)) return raw.aircraft.map(normalizeFlightRecordFromAny).filter(Boolean)
  if (raw && typeof raw === 'object' && !raw.states) return []
  return parseOpenSkyStates(raw)
}

function normalizeFlightRecordFromAny(record) {
  if (Array.isArray(record)) {
    return parseFr24ArrayRecord(record)
  }
  return parseFr24ObjectRecord(record)
}

function normalizeBounds(bounds = FALLBACK_BBOX) {
  if (!bounds) return FALLBACK_BBOX
  const {
    lamin,
    lomin,
    lamax,
    lomax,
  } = bounds

  const normalized = {
    lamin: Number(lamin),
    lomin: Number(lomin),
    lamax: Number(lamax),
    lomax: Number(lomax),
  }

  if (Object.values(normalized).some(value => !Number.isFinite(value))) {
    return FALLBACK_BBOX
  }

  return normalized
}

function applyBBoxQuery(url, provider, bounds = FALLBACK_BBOX) {
  const target = new URL(url, typeof window === 'undefined' ? 'http://localhost' : window.location.origin)
  const {
    lamin,
    lomin,
    lamax,
    lomax,
  } = normalizeBounds(bounds)

  const hasBboxQuery = target.searchParams.has('lamin') || target.searchParams.has('lomax') || target.searchParams.has('bounds')
  if (hasBboxQuery) return target

  if (provider === 'opensky') {
    target.searchParams.set('lamin', String(lamin))
    target.searchParams.set('lomin', String(lomin))
    target.searchParams.set('lamax', String(lamax))
    target.searchParams.set('lomax', String(lomax))
    return target
  }

  if (provider === 'fr24') {
    target.searchParams.set('bounds', `${lamin},${lomin},${lamax},${lomax}`)
    if (!target.searchParams.has('faa')) target.searchParams.set('faa', '1')
    if (!target.searchParams.has('mlat')) target.searchParams.set('mlat', '1')
    if (!target.searchParams.has('adsb')) target.searchParams.set('adsb', '1')
    if (!target.searchParams.has('flarm')) target.searchParams.set('flarm', '1')
    if (!target.searchParams.has('array')) target.searchParams.set('array', '1')
    return target
  }

  target.searchParams.set('lamin', String(lamin))
  target.searchParams.set('lomin', String(lomin))
  target.searchParams.set('lamax', String(lamax))
  target.searchParams.set('lomax', String(lomax))
  return target
}

export function isFallbackFeedEnabled() {
  const provider = FEED_CONFIG.provider
  return Boolean(FEED_CONFIG.url) && PROVIDER_HANDLERS.has(provider)
}

export function getFallbackFeedLabel() {
  return FEED_CONFIG.label || 'KJFK FALLBACK'
}

export function getFallbackFeedPrimaryRetryMs() {
  return Math.max(1_000, FEED_CONFIG.fallbackToPrimaryIntervalMs)
}

function buildFallbackUrl(bounds = FALLBACK_BBOX) {
  const provider = FEED_CONFIG.provider
  const url = FEED_CONFIG.url
  if (!url) throw new Error('Fallback feed is not configured')
  return applyBBoxQuery(url, provider, bounds).toString()
}

function parseFallbackResponse(raw) {
  const provider = FEED_CONFIG.provider

  if (provider === 'opensky') return parseOpenSkyStates(raw)
  if (provider === 'fr24') return parseFr24Response(raw)
  return parseGenericResponse(raw)
}

export async function fetchFallbackFlights(bounds = FALLBACK_BBOX) {
  if (!isFallbackFeedEnabled()) {
    throw new Error('Fallback feed not configured')
  }

  const timeoutMs = Number.isFinite(FEED_CONFIG.timeoutMs)
    ? Math.min(Math.max(FEED_CONFIG.timeoutMs, MIN_TIMEOUT_MS), MAX_TIMEOUT_MS)
    : 14_000
  const url = buildFallbackUrl(bounds)

  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
  if (!res.ok) throw new Error(`Fallback feed ${res.status}`)

  const raw = await res.json()
  return parseFallbackResponse(raw)
}
