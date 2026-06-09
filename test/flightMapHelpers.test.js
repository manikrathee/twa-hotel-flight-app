import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildPlaneFeatures,
  buildPlaneSourceDiff,
  planeFeatureStateMap,
  getTrackCoordinates,
} from '../src/components/flightMapHelpers.js'

test('buildPlaneFeatures filters invalid rows and normalizes properties', () => {
  const flights = [
    { icao24: 'abc123', latitude: 40.64, longitude: -73.77, callsign: ' DAL123 ', heading: 91 },
    { icao24: 'def456', latitude: 40.7, longitude: -73.9, callsign: null, heading: null },
    { icao24: 'ghi789', latitude: 40.71, longitude: -73.88, callsign: 'JFK2', heading: -45 },
    { icao24: 'skip1', latitude: null, longitude: -73.8, callsign: 'SKIP1', heading: 180 },
    { icao24: null, latitude: 40.5, longitude: -73.6, callsign: 'SKIP2', heading: 200 },
  ]

  const features = buildPlaneFeatures(flights, 'def456')
  assert.equal(features.length, 3)
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
  assert.deepEqual(features[2], {
    type: 'Feature',
    properties: {
      icao24: 'ghi789',
      callsign: 'JFK2',
      heading: 315,
      selected: false,
    },
    geometry: { type: 'Point', coordinates: [-73.88, 40.71] },
  })
})

test('buildPlaneFeatures tolerates non-string ids, callsigns and coordinates', () => {
  const features = buildPlaneFeatures([
    {
      icao24: 'A1B2C3',
      latitude: '40.7001',
      longitude: -73.95,
      callsign: 1234,
      heading: '450',
    },
    {
      icao24: 0,
      latitude: 40.7,
      longitude: -73.8,
      callsign: '   ',
      heading: 10,
    },
    {
      icao24: 'skip',
      latitude: 'bad',
      longitude: -73.8,
      callsign: 'SkipMe',
      heading: 20,
    },
  ], 'A1b2C3')

  assert.equal(features.length, 2)
  assert.deepEqual(features[0].properties, {
    icao24: 'a1b2c3',
    callsign: '1234',
    heading: 90,
    selected: true,
  })
  assert.deepEqual(features[1].properties, {
    icao24: '0',
    callsign: '0',
    heading: 10,
    selected: false,
  })
  assert.deepEqual(features[0].geometry, {
    type: 'Point',
    coordinates: [-73.95, 40.7001],
  })
  assert.deepEqual(features[1].geometry, {
    type: 'Point',
    coordinates: [-73.8, 40.7],
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

test('buildPlaneSourceDiff with cached feature state emits only meaningful updates', () => {
  const prev = buildPlaneFeatures([
    { icao24: 'a1', latitude: 40.6, longitude: -73.7, callsign: 'A', heading: 45, selected: false },
    { icao24: 'b2', latitude: 40.7, longitude: -73.8, callsign: 'B', heading: 90, selected: false },
  ], null)
  const prevState = planeFeatureStateMap(prev)

  const next = buildPlaneFeatures([
    { icao24: 'a1', latitude: 40.6, longitude: -73.7, callsign: 'A', heading: 45, selected: false },
    { icao24: 'b2', latitude: 40.7, longitude: -73.8, callsign: 'B', heading: 180, selected: false },
    { icao24: 'c3', latitude: 40.8, longitude: -73.9, callsign: 'C', heading: 135, selected: false },
  ], null)
  const diff = buildPlaneSourceDiff(next, prevState)

  assert.equal(diff.add.length, 1)
  assert.equal(diff.add[0].properties.icao24, 'c3')

  assert.equal(diff.update.length, 1)
  assert.deepEqual(diff.update[0], {
    id: 'b2',
    newGeometry: { type: 'Point', coordinates: [-73.8, 40.7] },
    addOrUpdateProperties: [
      { key: 'callsign', value: 'B' },
      { key: 'heading', value: 180 },
      { key: 'selected', value: false },
    ],
  })
  assert.equal(diff.remove.length, 0)
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

test('getTrackCoordinates interpolates intermediate points for short gaps', () => {
  const track = {
    path: [
      [100, 40.0, -73.0],
      [108, 40.004, -73.004],
      [116, 40.008, -73.008],
    ],
  }

  const expected = [
    [-73, 40],
    [-73.001, 40.001],
    [-73.002, 40.002],
    [-73.003, 40.003],
    [-73.004, 40.004],
    [-73.005, 40.005],
    [-73.006, 40.006],
    [-73.007, 40.007],
    [-73.008, 40.008],
  ]
  const actual = getTrackCoordinates(track, 0)
  const eps = 1e-9

  assert.equal(actual.length, expected.length)
  actual.forEach((point, idx) => {
    assert.equal(point.length, 2)
    assert.ok(Math.abs(point[0] - expected[idx][0]) < eps)
    assert.ok(Math.abs(point[1] - expected[idx][1]) < eps)
  })
})

test('getTrackCoordinates skips interpolation for long gaps', () => {
  const track = {
    path: [
      [100, 40.0, -73.0],
      [160, 40.004, -73.004],
    ],
  }

  const result = getTrackCoordinates(track, 0)
  assert.deepEqual(result, [
    [-73, 40],
    [-73.004, 40.004],
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
