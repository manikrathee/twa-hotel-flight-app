const SESSION_KEY = 'twa_flight_cache'
const TTL_TRACK_MS = 5 * 60 * 1000         // 5 min — tracks update slowly
const TTL_AIRCRAFT_MS = 24 * 60 * 60 * 1000 // 24 hr — aircraft metadata is static

class FlightCache {
  constructor() {
    this._mem = new Map()
    this._loadFromSession()
  }

  getTrack(icao24) {
    return this._get(`track:${icao24}`, TTL_TRACK_MS)
  }

  setTrack(icao24, data) {
    if (data == null) return
    this._set(`track:${icao24}`, data)
  }

  getAircraft(icao24) {
    return this._get(`ac:${icao24}`, TTL_AIRCRAFT_MS)
  }

  setAircraft(icao24, data) {
    if (data == null) return
    this._set(`ac:${icao24}`, data)
  }

  _get(key, ttl) {
    const entry = this._mem.get(key)
    if (!entry) return null
    if (Date.now() - entry.ts > ttl) {
      this._mem.delete(key)
      return null
    }
    return entry.data
  }

  _set(key, data) {
    this._mem.set(key, { data, ts: Date.now() })
    this._persistToSession()
  }

  _persistToSession() {
    try {
      const obj = {}
      for (const [k, v] of this._mem) obj[k] = v
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(obj))
    } catch {
      // QuotaExceededError — cache degrades gracefully to memory-only
    }
  }

  _loadFromSession() {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY)
      if (!raw) return
      const obj = JSON.parse(raw)
      for (const [k, v] of Object.entries(obj)) {
        this._mem.set(k, v)
      }
    } catch {
      // Corrupt session data — start fresh
    }
  }

  // Evict all expired entries (called opportunistically)
  evict() {
    const now = Date.now()
    for (const [key, entry] of this._mem) {
      const ttl = key.startsWith('track:') ? TTL_TRACK_MS : TTL_AIRCRAFT_MS
      if (now - entry.ts > ttl) this._mem.delete(key)
    }
  }
}

export const flightCache = new FlightCache()
