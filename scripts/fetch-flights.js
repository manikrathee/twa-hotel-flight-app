#!/usr/bin/env node
/**
 * fetch-flights.js  —  Snapshot JFK-area traffic from OpenSky and persist to SQLite.
 *
 * Usage:
 *   node scripts/fetch-flights.js          # live fetch
 *   node scripts/fetch-flights.js --mock   # offline / rate-limited — synthetic data
 *   node scripts/fetch-flights.js --dump   # print latest DB snapshot without fetching
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import Database from 'better-sqlite3'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT       = join(__dirname, '..')
const DB_PATH    = join(ROOT, 'data', 'flights.db')
const CACHE_PATH = join(ROOT, 'public', 'flights-cache.json')
const ENV_PATH   = join(ROOT, '.env.local')

mkdirSync(join(ROOT, 'data'), { recursive: true })

const JFK  = { lat: 40.6413, lon: -73.7781 }
const BBOX = { lamin: 40.35, lomin: -74.35, lamax: 40.95, lomax: -73.15 }
const TOKEN_URL  = 'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token'
const STATES_URL = `https://opensky-network.org/api/states/all?lamin=${BBOX.lamin}&lomin=${BBOX.lomin}&lamax=${BBOX.lamax}&lomax=${BBOX.lomax}`

// Simple .env.local parser — no dotenv dependency needed
function loadEnv(path) {
  if (!existsSync(path)) return {}
  return Object.fromEntries(
    readFileSync(path, 'utf8')
      .split('\n')
      .filter(l => l && !l.startsWith('#') && l.includes('='))
      .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
  )
}

const env = loadEnv(ENV_PATH)
const CLIENT_ID     = process.env.VITE_OPENSKY_CLIENT_ID     ?? env.VITE_OPENSKY_CLIENT_ID
const CLIENT_SECRET = process.env.VITE_OPENSKY_CLIENT_SECRET ?? env.VITE_OPENSKY_CLIENT_SECRET

// DB setup
const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')
db.prepare(`CREATE TABLE IF NOT EXISTS snapshots (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  fetched_at INTEGER NOT NULL,
  source     TEXT    NOT NULL DEFAULT 'live',
  count      INTEGER NOT NULL,
  states     TEXT    NOT NULL
)`).run()
db.prepare(`CREATE INDEX IF NOT EXISTS snapshots_fetched_at ON snapshots (fetched_at DESC)`).run()

const insertSnapshot = db.prepare('INSERT INTO snapshots (fetched_at, source, count, states) VALUES (?, ?, ?, ?)')
const latestSnapshot = db.prepare('SELECT * FROM snapshots ORDER BY fetched_at DESC LIMIT 1')

function parseStates(states) {
  if (!Array.isArray(states)) return []
  return states
    .filter(s => !s[8] && s[6] != null && s[5] != null)
    .map(s => ({
      icao24:         s[0],
      callsign:      (s[1] || '').trim(),
      origin_country: s[2],
      time_position:  s[3],
      last_contact:   s[4],
      longitude:      s[5],
      latitude:       s[6],
      baro_altitude:  s[7],
      on_ground:      false,
      velocity:       s[9],
      heading:        s[10],
      vertical_rate:  s[11],
      geo_altitude:   s[13],
      squawk:         s[14],
    }))
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371, toR = Math.PI / 180
  const dLat = (lat2 - lat1) * toR, dLon = (lon2 - lon1) * toR
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * toR) * Math.cos(lat2 * toR) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function writeCacheFile(parsed, fetchedAt, source) {
  const enriched = parsed
    .map(f => ({ ...f, distKm: haversineKm(JFK.lat, JFK.lon, f.latitude, f.longitude) }))
    .sort((a, b) => a.distKm - b.distKm)
  writeFileSync(CACHE_PATH, JSON.stringify({ source, fetchedAt: fetchedAt.toISOString(), count: enriched.length, flights: enriched }, null, 2))
  return enriched
}

async function getToken() {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    console.warn('[auth] No credentials — proceeding anonymous')
    return null
  }
  const body = new URLSearchParams({ grant_type: 'client_credentials', client_id: CLIENT_ID, client_secret: CLIENT_SECRET })
  const res = await fetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString(), signal: AbortSignal.timeout(12000) })
  if (!res.ok) throw new Error(`Auth failed: ${res.status}`)
  const { access_token } = await res.json()
  console.log('[auth] Bearer token acquired')
  return access_token
}

function generateMock() {
  const carriers = [
    ['AAL', 'United States'], ['DAL', 'United States'], ['UAL', 'United States'],
    ['JBU', 'United States'], ['SWA', 'United States'], ['ASA', 'United States'],
    ['BAW', 'United Kingdom'], ['AFR', 'France'], ['DLH', 'Germany'],
    ['UAE', 'United Arab Emirates'], ['QTR', 'Qatar'], ['KLM', 'Netherlands'],
  ]
  const now = Math.floor(Date.now() / 1000)
  return Array.from({ length: 32 }, (_, i) => {
    const [cs, country] = carriers[i % carriers.length]
    const num = String(Math.floor(100 + Math.random() * 9900)).padStart(4, '0')
    const lat = BBOX.lamin + Math.random() * (BBOX.lamax - BBOX.lamin)
    const lon = BBOX.lomin + Math.random() * (BBOX.lomax - BBOX.lomin)
    const alt = 1000 + Math.random() * 10500
    const spd = 80  + Math.random() * 200
    const hdg = Math.random() * 360
    const vr  = (Math.random() - 0.5) * 20
    return [
      `a${String(i + 1).padStart(5, '0')}`,
      `${cs}${num}  `,
      country, now, now,
      parseFloat(lon.toFixed(5)), parseFloat(lat.toFixed(5)),
      parseFloat(alt.toFixed(1)), false,
      parseFloat(spd.toFixed(1)), parseFloat(hdg.toFixed(1)),
      parseFloat(vr.toFixed(2)), null,
      parseFloat((alt + 50).toFixed(1)),
      String(Math.floor(1000 + Math.random() * 7000)),
    ]
  })
}

async function fetchLive() {
  const token = await getToken()
  const headers = token ? { Authorization: `Bearer ${token}` } : {}
  console.log('[fetch] GET', STATES_URL)
  const res = await fetch(STATES_URL, { headers, signal: AbortSignal.timeout(15000) })
  if (res.status === 429) throw new Error('Rate limited (429) — use --mock for offline testing')
  if (!res.ok) throw new Error(`OpenSky ${res.status}`)
  const data = await res.json()
  return data.states || []
}

function dump() {
  const row = latestSnapshot.get()
  if (!row) { console.log('No snapshots in DB yet.'); return }
  const ago = Math.round((Date.now() - row.fetched_at) / 60000)
  console.log(`Latest snapshot: ${new Date(row.fetched_at).toISOString()}  (${ago}m ago)`)
  console.log(`Source: ${row.source}  |  Aircraft: ${row.count}`)
  JSON.parse(row.states).slice(0, 10).forEach(f => {
    const fl = Math.round((f.baro_altitude || 0) * 3.28084 / 100)
    console.log(`  ${(f.callsign || '??').padEnd(10)} FL${String(fl).padStart(3, '0')}`)
  })
}

async function main() {
  const args = process.argv.slice(2)
  if (args.includes('--dump')) { dump(); db.close(); return }

  const isMock  = args.includes('--mock')
  const source  = isMock ? 'mock' : 'live'
  const fetchedAt = new Date()

  console.log(`[fetch-flights] mode=${source}  time=${fetchedAt.toISOString()}`)

  const rawStates = isMock ? generateMock() : await fetchLive()
  const parsed    = parseStates(rawStates)

  console.log(`[parse] ${parsed.length} airborne aircraft`)

  insertSnapshot.run(fetchedAt.getTime(), source, parsed.length, JSON.stringify(parsed))
  console.log(`[db] Snapshot saved → ${DB_PATH}`)

  const enriched = writeCacheFile(parsed, fetchedAt, source)
  console.log(`[cache] Written → ${CACHE_PATH}`)

  console.log(`[done] ✓  ${enriched.length} aircraft · source=${source}`)
  db.close()
}

main().catch(e => { console.error('[error]', e.message); process.exit(1) })
