import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildPlaneFeatures,
  buildPlaneSourceDiff,
  getTrackCoordinates,
} from '../src/components/flightMapHelpers.js'

test('buildPlaneFeatures filters invalid rows and normalizes properties', () => {
  const flights = [
    { icao24: 'abc123', latitude: 40.64, longitude: -73.77, callsign: ' DAL123 ', heading: 91 },
    { icao24: 'def456', latitude: 40.7, longitude: -73.9, callsign: null, heading: null },
    { icao24: 'skip1', latitude: null, longitude: -73.8, callsign: 'SKIP1', heading: 180 },
    { icao24: null, latitude: 40.5, longitude: -73.6, callsign: 'SKIP2', heading: 200 },
  ]

  const features = buildPlaneFeatures(flights, 'def456')
  assert.equal(features.length, 2)
  assert.deepEqual(features[0], {
    type: 'Feature',
    properties: {
      icao24: 'abc123',
      callsign: 'DAL123',
      heading: 91,
      selected: false,
    },
    geometry: { type: 'Point', coordinates: [-73.77, 40.64] },
  })
  assert.deepEqual(features[1], {
    type: 'Feature',
    properties: {
      icao24: 'def456',
      callsign: 'def456',
      heading: 0,
      selected: true,
    },
    geometry: { type: 'Point', coordinates: [-73.9, 40.7] },
  })
})

test('buildPlaneSourceDiff computes add/update/remove + next set', () => {
  const features = buildPlaneFeatures(
    [
      { icao24: 'abc123', latitude: 40.64, longitude: -73.77, callsign: 'AAL1', heading: 10 },
      { icao24: 'def456', latitude: 40.7, longitude: -73.9, callsign: 'DAL2', heading: 20 },
    ],
    'abc123',
  )
  const prevSet = new Set(['abc123', 'stale999'])

  const diff = buildPlaneSourceDiff(features, prevSet)

  assert.deepEqual(diff.add.map(item => item.properties.icao24), ['def456'])
  assert.deepEqual(diff.update.map(item => item.id), ['abc123'])
  assert.deepEqual(diff.remove, ['stale999'])
  assert.deepEqual([...diff.nextSet].sort(), ['abc123', 'def456'])
})

test('getTrackCoordinates prefers recent path when >=2 points else falls back', () => {
  const track = {
    path: [
      [100, 40.60, -73.80],
      [200, 40.61, -73.81],
      [300, 40.62, -73.82],
    ],
  }

  assert.deepEqual(getTrackCoordinates(track, 150), [
    [-73.81, 40.61],
    [-73.82, 40.62],
  ])

  assert.deepEqual(getTrackCoordinates(track, 250), [
    [-73.8, 40.6],
    [-73.81, 40.61],
    [-73.82, 40.62],
  ])
})

test('getTrackCoordinates drops invalid lat/lng entries and handles empty track', () => {
  const track = {
    path: [
      [100, 40.60, -73.80],
      [200, null, -73.81],
      [300, 40.62, null],
      [400, 40.63, -73.83],
    ],
  }

  assert.deepEqual(getTrackCoordinates(track, 0), [
    [-73.8, 40.6],
    [-73.83, 40.63],
  ])
  assert.deepEqual(getTrackCoordinates(null, 0), [])
})
