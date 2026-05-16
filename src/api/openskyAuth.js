const TOKEN_URL = '/api/opensky-auth'
const REFRESH_BUFFER_MS = 60_000

let cachedToken = null
let expiresAt = 0
let inflightPromise = null

async function fetchToken() {
  const params = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: import.meta.env.VITE_OPENSKY_CLIENT_ID,
    client_secret: import.meta.env.VITE_OPENSKY_CLIENT_SECRET,
  })
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) throw new Error(`OpenSky auth ${res.status}`)
  const { access_token, expires_in } = await res.json()
  cachedToken = access_token
  expiresAt = Date.now() + expires_in * 1000
  return access_token
}

export async function getAccessToken() {
  if (!import.meta.env.VITE_OPENSKY_CLIENT_ID) return null
  if (cachedToken && Date.now() < expiresAt - REFRESH_BUFFER_MS) return cachedToken
  if (!inflightPromise) inflightPromise = fetchToken().finally(() => { inflightPromise = null })
  return inflightPromise
}

export function invalidateToken() {
  cachedToken = null
  expiresAt = 0
}
