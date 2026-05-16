import { record429, recordSuccess } from './rateLimitManager'

const BASE = '/api/opensky'

export const JFK = { lat: 40.6413, lon: -73.7781 }

// Bounding box around JFK: roughly 60km radius
const BBOX = { lamin: 40.35, lomin: -74.35, lamax: 40.95, lomax: -73.15 }

function parseStates(states) {
  if (!Array.isArray(states)) return []
  return states.map(s => ({
    icao24: s[0],
    callsign: (s[1] || '').trim(),
    origin_country: s[2],
    time_position: s[3],
    last_contact: s[4],
    longitude: s[5],
    latitude: s[6],
    baro_altitude: s[7],
    on_ground: s[8],
    velocity: s[9],        // m/s
    heading: s[10],        // degrees from north
    vertical_rate: s[11],  // m/s
    geo_altitude: s[13],
    squawk: s[14],
  }))
}

export async function fetchFlights() {
  const { lamin, lomin, lamax, lomax } = BBOX
  const res = await fetch(
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
  recordSuccess()
  const data = await res.json()
  return parseStates(data.states || [])
}

export async function fetchTrack(icao24, signal) {
  const res = await fetch(
    `${BASE}/tracks/all?icao24=${icao24.toLowerCase()}&time=0`,
    { signal: signal ?? AbortSignal.timeout(10000) }
  )
  if (!res.ok) return null
  return res.json()
}

export async function fetchAircraftMeta(icao24, signal) {
  const res = await fetch(
    `${BASE}/metadata/aircraft/icao/${icao24.toLowerCase()}`,
    { signal: signal ?? AbortSignal.timeout(8000) }
  )
  if (!res.ok) return null
  return res.json()
}
