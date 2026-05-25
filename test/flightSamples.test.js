import test from 'node:test'
import assert from 'node:assert/strict'
import { buildPositionedSamples } from '../src/utils/flightSamples.js'

test('buildPositionedSamples keeps both airborne and on-ground positioned flights', () => {
  const samples = buildPositionedSamples([
    {
      icao24: 'ABC123',
      callsign: 'DAL123 ',
      latitude: 40.64,
      longitude: -73.77,
      on_ground: true,
      baro_altitude: null,
      velocity: 0,
      heading: null,
      vertical_rate: null,
      squawk: ' 1200 ',
    },
    {
      icao24: 'DEF456',
      callsign: 'AAL456',
      latitude: 40.71,
      longitude: -73.95,
      on_ground: false,
      baro_altitude: 3200,
      velocity: 120,
      heading: 90,
      vertical_rate: 2,
      squawk: null,
    },
    {
      icao24: 'BAD999',
      callsign: 'BAD999',
      latitude: null,
      longitude: -73.95,
      on_ground: false,
    },
  ])

  assert.equal(samples.length, 2)
  assert.deepEqual(samples.map(s => s.icao24), ['abc123', 'def456'])
  assert.equal(samples[0].on_ground, true)
  assert.equal(samples[1].on_ground, false)
  assert.equal(samples[0].squawk, '1200')
})
