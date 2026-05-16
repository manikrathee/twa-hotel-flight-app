# feat: OpenSky Rate Limit Monitor, Smart Caching & Performance

## Overview

The app currently hammers the OpenSky free-tier API with a fixed 15-second poll interval and re-fetches track history every time a flight is selected. This burns through the 400 free API credits/day rapidly — as seen in production (persistent 429 errors). This feature adds a rate-limit-aware request layer, an in-memory + sessionStorage cache for flight tracks and aircraft metadata, adaptive polling, and a suite of React/MapLibre performance improvements to keep the UI fast even when the API is throttled.

## Problem Statement

**Current behavior:**
- `useFlights.js:5` — fixed `POLL_MS = 15000`, polls unconditionally every 15 s regardless of rate limit status
- `opensky.js:30–36` — `fetchFlights()` throws `Error('OpenSky 429')` on rate limit, no backoff, no retry with delay
- `useFlightDetail.js:27–30` — every time a flight is selected, `fetchTrack()` fires again even if the same flight was selected 2 minutes ago — no cache
- `useFlightDetail.js:27–30` — `fetchAircraftInfo()` via ADSBDB also re-fetches on every re-selection, despite aircraft data being static
- `NearbyList.jsx:58` — maps over up to 60 `FlightRow` items on every poll cycle, no memoization
- No HUD indicator showing API health status to the user

**Impact:**
- 15 s × 4 requests/min × 60 min = 240 `states/all` credits/day on position data alone
- Each `fetchTrack()` is an additional credit; selecting 5+ flights exhausts free tier by mid-afternoon
- When 429 hits, app shows error state and map goes blank — terrible UX
- 60 FlightRow re-renders every 15 s even for unchanged entries

## Proposed Solution

Three layered improvements:

1. **Rate Limit Layer** — a `useApiRateLimit` hook + `ApiStatusIndicator` component that tracks request budget, detects 429s, and exposes state to drive adaptive polling
2. **Smart Cache Layer** — an in-memory `Map` (via `useRef`) + sessionStorage persistence for track and aircraft metadata; stale-while-revalidate for position data
3. **Performance Layer** — memoized flight rows, deferred list updates with `useDeferredValue`, batched MapLibre `setData()` via `requestAnimationFrame`, and AbortController cleanup

## Technical Approach

### Architecture

```
src/
  api/
    opensky.js          ← add rate limit tracking + backoff logic
    rateLimitManager.js ← NEW: singleton tracking credits, 429 timestamps
  hooks/
    useFlights.js       ← adaptive poll interval from rateLimitManager
    useFlightDetail.js  ← cache-first fetching for track + aircraftInfo
    useRateLimit.js     ← NEW: exposes rate limit state to UI
  cache/
    flightCache.js      ← NEW: in-memory + sessionStorage cache manager
  components/
    HUDBar.jsx          ← add ApiStatusIndicator slot
    ApiStatusIndicator.jsx ← NEW: cyan/amber/red dot with tooltip
    NearbyList.jsx      ← memoized FlightRow
```

### Implementation Phases

#### Phase 1: Rate Limit Manager (`rateLimitManager.js`)

A module-level singleton (not React state) so all hooks share one budget tracker. Reads the `X-Rate-Limit-Retry-After-Seconds` header from OpenSky 429 responses for precise backoff duration; falls back to decorrelated jitter if header is absent.

```js
// src/api/rateLimitManager.js
const state = {
  consecutiveErrors: 0,
  lastErrorAt: null,       // timestamp of last 429
  backoffUntil: null,      // ms epoch until which requests are paused
  lastBackoffMs: 0,        // previous backoff duration for jitter calc
}

export function recordSuccess() {
  state.consecutiveErrors = 0
  state.lastBackoffMs = 0
}

// retryAfterSeconds: parsed from X-Rate-Limit-Retry-After-Seconds header, or null
export function record429(retryAfterSeconds = null) {
  state.consecutiveErrors++
  state.lastErrorAt = Date.now()
  let backoffMs
  if (retryAfterSeconds) {
    backoffMs = retryAfterSeconds * 1000
  } else {
    // Decorrelated jitter: next = min(cap, random(base, prev*3))
    const base = 30_000, cap = 300_000
    const prev = state.lastBackoffMs || base
    backoffMs = Math.min(cap, base + Math.random() * (prev * 3 - base))
  }
  state.lastBackoffMs = backoffMs
  state.backoffUntil = Date.now() + backoffMs
}

export function isBlocked() {
  return state.backoffUntil != null && Date.now() < state.backoffUntil
}

export function backoffRemainingMs() {
  if (!isBlocked()) return 0
  return state.backoffUntil - Date.now()
}

export function getState() { return { ...state } }
```

