import { record429, recordSuccess } from './rateLimitManager'
import { getAccessToken, invalidateToken } from './openskyAuth'
import { JFK_AIRSPACE_BBOX } from '../config/airspace'

const DEMO_FLIGHTS = []
const FEED_RATE_LIMIT_BUCKET = 'feed'
const DETAIL_RATE_LIMIT_BUCKET = 'detail'

const BASE = '/api/opensky'
const CACHED_FLIGHT_FILE_TTL_MS = 60 * 1000
let cachedFlightFile = null
let cachedFlightFilePromise = null
let flightCacheAtMs = 0

const FALLBACK_BBOX = JFK_AIRSPACE_BBOX

function normalizeBBox(bounds = FALLBACK_BBOX) {
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

function isFlightFileFresh() {
  return cachedFlightFile && (Date.now() - flightCacheAtMs) <= CACHED_FLIGHT_FILE_TTL_MS
}

function normalizeText(value) {
  return String(value ?? '').trim()
}

function normalizeNumber(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function parseStates(states) {
  if (!Array.isArray(states)) return []
  return states.map(s => ({
    icao24: normalizeText(s[0]),
    callsign: normalizeText(s[1]),
    origin_country: normalizeText(s[2]),
    time_position: normalizeNumber(s[3]),
    last_contact: normalizeNumber(s[4]),
    longitude: normalizeNumber(s[5]),
    latitude: normalizeNumber(s[6]),
    baro_altitude: normalizeNumber(s[7]),
    on_ground: Boolean(s[8]),
    velocity: normalizeNumber(s[9]),        // m/s
    heading: normalizeNumber(s[10]),        // degrees from north
    vertical_rate: normalizeNumber(s[11]),  // m/s
    geo_altitude: normalizeNumber(s[13]),
    squawk: normalizeText(s[14]),
    spi: Boolean(s[15]),
    position_source: normalizeNumber(s[16]),
    category: normalizeNumber(s[17]),
  }))
}

async function authHeaders() {
  const token = await getAccessToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function apiFetch(url, options = {}, retry = true) {
  const headers = { ...await authHeaders(), ...options.headers }
  const res = await fetch(url, { ...options, headers })
  if (res.status === 401 && retry) {
    invalidateToken()
    return apiFetch(url, options, false)
  }
  return res
}

export async function fetchFlights(bounds = FALLBACK_BBOX) {
  const {
    lamin,
    lomin,
    lamax,
    lomax,
  } = normalizeBBox(bounds)
  const res = await apiFetch(
    `${BASE}/states/all?lamin=${lamin}&lomin=${lomin}&lamax=${lamax}&lomax=${lomax}`,
    { signal: AbortSignal.timeout(12000) }
  )
  if (!res.ok) {
    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get('X-Rate-Limit-Retry-After-Seconds') || '0', 10) || null
      record429(retryAfter, FEED_RATE_LIMIT_BUCKET)
    }
    throw new Error(`OpenSky ${res.status}`)
  }
  const data = await res.json()
  recordSuccess(FEED_RATE_LIMIT_BUCKET)
  return parseStates(data.states || [])
}

// Returns { flights, cachedAt } from the static DB-backed cache file.
// The file is written by scripts/fetch-flights.js and served by Vite as a static asset.
export async function fetchCachedFlights() {
  try {
    if (isFlightFileFresh()) return cachedFlightFile

    if (cachedFlightFilePromise) return cachedFlightFilePromise

    const request = (async () => {
      const res = await fetch('/flights-cache.json', {
        cache: 'no-store',
        signal: AbortSignal.timeout(4000),
      })
      if (!res.ok) {
        cachedFlightFile = {
          flights: DEMO_FLIGHTS.map(f => ({ ...f })),
          cachedAt: new Date(),
          cacheSource: 'mock',
        }
        flightCacheAtMs = Date.now()
        return cachedFlightFile
      }

      const data = await res.json()
      if (!data?.flights?.length) {
        cachedFlightFile = null
        flightCacheAtMs = Date.now()
        return null
      }

      cachedFlightFile = {
        flights: data.flights,
        cachedAt: new Date(data.fetchedAt),
        cacheSource: data.source, // 'live' | 'mock'
      }
      flightCacheAtMs = Date.now()
      return cachedFlightFile
    })()

    cachedFlightFilePromise = request
    const out = await request.finally(() => { cachedFlightFilePromise = null })
    return out
  } catch {
    if (!cachedFlightFile) {
      cachedFlightFile = {
        flights: DEMO_FLIGHTS.map(f => ({ ...f })),
        cachedAt: new Date(),
        cacheSource: 'mock',
      }
      flightCacheAtMs = Date.now()
    }
    return cachedFlightFile
  }
}

export async function invalidateCachedFlights() {
  cachedFlightFile = null
  flightCacheAtMs = 0
  cachedFlightFilePromise = null
}

export async function fetchTrack(icao24, signal) {
  const res = await apiFetch(
    `${BASE}/tracks/all?icao24=${icao24.toLowerCase()}&time=0`,
    { signal: signal ?? AbortSignal.timeout(10000) }
  )
  if (res.status === 429) {
    const retryAfter = parseInt(res.headers.get('X-Rate-Limit-Retry-After-Seconds') || '0', 10) || null
    record429(retryAfter, DETAIL_RATE_LIMIT_BUCKET)
    return null
  }
  if (!res.ok) return null
  return res.json()
}

export async function fetchAircraftMeta(icao24, signal) {
  const res = await apiFetch(
    `${BASE}/metadata/aircraft/icao/${icao24.toLowerCase()}`,
    { signal: signal ?? AbortSignal.timeout(8000) }
  )
  if (res.status === 429) {
    const retryAfter = parseInt(res.headers.get('X-Rate-Limit-Retry-After-Seconds') || '0', 10) || null
    record429(retryAfter, DETAIL_RATE_LIMIT_BUCKET)
    return null
  }
  if (!res.ok) return null
  return res.json()
}
