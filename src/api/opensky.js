import { record429, recordSuccess } from './rateLimitManager'
import { getAccessToken, invalidateToken } from './openskyAuth'
import { JFK_ONE_MILE_BBOX } from '../config/airspace'

const BASE = '/api/opensky'

const BBOX = JFK_ONE_MILE_BBOX

function parseStates(states) {
  if (!Array.isArray(states)) return []
  return states.map(s => ({
    icao24:         s[0],
    callsign:      (s[1] || '').trim(),
    origin_country: s[2],
    time_position:  s[3],
    last_contact:   s[4],
    longitude:      s[5],
    latitude:       s[6],
    baro_altitude:  s[7],
    on_ground:      s[8],
    velocity:       s[9],        // m/s
    heading:        s[10],        // degrees from north
    vertical_rate:  s[11],  // m/s
    geo_altitude:   s[13],
    squawk:         s[14],
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

export async function fetchFlights() {
  const { lamin, lomin, lamax, lomax } = BBOX
  const res = await apiFetch(
    `${BASE}/states/all?lamin=${lamin}&lomin=${lomin}&lamax=${lamax}&lomax=${lomax}`,
    { signal: AbortSignal.timeout(12000) }
  )
  if (!res.ok) {
    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get('X-Rate-Limit-Retry-After-Seconds') || '0', 10) || null
      record429(retryAfter)
    }
    throw new Error(`OpenSky ${res.status}`)
  }
  const data = await res.json()
  recordSuccess()
  return parseStates(data.states || [])
}

// Returns { flights, cachedAt } from the static DB-backed cache file.
// The file is written by scripts/fetch-flights.js and served by Vite as a static asset.
export async function fetchCachedFlights() {
  const res = await fetch('/flights-cache.json', {
    cache: 'no-store',
    signal: AbortSignal.timeout(4000),
  })
  if (!res.ok) return null
  const data = await res.json()
  if (!data?.flights?.length) return null
  return {
    flights: data.flights,
    cachedAt: new Date(data.fetchedAt),
    cacheSource: data.source, // 'live' | 'mock'
  }
}

export async function fetchTrack(icao24, signal) {
  const res = await apiFetch(
    `${BASE}/tracks/all?icao24=${icao24.toLowerCase()}&time=0`,
    { signal: signal ?? AbortSignal.timeout(10000) }
  )
  if (res.status === 429) {
    const retryAfter = parseInt(res.headers.get('X-Rate-Limit-Retry-After-Seconds') || '0', 10) || null
    record429(retryAfter)
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
    record429(retryAfter)
    return null
  }
  if (!res.ok) return null
  return res.json()
}