**Deliverables:**
- `src/api/rateLimitManager.js`
- Unit-testable pure functions — no React imports
- `opensky.js:fetchFlights()` updated to parse `X-Rate-Limit-Retry-After-Seconds` and pass to `record429()`

#### Phase 2: Adaptive Polling (`useFlights.js` refactor)

```js
// src/hooks/useFlights.js — key changes
const BASE_POLL_MS = 15_000
const BACKOFF_POLL_MS = 60_000   // poll slower during backoff
const STALE_SHOW_MS  = 90_000   // show stale data badge after 90 s

// Inside load():
if (isBlocked()) return  // skip this tick, don't clear flights

// On 429:
if (e.message.includes('429')) {
  record429()
  setRateLimitStatus('blocked')
} else {
  setError(e.message)
}

// Adaptive interval: use setInterval with dynamic delay via setTimeout chain
```

**Deliverables:**
- Updated `src/hooks/useFlights.js`
- `rateLimitStatus` exported: `'ok' | 'slow' | 'blocked'`
- Stale data timestamp shown in HUDBar when > 90 s old

#### Phase 3: Flight Cache (`flightCache.js`)

```js
// src/cache/flightCache.js
const SESSION_KEY = 'twa_flight_cache'
const TTL_TRACK_MS   = 5 * 60 * 1000   // track data: 5 min TTL
const TTL_AIRCRAFT_MS = 24 * 60 * 60 * 1000  // aircraft meta: 24 hr TTL

class FlightCache {
  constructor() {
    this._mem = new Map()
    this._loadFromSession()
  }

  getTrack(icao24) { return this._get(`track:${icao24}`, TTL_TRACK_MS) }
  setTrack(icao24, data) { this._set(`track:${icao24}`, data, TTL_TRACK_MS) }

  getAircraft(icao24) { return this._get(`ac:${icao24}`, TTL_AIRCRAFT_MS) }
  setAircraft(icao24, data) { this._set(`ac:${icao24}`, data, TTL_AIRCRAFT_MS) }

  _get(key, ttl) {
    const entry = this._mem.get(key)
    if (!entry) return null
    if (Date.now() - entry.ts > ttl) { this._mem.delete(key); return null }
    return entry.data
  }

  _set(key, data, ttl) {
    this._mem.set(key, { data, ts: Date.now() })
    this._persistToSession()
  }

  _persistToSession() {
    try {
      const obj = {}
      for (const [k, v] of this._mem) obj[k] = v
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(obj))
    } catch {}   // ignore QuotaExceededError
  }

  _loadFromSession() {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY)
      if (!raw) return
      const obj = JSON.parse(raw)
      for (const [k, v] of Object.entries(obj)) this._mem.set(k, v)
    } catch {}
  }
}

export const flightCache = new FlightCache()
```

**Deliverables:**
- `src/cache/flightCache.js`
- TTL constants tuned to OpenSky data staleness characteristics
- Silent sessionStorage failure (QuotaExceededError is non-fatal)

#### Phase 4: Cache-First `useFlightDetail`

```js
// src/hooks/useFlightDetail.js — cache-first pattern
import { flightCache } from '../cache/flightCache'

useEffect(() => {
  // 1. Serve from cache immediately (no loading flicker)
  const cachedTrack = flightCache.getTrack(flight.icao24)
  const cachedAircraft = flightCache.getAircraft(flight.icao24)
  if (cachedTrack) setTrack(cachedTrack)
  if (cachedAircraft) setAircraftInfo(cachedAircraft)
  if (cachedTrack && cachedAircraft) { setLoading(false); return }

  // 2. Fetch only what's missing
  setLoading(true)
  const needed = []
  if (!cachedTrack) needed.push(
    fetchTrack(flight.icao24).then(d => { flightCache.setTrack(flight.icao24, d); setTrack(d) })
  )
  if (!cachedAircraft) needed.push(
    fetchAircraftInfo(flight.icao24).then(d => { flightCache.setAircraft(flight.icao24, d); setAircraftInfo(d) })
  )
  Promise.allSettled(needed).finally(() => setLoading(false))
}, [flight?.icao24])
```

**Deliverables:**
- Updated `src/hooks/useFlightDetail.js`
- Zero extra OpenSky calls for previously-viewed flights in same session
- Aircraft metadata persists across page refresh (sessionStorage TTL 24 hr)

#### Phase 5: `ApiStatusIndicator` Component

