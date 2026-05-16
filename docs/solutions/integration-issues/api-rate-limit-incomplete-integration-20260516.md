---
name: api-rate-limit-incomplete-integration
description: Rate limit manager must be wired to ALL fetch functions, not just the primary one — secondary endpoints triggering 429 silently bypass backoff if not integrated
metadata:
  type: integration-issue
  component: opensky-api
  date: 2026-05-16
---

# API Rate Limit Incomplete Integration

## Symptom

After adding a rate limit manager, the app continues polling at full speed even after receiving a `429 Too Many Requests` response. Backoff never activates despite the manager being present.

## Root Cause

Only the primary fetch function (`fetchFlights`) was wired to the rate limit manager. Secondary functions (`fetchTrack`, `fetchAircraftMeta`) silently returned `null` on `429` and never called `record429()` or `recordSuccess()`. A `429` from any of these endpoints left the manager's state completely unchanged.

---

## Bug 1: Secondary Endpoints Not Integrated

### Before

```js
// fetchFlights — correctly wired
export async function fetchFlights() {
  const res = await fetch(...)
  if (res.status === 429) {
    record429(retryAfter)  // ✓
  }
  const data = await res.json()
  recordSuccess()          // ✓
  return parseStates(data.states || [])
}

// fetchTrack — completely unwired
export async function fetchTrack(icao24, signal) {
  const res = await fetch(...)
  if (!res.ok) return null  // ✗ 429 silently swallowed
  return res.json()
  // ✗ no recordSuccess()
}

// fetchAircraftMeta — same problem
export async function fetchAircraftMeta(icao24) {
  const res = await fetch(...)
  if (!res.ok) return null  // ✗ same
  return res.json()
}
```

### After

```js
export async function fetchTrack(icao24, signal) {
  const res = await fetch(...)
  if (res.status === 429) {
    const retryAfter = parseInt(res.headers.get('X-Rate-Limit-Retry-After-Seconds') || '0', 10) || null
    record429(retryAfter)
    return null
  }
  if (!res.ok) return null
  const data = await res.json()
  recordSuccess()
  return data
}

// Same pattern applied to fetchAircraftMeta
```

---

## Bug 2: `recordSuccess()` Called Before JSON Parse

### Before

```js
// In fetchFlights
recordSuccess()               // ✗ called first
const data = await res.json() // if this throws, success was already recorded
```

If `res.json()` threw (malformed response, truncated body), the rate limit state was reset as if the call had fully succeeded. This could suppress backoff after a bad response.

### After

```js
const data = await res.json() // parse first
recordSuccess()               // ✓ only called after full success
```

---

## Checklist: Wiring a Rate Limit Manager

When adding a rate limit manager to any fetch module, audit **every** fetch function:

- [ ] Does it call `record429(retryAfter)` when `res.status === 429`?
- [ ] Does it parse `Retry-After` (or equivalent) from the response headers?
- [ ] Does it call `recordSuccess()` only **after** a successful JSON parse?
- [ ] Does it return early (not fall through to `recordSuccess`) on non-OK responses?

---

## How This Was Found

Sub-agent code review checked every exit path in `opensky.js` for calls to `record429` and `recordSuccess`. Two functions were completely unwired and the ordering bug in `fetchFlights` was caught in the same pass.

---

## Prevention

Treat rate limit instrumentation the same as logging or error handling: it must cover every function that touches the API, not just the entry point. When reviewing a new integration, grep the module for all `fetch(` calls and verify each one is wired before merging.
