const DB_NAME = 'twa-flight-history'
const DB_VERSION = 1
const STORE_POINTS = 'flight_points'

const MAX_HISTORY_MS = 10 * 24 * 60 * 60 * 1000 // keep 10 days
const SAMPLE_WRITE_MIN_INTERVAL_MS = 12_000
const SAMPLE_WRITE_MAX_INTERVAL_MS = 45_000
const SAMPLE_POSITION_EPSILON_DEG = 0.00018
const SAMPLE_ALTITUDE_EPSILON_M = 45
const SAMPLE_SPEED_EPSILON_MS = 8
const SAMPLE_HEADING_EPSILON_DEG = 6

let dbPromise = null
const recentSampleMeta = new Map()

function requestToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function transactionDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

function isNumberLike(value) {
  return Number.isFinite(value)
}

function normalizeSamplePoint(raw, snapshotTime) {
  return {
    icao24: raw.icao24?.toLowerCase(),
    callsign: (raw.callsign || '').trim().toUpperCase(),
    snapshot_at: snapshotTime,
    ts: snapshotTime,
    latitude: Number(raw.latitude),
    longitude: Number(raw.longitude),
    baro_altitude: isNumberLike(raw.baro_altitude) ? Number(raw.baro_altitude) : null,
    geo_altitude: isNumberLike(raw.geo_altitude) ? Number(raw.geo_altitude) : null,
    velocity: isNumberLike(raw.velocity) ? Number(raw.velocity) : null,
    heading: isNumberLike(raw.heading) ? Number(raw.heading) : null,
    vertical_rate: isNumberLike(raw.vertical_rate) ? Number(raw.vertical_rate) : null,
    squawk: raw.squawk || null,
    on_ground: raw.on_ground === true,
    last_contact: isNumberLike(raw.last_contact) ? Number(raw.last_contact) : null,
    time_position: isNumberLike(raw.time_position) ? Number(raw.time_position) : null,
    origin_country: raw.origin_country || null,
    distKm: isNumberLike(raw.distKm) ? Number(raw.distKm) : null,
    sampleKind: String(raw.sampleKind || 'snapshot'),
  }
}

function normalizeTrackPoints(icao24, track) {
  if (!track?.path?.length) return []
  const callsign = (track.callsign || '').trim().toUpperCase()
  return track.path
    .filter(point => point?.length >= 2)
    .map(point => {
      const [timeSec, lat, lon, baroAltitude, heading, onGround] = point
      const ts = Number(timeSec) * 1000
      if (!isNumberLike(ts) || !isNumberLike(lat) || !isNumberLike(lon)) return null
      return {
        icao24: (icao24 || '').toLowerCase(),
        callsign,
        ts,
        latitude: Number(lat),
        longitude: Number(lon),
        baro_altitude: isNumberLike(baroAltitude) ? Number(baroAltitude) : null,
        geo_altitude: null,
        velocity: null,
        heading: isNumberLike(heading) ? Number(heading) : null,
        vertical_rate: null,
        squawk: null,
        on_ground: !!onGround,
        last_contact: null,
        time_position: null,
        origin_country: null,
        distKm: null,
        sampleKind: 'track',
        snapshot_at: ts,
      }
    })
    .filter(Boolean)
}

function isValidSample(sample) {
  return sample?.icao24 && isNumberLike(sample.ts) && isNumberLike(sample.latitude) && isNumberLike(sample.longitude)
}

function headingDelta(a, b) {
  if (!isNumberLike(a) || !isNumberLike(b)) return Infinity
  return Math.abs((((a - b) + 540) % 360) - 180)
}

function shouldPersistSample(sample) {
  const previous = recentSampleMeta.get(sample.icao24)
  if (!previous) return true

  const elapsedMs = sample.ts - previous.ts
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return false
  if (sample.sampleKind === 'recovered' || previous.sampleKind === 'recovered') return true
  if (sample.on_ground !== previous.on_ground) return true
  if (elapsedMs >= SAMPLE_WRITE_MAX_INTERVAL_MS) return true

  const moved = Math.abs(sample.latitude - previous.latitude) > SAMPLE_POSITION_EPSILON_DEG
    || Math.abs(sample.longitude - previous.longitude) > SAMPLE_POSITION_EPSILON_DEG
  if (moved) return true

  const altitudeChanged = isNumberLike(sample.baro_altitude) && isNumberLike(previous.baro_altitude)
    ? Math.abs(sample.baro_altitude - previous.baro_altitude) > SAMPLE_ALTITUDE_EPSILON_M
    : sample.baro_altitude !== previous.baro_altitude
  if (altitudeChanged) return true

  const speedChanged = isNumberLike(sample.velocity) && isNumberLike(previous.velocity)
    ? Math.abs(sample.velocity - previous.velocity) > SAMPLE_SPEED_EPSILON_MS
    : sample.velocity !== previous.velocity
  if (speedChanged) return true

  if (headingDelta(sample.heading, previous.heading) > SAMPLE_HEADING_EPSILON_DEG) return true

  return elapsedMs >= SAMPLE_WRITE_MIN_INTERVAL_MS
}