```jsx
// src/components/ApiStatusIndicator.jsx
// Shows in HUDBar between LIVE dot and AIRCRAFT count
// Status: ok (teal) | slow (amber, backoff countdown) | blocked (red, seconds until retry)
export default function ApiStatusIndicator({ status, backoffUntil }) {
  const [remaining, setRemaining] = useState(0)
  useEffect(() => {
    if (status !== 'blocked') return
    const id = setInterval(() => {
      setRemaining(Math.max(0, Math.ceil((backoffUntil - Date.now()) / 1000)))
    }, 1000)
    return () => clearInterval(id)
  }, [status, backoffUntil])

  if (status === 'ok') return null  // silent when healthy

  const color = status === 'blocked' ? 'var(--red)' : 'var(--amber)'
  const label = status === 'blocked'
    ? `API HOLD ${remaining}s`
    : 'API SLOW'

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginRight: 16 }}>
      <div style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
      <span style={{ fontFamily: 'var(--font-display)', fontSize: 9, color, letterSpacing: 2 }}>
        {label}
      </span>
    </div>
  )
}
```

**Deliverables:**
- `src/components/ApiStatusIndicator.jsx`
- Updated `src/components/HUDBar.jsx` to accept and render `rateLimitStatus`
- Updated `src/App.jsx` to pass `rateLimitStatus` down

#### Phase 6: React Performance (NearbyList + MapLibre)

**NearbyList memoization:**
```jsx
// src/components/NearbyList.jsx
import { memo, useDeferredValue } from 'react'

export default function NearbyList({ flights, selectedId, onSelect }) {
  const deferredFlights = useDeferredValue(flights)  // non-blocking update
  // ...
}

const FlightRow = memo(function FlightRow({ flight, selected, onSelect }) {
  // ... existing JSX unchanged
}, (prev, next) =>
  prev.flight.icao24 === next.flight.icao24 &&
  prev.flight.latitude === next.flight.latitude &&
  prev.flight.longitude === next.flight.longitude &&
  prev.flight.baro_altitude === next.flight.baro_altitude &&
  prev.selected === next.selected
)
```

**MapLibre `updateData()` for incremental position updates:**

Research confirms `source.updateData(diff)` is significantly faster than `setData()` for position ticks — only updates changed features using feature IDs rather than re-parsing the full FeatureCollection. Requires `promoteId: 'icao24'` on the source definition.

```js
// src/components/FlightMap.jsx — initial load uses setData, subsequent polls use updateData
// Source definition change:
map.addSource('planes', {
  type: 'geojson',
  promoteId: 'icao24',   // ← enables updateData() feature ID tracking
  data: { type: 'FeatureCollection', features: [] },
})

// On poll update (after first render):
const prevIcaos = prevFeaturesRef.current
const features = buildFeatures(flights, selectedFlight)
if (!isFirstRender) {
  src.updateData({
    update: features.map(f => ({ id: f.properties.icao24, newGeometry: f.geometry, newProperties: f.properties })),
    remove: prevIcaos.filter(id => !flights.find(f => f.icao24 === id)),
    add: features.filter(f => !prevIcaos.includes(f.properties.icao24)),
  })
} else {
  src.setData({ type: 'FeatureCollection', features })
}
prevFeaturesRef.current = features.map(f => f.properties.icao24)
```

**Tab visibility polling pause:**
```js
// src/hooks/useFlights.js — pause when tab hidden
useEffect(() => {
  const onVisibility = () => {
    if (document.visibilityState === 'visible') load()  // immediate refresh on return
  }
  document.addEventListener('visibilitychange', onVisibility)
  return () => document.removeEventListener('visibilitychange', onVisibility)
}, [])
```

**Deliverables:**
- `memo()` + custom comparator on `FlightRow`
- `useDeferredValue` on flights list in `NearbyList`
- MapLibre `updateData()` for position polls, `setData()` only on initial load
- Tab visibility pausing in `useFlights`
- Fixed AbortController cleanup in `useFlightDetail` — `controllers` array at line 24 currently never populated; refactor to use a single `AbortController` per `loadAll()` call

## Alternative Approaches Considered

| Approach | Reason Rejected |
|---|---|
| Service Worker caching | Adds build complexity; sessionStorage is sufficient for single-tab app |
| SWR / React Query | Overkill for 3 endpoints; adds ~15 KB bundle; manual logic is simpler here |
| IndexedDB for track cache | sessionStorage is enough for session-scoped track data; IDB async API adds complexity |
| WebSocket to OpenSky | Not available on free tier; REST polling is the only option |
| Virtual list (react-window) | 60 items doesn't justify a virtualizer; `memo` + `useDeferredValue` is sufficient |

