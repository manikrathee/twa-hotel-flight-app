const BASE = '/api/adsbdb/v0'

export async function fetchCallsignRoute(callsign) {
  if (!callsign) return null
  try {
    const res = await fetch(`${BASE}/callsign/${callsign.trim()}`, {
      signal: AbortSignal.timeout(6000)
    })
    if (!res.ok) return null
    const data = await res.json()
    return data?.response?.flightroute ?? null
  } catch {
    return null
  }
}

export async function fetchAircraftInfo(icao24) {
  if (!icao24) return null
  try {
    const res = await fetch(`${BASE}/aircraft/${icao24.toLowerCase()}`, {
      signal: AbortSignal.timeout(6000)
    })
    if (!res.ok) return null
    const data = await res.json()
    return data?.response?.aircraft ?? null
  } catch {
    return null
  }
}
