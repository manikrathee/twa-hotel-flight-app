const DEFAULT_BUCKET = 'default'
const bucketState = new Map()

function createState() {
  return {
    consecutiveErrors: 0,
    lastErrorAt: null,
    backoffUntil: null,
    lastBackoffMs: 0,
  }
}

function getBucketState(bucket = DEFAULT_BUCKET) {
  const key = bucket || DEFAULT_BUCKET
  let state = bucketState.get(key)
  if (!state) {
    state = createState()
    bucketState.set(key, state)
  }
  return state
}

const HEADER_BACKOFF_CAP_MS = 5 * 60 * 1000

export function recordSuccess(bucket = DEFAULT_BUCKET) {
  const state = getBucketState(bucket)
  state.consecutiveErrors = 0
  state.lastBackoffMs = 0
  state.backoffUntil = null
  state.lastErrorAt = null
}

// retryAfterSeconds: value of X-Rate-Limit-Retry-After-Seconds header, or null
export function record429(retryAfterSeconds = null, bucket = DEFAULT_BUCKET) {
  const state = getBucketState(bucket)
  state.consecutiveErrors++
  state.lastErrorAt = Date.now()

  let backoffMs
  if (retryAfterSeconds && retryAfterSeconds > 0) {
    backoffMs = Math.min(retryAfterSeconds * 1000, HEADER_BACKOFF_CAP_MS)
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

export function isBlocked(bucket = DEFAULT_BUCKET) {
  const state = getBucketState(bucket)
  return state.backoffUntil != null && Date.now() < state.backoffUntil
}

export function backoffRemainingMs(bucket = DEFAULT_BUCKET) {
  const state = getBucketState(bucket)
  if (!isBlocked(bucket)) return 0
  return Math.max(0, state.backoffUntil - Date.now())
}

export function getState(bucket = DEFAULT_BUCKET) {
  return { ...getBucketState(bucket) }
}

export function resetRateLimitState(bucket = null) {
  if (bucket == null) {
    bucketState.clear()
    return
  }
  bucketState.delete(bucket || DEFAULT_BUCKET)
}
