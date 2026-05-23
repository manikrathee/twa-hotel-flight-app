const DB_NAME = 'twa-flight-history'
const DB_VERSION = 1
const STORE_POINTS = 'flight_points'

const MAX_HISTORY_MS = 10 * 24 * 60 * 60 * 1000 // keep 10 days

let dbPromise = null

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
    sampleKind: 'snapshot',
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

  if (!points.length) return

  await withStore('readwrite', (store) => {
    for (const point of points) {
      store.add(point)
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
        const { key } = c
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