function openDB() {
  if (typeof indexedDB === 'undefined') return null

  if (dbPromise) return dbPromise

  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)

    req.onerror = () => {
      dbPromise = null
      reject(req.error)
    }

    req.onupgradeneeded = event => {
      const db = req.result
      const oldVersion = event.oldVersion
      if (oldVersion < 1) {
        const store = db.createObjectStore(STORE_POINTS, { keyPath: 'id', autoIncrement: true })
        store.createIndex('by_ts', 'ts', { unique: false })
        store.createIndex('by_icao', 'icao24', { unique: false })
        store.createIndex('by_kind', 'sampleKind', { unique: false })
      }
    }

    req.onsuccess = () => resolve(req.result)
  })

  return dbPromise
}

async function withStore(mode, fn) {
  const db = await openDB()
  if (!db) return null

  try {
    const tx = db.transaction(STORE_POINTS, mode)
    const store = tx.objectStore(STORE_POINTS)
    const out = await fn(store)
    await transactionDone(tx)
    return out
  } catch (error) {
    console.error('[flightHistoryDb] store operation failed', error)
    return null
  }
}

export async function recordFlightSamples(flights, snapshotTime = Date.now()) {
  if (!Array.isArray(flights) || !flights.length) return

  const points = flights
    .map(f => normalizeSamplePoint(f, snapshotTime))
    .filter(isValidSample)
    .filter(shouldPersistSample)

  if (!points.length) return

  await withStore('readwrite', (store) => {
    for (const point of points) {
      store.add(point)
      recentSampleMeta.set(point.icao24, point)
    }
  })

  await pruneOldSamples()
}

export async function recordTrackPoints(icao24, track) {
  const points = normalizeTrackPoints(icao24, track)
  if (!points.length) return

  await withStore('readwrite', (store) => {
    for (const point of points) {
      store.add(point)
      recentSampleMeta.set(point.icao24, point)
    }
  })
}

export async function getWindowSamples(windowMs) {
  const windowLowerBound = Date.now() - windowMs
  const rows = await withStore('readonly', (store) => {
    const idx = store.index('by_ts')
    const range = IDBKeyRange.lowerBound(windowLowerBound)
    const req = idx.getAll(range)
    return requestToPromise(req)
  })
  if (!rows) return []
  return rows.filter(isValidSample)
}

function normalizeIcao(icao24) {
  return String(icao24 || '').trim().toLowerCase()
}

export async function getRecentTrackForIcao(icao24, windowMs = 10 * 60 * 1000) {
  const target = normalizeIcao(icao24)
  if (!target) return null

  const safeWindowMs = Number.isFinite(windowMs) && windowMs > 0 ? windowMs : 10 * 60 * 1000
  const rows = await getWindowSamples(safeWindowMs)
  const relevant = rows
    .filter(sample => normalizeIcao(sample.icao24) === target)

  return relevant.length ? convertSamplesToTrack(relevant) : null
}

export async function pruneOldSamples(retentionMs = MAX_HISTORY_MS) {
  const cutoff = Date.now() - retentionMs
  await withStore('readwrite', (store) => {
    const idx = store.index('by_ts')
    const range = IDBKeyRange.upperBound(cutoff)
    let cursor = idx.openCursor(range)

    return new Promise((resolve, reject) => {
      cursor.onsuccess = () => {
        const c = cursor.result
        if (!c) {
          resolve()
          return
        }
        c.delete()
        c.continue()
      }
      cursor.onerror = () => reject(cursor.error)
    })
  })
}

export async function clearHistoryDb() {
  await withStore('readwrite', (store) => {
    store.clear()
  })
}

export function convertSamplesToTrack(samples = []) {
  const points = samples
    .filter(isValidSample)
    .sort((a, b) => a.ts - b.ts)
    .map(s => [
      Math.floor(s.ts / 1000),
      s.latitude,
      s.longitude,
      s.baro_altitude,
      s.heading,
      !!s.on_ground,
    ])

  return { path: points }
}

export function makeMapFlightFromSample(sample) {
  if (!sample) return null
  return {
    icao24: sample.icao24,
    callsign: sample.callsign || sample.icao24,
    origin_country: sample.origin_country,
    time_position: sample.time_position,
    last_contact: sample.last_contact,
    longitude: sample.longitude,
    latitude: sample.latitude,
    baro_altitude: sample.baro_altitude,
    on_ground: sample.on_ground,
    velocity: sample.velocity,
    heading: sample.heading,
    vertical_rate: sample.vertical_rate,
    geo_altitude: sample.geo_altitude,
    squawk: sample.squawk,
    distKm: sample.distKm,
  }
}
