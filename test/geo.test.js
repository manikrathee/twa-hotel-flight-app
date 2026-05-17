import test from 'node:test'
import assert from 'node:assert/strict'

import {
  bearingDeg,
  distanceKm,
  distanceMiles,
  headingToCardinal,
  metersToFeet,
  mphToKnots,
  msTofpm,
  msToKnots,
} from '../src/utils/geo.js'

function approxEqual(actual, expected, tolerance = 1e-6) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `expected ${actual} to be within ${tolerance} of ${expected}`)
}

test('distance helpers return stable geodesic values', () => {
  assert.equal(distanceKm(40.6413, -73.7781, 40.6413, -73.7781), 0)

  const jfkToLaxKm = distanceKm(40.6413, -73.7781, 33.9416, -118.4085)
  assert.ok(jfkToLaxKm > 3950 && jfkToLaxKm < 4010)

  const jfkToLaxMiles = distanceMiles(40.6413, -73.7781, 33.9416, -118.4085)
  approxEqual(jfkToLaxMiles, jfkToLaxKm * 0.621371)
})

test('bearing helper handles cardinals', () => {
  approxEqual(bearingDeg(0, 0, 1, 0), 0)
  approxEqual(bearingDeg(0, 0, 0, 1), 90)
  approxEqual(bearingDeg(0, 0, -1, 0), 180)
  approxEqual(bearingDeg(0, 0, 0, -1), 270)
})

test('unit conversions and heading mapping are deterministic', () => {
  assert.equal(metersToFeet(1000), 3281)
  assert.equal(metersToFeet(null), 0)

  assert.equal(msToKnots(100), 194)
  assert.equal(msToKnots(undefined), 0)

  assert.equal(mphToKnots(100), 87)
  assert.equal(mphToKnots(0), 0)

  assert.equal(msTofpm(5), 984)
  assert.equal(msTofpm(null), 0)

  assert.equal(headingToCardinal(null), '—')
  assert.equal(headingToCardinal(-10), 'N')
  assert.equal(headingToCardinal(45), 'NE')
  assert.equal(headingToCardinal(181), 'S')
  assert.equal(headingToCardinal(360), 'N')
})
