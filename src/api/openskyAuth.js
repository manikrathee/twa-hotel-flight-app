const TOKEN_URL = '/api/opensky-auth'
const REFRESH_BUFFER_MS = 60_000
const AUTH_RETRY_MS = 60_000
const AUTH_ENABLED = import.meta.env.VITE_OPENSKY_AUTH_ENABLED === 'true'

let cachedToken = null
let expiresAt = 0
let inflightPromise = null
let authRetryAfter = 0

function markAuthUnavailable() {
  cachedToken = null
  expiresAt = 0
  authRetryAfter = Date.now() + AUTH_RETRY_MS
}

async function fetchToken() {
  try {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      signal: AbortSignal.timeout(10000),
    })

    if (res.status === 404 || res.status === 405 || res.status === 503) {
      markAuthUnavailable()
      return null
    }

    if (!res.ok) {
      markAuthUnavailable()
      return null
    }

    const { access_token, expires_in } = await res.json()
    if (!access_token || !expires_in) {
      markAuthUnavailable()
      return null
    }

    cachedToken = access_token
    expiresAt = Date.now() + expires_in * 1000
    authRetryAfter = 0
    return access_token
  } catch {
    markAuthUnavailable()
    return null
  }
}

export async function getAccessToken() {
  if (!AUTH_ENABLED) return null
  if (cachedToken && Date.now() < expiresAt - REFRESH_BUFFER_MS) return cachedToken
  if (Date.now() < authRetryAfter) return null
  if (!inflightPromise) inflightPromise = fetchToken().finally(() => { inflightPromise = null })
  return inflightPromise
}

export function invalidateToken() {
  cachedToken = null
  expiresAt = 0
  authRetryAfter = 0
}
