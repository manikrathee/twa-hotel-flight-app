const state = {
  consecutiveErrors: 0,
  lastErrorAt: null,
  backoffUntil: null,
  lastBackoffMs: 0,
}

export function recordSuccess() {
  state.consecutiveErrors = 0
  state.lastBackoffMs = 0
  state.backoffUntil = null
  state.lastErrorAt = null
}

// retryAfterSeconds: value of X-Rate-Limit-Retry-After-Seconds header, or null
export function record429(retryAfterSeconds = null) {
  state.consecutiveErrors++
  state.lastErrorAt = Date.now()

  let backoffMs
  if (retryAfterSeconds && retryAfterSeconds > 0) {
    backoffMs = retryAfterSeconds * 1000
  } else {
    // Decorrelated jitter: next = min(cap, random(base, prev * 3))
    const BASE = 30_000
    const CAP = 300_000
    const prev = state.lastBackoffMs || BASE
    backoffMs = Math.min(CAP, BASE + Math.random() * (prev * 3 - BASE))
  }

  state.lastBackoffMs = backoffMs
  state.backoffUntil = Date.now() + backoffMs
}

export function isBlocked() {
  return state.backoffUntil != null && Date.now() < state.backoffUntil
}

export function backoffRemainingMs() {
  if (!isBlocked()) return 0
  return Math.max(0, state.backoffUntil - Date.now())
}

export function getState() {
  return { ...state }
}
