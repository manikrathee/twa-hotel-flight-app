import test from 'node:test'
import assert from 'node:assert/strict'

import {
  chooseFreshestFeedCache,
  isFeedSnapshotUsable,
  SNAPSHOT_TTL_MS,
} from '../src/cache/feedSnapshotCache.js'

test('feed snapshot expires after ttl', () => {
  const nowMs = 5_000_000
  const snapshot = {
    fetchedAtMs: nowMs - SNAPSHOT_TTL_MS - 1,
    flights: [{ icao24: 'abc123' }],
    scope: {
      center: { lat: 40.64, lon: -73.78 },
      radiusMi: 20,
    },
  }

  assert.equal(
    isFeedSnapshotUsable(snapshot, {
      nowMs,
      center: { lat: 40.64, lon: -73.78 },
      radiusMi: 20,
    }),
    false,
  )
})

test('feed snapshot is accepted for nearby search areas', () => {
  const nowMs = 5_000_000
  const snapshot = {
    fetchedAtMs: nowMs - 60_000,
    flights: [{ icao24: 'abc123' }],
    scope: {
      center: { lat: 40.64, lon: -73.78 },
      radiusMi: 20,
    },
  }

  assert.equal(
    isFeedSnapshotUsable(snapshot, {
      nowMs,
      center: { lat: 40.68, lon: -73.74 },
      radiusMi: 18,
    }),
    true,
  )
})

test('feed snapshot is rejected for distant search areas', () => {
  const nowMs = 5_000_000
  const snapshot = {
    fetchedAtMs: nowMs - 60_000,
    flights: [{ icao24: 'abc123' }],
    scope: {
      center: { lat: 40.64, lon: -73.78 },
      radiusMi: 20,
    },
  }

  assert.equal(
    isFeedSnapshotUsable(snapshot, {
      nowMs,
      center: { lat: 34.05, lon: -118.24 },
      radiusMi: 20,
    }),
    false,
  )
})

test('freshest cache source wins over older snapshot', () => {
  const olderSnapshot = {
    flights: [{ icao24: 'snap01' }],
    cachedAt: new Date('2026-06-10T10:00:00.000Z'),
    cacheSource: 'snapshot',
  }
  const newerCache = {
    flights: [{ icao24: 'live01' }],
    cachedAt: new Date('2026-06-10T10:05:00.000Z'),
    cacheSource: 'live',
  }

  assert.deepEqual(
    chooseFreshestFeedCache([olderSnapshot, newerCache]),
    newerCache,
  )
})
