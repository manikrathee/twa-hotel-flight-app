const BASE = '/api/adsbdb/v0'
const TIMEOUT_MS = 6000

async function fetchJson(url, signal) {
  const timeout = AbortSignal.timeout(TIMEOUT_MS)
  const fetchSignal = signal ? AbortSignal.any([signal, timeout]) : timeout
  const res = await fetch(url, { signal: fetchSignal })
  if (!res.ok) return null
  return res.json()
}

function isAbort(error) {
  return error?.name === 'AbortError' || error?.name === 'TimeoutError'
}

export async function fetchCallsignRoute(callsign, signal) {
  if (!callsign) return null
  try {
    const data = await fetchJson(`${BASE}/callsign/${callsign.trim()}`, signal)
    return data?.response?.flightroute ?? null
  } catch (error) {
    if (isAbort(error)) return null
    return null
  }
}

export async function fetchAircraftInfo(icao24, signal) {
  if (!icao24) return null
  try {
    const data = await fetchJson(`${BASE}/aircraft/${icao24.toLowerCase()}`, signal)
    return data?.response?.aircraft ?? null
  } catch (error) {
    if (isAbort(error)) return null
    return null
  }
}