## Acceptance Criteria

### Functional Requirements

- [ ] App does not re-fetch track data for a flight that was selected in the same session (cache hit verified in Network tab)
- [ ] App does not re-fetch aircraft metadata for a flight whose ICAO24 was seen in the same session (24-hr sessionStorage TTL)
- [ ] On 429 response, poll interval backs off exponentially (30s → 60s → 120s → 240s, cap 300s)
- [ ] Existing flights remain visible on map during backoff (stale data, not blank screen)
- [ ] HUDBar shows amber "API SLOW" or red "API HOLD Xs" indicator during non-ok status
- [ ] Indicator disappears automatically when backoff clears and next successful poll completes
- [ ] Stale data badge (e.g. "Updated 2m ago") appears in HUDBar after 90 seconds without fresh data

### Non-Functional Requirements

- [ ] Selecting a previously-viewed flight opens detail panel with zero network requests (cache hit)
- [ ] NearbyList re-render time stays under 16ms for 60-item list on poll cycle (React DevTools Profiler)
- [ ] No memory leak: cache Map does not grow unboundedly (TTL eviction clears stale entries)
- [ ] sessionStorage key `twa_flight_cache` stays under 500 KB (track JSON is ~20 KB each; 24 tracks fits)
- [ ] AbortController cancels in-flight `fetchTrack()` requests when flight is deselected before response

### Quality Gates

- [ ] No ESLint errors introduced
- [ ] All existing features (3D map, detail panel, flight path) work identically post-implementation
- [ ] Manual test: Open 10 different flights — verify only first selection makes network requests

## Success Metrics

| Metric | Before | Target |
|---|---|---|
| OpenSky API requests / 10 min | ~40 (15s poll + selections) | ~8 (adaptive poll only) |
| Time to reopen cached flight detail | ~1.5s (network) | <50ms (cache) |
| NearbyList re-render on poll | ~12ms (60 items) | <4ms (memo + deferred) |
| UX blank-screen on 429 | Yes (full error state) | Never (stale data shown) |

## Dependencies & Prerequisites

- No new npm packages required
- `sessionStorage` available in all modern browsers (already assumed by app)
- `useDeferredValue` — React 18 (already in use)
- `requestAnimationFrame` — browser native

## Risk Analysis

| Risk | Likelihood | Mitigation |
|---|---|---|
| sessionStorage QuotaExceededError | Low (500KB is well under 5MB limit) | Silent try/catch; cache degrades to memory-only |
| Track data stale after 5 min TTL | Low (tracks update slowly) | TTL chosen to match OpenSky track update cadence |
| rateLimitManager singleton not tree-shaken | Low | Module is tiny (~20 lines); import cost negligible |
| useDeferredValue causes visible list lag | Medium | Only defers when browser is busy; imperceptible at 15s update cadence |

## References & Research

### Internal References

- `src/api/opensky.js:30–36` — current `fetchFlights()` with no backoff
- `src/hooks/useFlights.js:5` — hardcoded `POLL_MS = 15000`
- `src/hooks/useFlightDetail.js:24` — `controllers` array allocated but never populated (AbortController bug)
- `src/components/NearbyList.jsx:58` — 60+ `FlightRow` renders without memoization
- `src/components/FlightMap.jsx:287–306` — synchronous `setData()` on every flight state update

### External References

- OpenSky REST API + rate limit docs: https://openskynetwork.github.io/opensky-api/rest.html#limitations
  - Anonymous tier: 400 credits/day; `/states/all` costs 1-4 credits based on bbox area
  - `X-Rate-Limit-Retry-After-Seconds` response header on 429
- React `useDeferredValue`: https://react.dev/reference/react/useDeferredValue
- React `memo` comparator: https://react.dev/reference/react/memo#minimizing-props-changes
- MapLibre `updateData()` differential updates: https://maplibre.org/maplibre-gl-js/docs/API/classes/GeoJSONSource/
- MapLibre `setData` memory leak (high-frequency calls): https://github.com/maplibre/maplibre-gl-js/issues/6154
- MapLibre Large Data Performance Guide: https://maplibre.org/maplibre-gl-js/docs/guides/large-data/
- sessionStorage spec + QuotaExceededError: https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API/Using_the_Web_Storage_API
- Decorrelated jitter backoff (AWS): https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/
- Fetch deduplication (SingleFlight pattern): https://www.npmjs.com/package/fetch-dedupe
