import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildPlaneFeatures,
  buildPlaneSourceDiff,
  buildPlanePopupText,
  buildOverlayPadding,
  resolveRecenterDecision,
  planeFeatureStateMap,
  getTrackCoordinates,
} from '../src/components/flightMapHelpers.js'

const expectedNarrowbodyFeatureProps = {
  planeType: 'Narrowbody Jet',
  planeTypeKey: 'narrowbody',
  planeIcon: 'plane-icon-narrowbody',
  iconScale: 1,
  altitudeText: '—',
  speedText: '—',
  headingText: '—',
  headingLine: 'HDG —',
  planeTypeCode: null,
  distanceLine: null,
  phaseLine: null,
  verticalRateText: '—',
  climbStatus: 'LEVEL',
  trendLine: 'Level',
  trendSummary: '—',
  metricLine: 'ALT — · SPD —',
  labelCompact: '::label-compact::',
  labelExpanded: '::label-expanded::',
}

function expectedNarrowbodyLabels({
  identifier,
  headingText,
  planeType = 'Narrowbody Jet',
  metricLine = 'ALT — · SPD —',
  trendLine = 'Level',
  trendSummary = '—',
  distanceLine,
  phaseLine,
}) {
  const normalizedHeading = headingText || '—'
  const headingLine = `HDG ${normalizedHeading}`
  const trendText = trendSummary !== '—' ? trendSummary : trendLine
  const compactLine = [metricLine, trendText, phaseLine, distanceLine].filter(Boolean).slice(0, 2).join(' · ')
  const expandedContext = phaseLine || distanceLine
  const expandedLines = [metricLine, trendText, expandedContext, headingLine].filter(Boolean).slice(0, 4)
  return {
    labelCompact: `${identifier} · ${planeType}\n${compactLine}`,
    labelExpanded: `${identifier} · ${planeType}\n${expandedLines.join('\n')}`,
  }
}

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
      ...expectedNarrowbodyFeatureProps,
      icao24: 'abc123',
      callsign: 'DAL123',
      identifier: 'DAL123',
      heading: 91,
      headingText: '91°',
      headingLine: 'HDG 91°',
      ...expectedNarrowbodyLabels({ identifier: 'DAL123', headingText: '91°' }),
      selected: false,
    },
    geometry: { type: 'Point', coordinates: [-73.77, 40.64] },
  })
  assert.deepEqual(features[1], {
    type: 'Feature',
    properties: {
      ...expectedNarrowbodyFeatureProps,
      icao24: 'def456',
      callsign: 'def456',
      identifier: 'def456',
      heading: 0,
      headingText: '—',
      headingLine: 'HDG —',
      ...expectedNarrowbodyLabels({ identifier: 'def456', headingText: '—' }),
      selected: true,
    },
    geometry: { type: 'Point', coordinates: [-73.9, 40.7] },
  })
  assert.deepEqual(features[2], {
    type: 'Feature',
    properties: {
      ...expectedNarrowbodyFeatureProps,
      icao24: 'ghi789',
      callsign: 'JFK2',
      identifier: 'JFK2',
      heading: 315,
      headingText: '315°',
      headingLine: 'HDG 315°',
      ...expectedNarrowbodyLabels({ identifier: 'JFK2', headingText: '315°' }),
      selected: false,
    },
    geometry: { type: 'Point', coordinates: [-73.88, 40.71] },
  })
})

test('buildPlaneFeatures emits icon labels with identifier, type, altitude, speed, and climb/level context', () => {
  const features = buildPlaneFeatures([
    {
      icao24: 'pl1',
      latitude: 40.71,
      longitude: -73.90,
      callsign: 'DAL999',
      typecode: 'A20N',
      baro_altitude: 11400,
      velocity: 260,
      vertical_rate: 0.45,
      heading: 180,
      category: 5,
      distKm: 8.6,
    },
    {
      icao24: 'pl2',
      latitude: 40.70,
      longitude: -73.95,
      callsign: 'NODATA',
      baro_altitude: null,
      velocity: null,
      vertical_rate: null,
      heading: 45,
      category: 1,
      distKm: 2.1,
    },
  ], null)

  const byId = new Map(features.map(f => [f.properties.icao24, f]))
  const first = byId.get('pl1')
  const second = byId.get('pl2')

  assert.equal(features.length, 2)
  assert.ok(typeof first.properties.labelCompact === 'string' && first.properties.labelCompact.includes('DAL999'))
  assert.ok(first.properties.labelCompact.includes(first.properties.planeType))
  assert.ok(first.properties.labelCompact.includes('ALT'))
  assert.ok(first.properties.labelCompact.includes('SPD'))
  assert.ok(first.properties.labelCompact.includes('↑'))
  const firstExpanded = first.properties.labelExpanded
  assert.ok(/\bnmi\b/.test(firstExpanded))
  assert.ok(firstExpanded.includes('↑'))

  assert.ok(typeof second.properties.labelCompact === 'string' && second.properties.labelCompact.includes('NODATA'))
  assert.ok(second.properties.labelCompact.includes(second.properties.planeType))
  assert.ok(/ALT\s+—/.test(second.properties.labelCompact))
  assert.ok(/SPD/.test(second.properties.labelCompact))
  assert.ok(second.properties.labelExpanded.includes('No telemetry') === false)
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
      ...expectedNarrowbodyFeatureProps,
      icao24: 'a1b2c3',
      callsign: '1234',
      identifier: '1234',
      heading: 90,
      headingText: '90°',
      headingLine: 'HDG 90°',
      ...expectedNarrowbodyLabels({ identifier: '1234', headingText: '90°' }),
      selected: true,
    })
  assert.deepEqual(features[1].properties, {
      ...expectedNarrowbodyFeatureProps,
      icao24: '0',
      callsign: '0',
      identifier: '0',
      heading: 10,
      headingText: '10°',
      headingLine: 'HDG 10°',
      ...expectedNarrowbodyLabels({ identifier: '0', headingText: '10°' }),
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

test('buildPlaneFeatures maps aircraft category/kinematic signals to rich plane profile metadata', () => {
  const features = buildPlaneFeatures([
    {
      icao24: 'a1',
      latitude: 40.64,
      longitude: -73.70,
      callsign: 'NARROW',
      category: 0,
      velocity: 150,
      baro_altitude: 10000,
      vertical_rate: 0,
    },
    {
      icao24: 'b2',
      latitude: 40.65,
      longitude: -73.71,
      callsign: 'WIDE',
      category: 4,
      velocity: 240,
      baro_altitude: 11500,
      vertical_rate: 0.4,
    },
    {
      icao24: 'c3',
      latitude: 40.66,
      longitude: -73.72,
      callsign: 'REG',
      category: 3,
      velocity: 140,
      baro_altitude: 3000,
      vertical_rate: -0.8,
    },
    {
      icao24: 'd4',
      latitude: 40.67,
      longitude: -73.73,
      callsign: 'TURB',
      category: 1,
      velocity: 60,
      baro_altitude: 800,
      vertical_rate: 1.2,
    },
    {
      icao24: 'e5',
      latitude: 40.68,
      longitude: -73.74,
      callsign: 'QUAD',
      category: 7,
      velocity: 210,
      baro_altitude: 12000,
      vertical_rate: 0,
    },
  ], null)

  const byId = new Map(features.map(f => [f.properties.icao24, f]))

  assert.equal(byId.get('a1').properties.planeTypeKey, 'narrowbody')
  assert.equal(byId.get('a1').properties.planeIcon, 'plane-icon-narrowbody')
  assert.equal(byId.get('a1').properties.planeType, 'Narrowbody Jet')
  assert.equal(byId.get('a1').properties.climbStatus, 'LEVEL')
  assert.equal(byId.get('a1').properties.trendLine, 'Level')
  assert.equal(byId.get('a1').properties.trendSummary, '—')
  assert.deepEqual({
    labelCompact: byId.get('a1').properties.labelCompact,
    labelExpanded: byId.get('a1').properties.labelExpanded,
  }, expectedNarrowbodyLabels({
    identifier: 'NARROW',
    planeType: 'Narrowbody Jet',
    headingText: undefined,
    metricLine: 'ALT 32,808 ft · SPD 292 kt',
    trendLine: 'Level',
  }))

  assert.equal(byId.get('b2').properties.planeTypeKey, 'widebody')
  assert.equal(byId.get('b2').properties.planeIcon, 'plane-icon-widebody')
  assert.equal(byId.get('b2').properties.planeType, 'Widebody Jet')
  assert.equal(byId.get('b2').properties.trendLine, 'Climbing +79 fpm')
  assert.equal(byId.get('b2').properties.trendSummary, '↑ 79 fpm')
  assert.deepEqual({
    labelCompact: byId.get('b2').properties.labelCompact,
    labelExpanded: byId.get('b2').properties.labelExpanded,
  }, {
    labelCompact: 'WIDE · Widebody Jet\nALT 37,730 ft · SPD 467 kt · ↑ 79 fpm',
    labelExpanded: 'WIDE · Widebody Jet\nALT 37,730 ft · SPD 467 kt\n↑ 79 fpm\nHDG —',
  })

  assert.equal(byId.get('c3').properties.planeTypeKey, 'regional')
  assert.equal(byId.get('c3').properties.planeIcon, 'plane-icon-regional')
  assert.equal(byId.get('c3').properties.climbStatus, 'DESC')
  assert.equal(byId.get('c3').properties.verticalRateText, '-157 fpm')
  assert.equal(byId.get('c3').properties.trendLine, 'Descending -157 fpm')
  assert.equal(byId.get('c3').properties.trendSummary, '↓ -157 fpm')
  assert.deepEqual({
    labelCompact: byId.get('c3').properties.labelCompact,
    labelExpanded: byId.get('c3').properties.labelExpanded,
  }, {
    labelCompact: 'REG · Regional Jet\nALT 9,843 ft · SPD 272 kt · ↓ -157 fpm',
    labelExpanded: 'REG · Regional Jet\nALT 9,843 ft · SPD 272 kt\n↓ -157 fpm\nHDG —',
  })

  assert.equal(byId.get('d4').properties.planeTypeKey, 'turboprop')
  assert.equal(byId.get('d4').properties.planeType, 'Turboprop')

  assert.equal(byId.get('e5').properties.planeTypeKey, 'quad')
  assert.equal(byId.get('e5').properties.planeType, 'Quad-Engine')
})

test('buildPlaneFeatures normalizes heading from true_track, adds ground and distance context', () => {
  const features = buildPlaneFeatures([
    {
      icao24: 'gt1',
      latitude: 40.72,
      longitude: -73.93,
      callsign: 'TRUE1',
      typecode: 'A20N',
      true_track: '450',
      on_ground: false,
      velocity: 250,
      baro_altitude: 11000,
      distKm: 13.2,
    },
    {
      icao24: 'gt2',
      latitude: 40.73,
      longitude: -73.94,
      callsign: 'GROUND2',
      typecode: 'B739',
      heading: 100,
      on_ground: true,
      baro_altitude: 0,
      distKm: 1.9,
      vertical_rate: -1.6,
    },
  ], null)

  const byId = new Map(features.map(f => [f.properties.icao24, f]))
  assert.equal(byId.get('gt1').properties.planeTypeKey, 'a320')
  assert.equal(byId.get('gt1').properties.planeType, 'Airbus A320neo')
  assert.equal(byId.get('gt1').properties.planeTypeCode, 'A20N')
  assert.equal(byId.get('gt1').properties.heading, 90)
  assert.equal(byId.get('gt1').properties.headingText, '90°')
  assert.equal(byId.get('gt1').properties.headingLine, 'HDG 90°')
  assert.equal(byId.get('gt1').properties.distanceLine, '7 nmi')
  assert.equal(byId.get('gt1').properties.phaseLine, null)
  assert.equal(
    byId.get('gt1').properties.labelExpanded,
    'TRUE1 · Airbus A320neo · A20N\nALT 36,089 ft · SPD 486 kt\nLevel\n7 nmi\nHDG 90°',
  )

  assert.equal(byId.get('gt2').properties.phaseLine, 'GND')
  assert.equal(byId.get('gt2').properties.distanceLine, '1 nmi')
  assert.equal(byId.get('gt2').properties.climbStatus, 'DESC')
  assert.equal(byId.get('gt2').properties.trendSummary, '↓ -315 fpm')
})

test('buildPlaneFeatures uses known ICAO type codes for deterministic plane labeling', () => {
  const features = buildPlaneFeatures([
    { icao24: 'qf1', latitude: 40.64, longitude: -73.7, callsign: 'QF1', typecode: 'B739', category: 3, velocity: 210, baro_altitude: 11000 },
    { icao24: 'qf2', latitude: 40.65, longitude: -73.71, callsign: 'QF2', typecode: 'A388', category: 8, velocity: 200, baro_altitude: 9800 },
    { icao24: 'qf3', latitude: 40.66, longitude: -73.72, callsign: 'QF3', typecode: 'DH8D', category: 1, velocity: 90, baro_altitude: 1500 },
    { icao24: 'qf4', latitude: 40.67, longitude: -73.73, callsign: 'QF4', typecode: 'A359', category: 4, velocity: 250, baro_altitude: 11500 },
    { icao24: 'qf5', latitude: 40.68, longitude: -73.74, callsign: 'QF5', typecode: 'B777', category: 4, velocity: 245, baro_altitude: 12000 },
  ], null)

  const byId = new Map(features.map(f => [f.properties.icao24, f]))
  assert.equal(byId.get('qf1').properties.planeType, 'Boeing 737-900')
  assert.equal(byId.get('qf1').properties.planeTypeKey, 'b737')
  assert.equal(byId.get('qf1').properties.planeTypeCode, 'B739')

  assert.equal(byId.get('qf2').properties.planeType, 'Airbus A380')
  assert.equal(byId.get('qf2').properties.planeTypeKey, 'a380')

  assert.equal(byId.get('qf3').properties.planeType, 'Bombardier Q400')
  assert.equal(byId.get('qf3').properties.planeTypeKey, 'turboprop')
  assert.equal(byId.get('qf4').properties.planeType, 'Airbus A350-900')
  assert.equal(byId.get('qf4').properties.planeTypeKey, 'a350')
  assert.equal(byId.get('qf5').properties.planeType, 'B777')
  assert.equal(byId.get('qf5').properties.planeTypeKey, 'b777')
})

test('buildPlaneSourceDiff updates selected flag consistently when selection changes', () => {
  const base = buildPlaneFeatures([
    {
      icao24: 'f1',
      latitude: 40.70,
      longitude: -73.80,
      callsign: 'FL1',
      typecode: 'A320',
      velocity: 220,
      baro_altitude: 9800,
    },
    {
      icao24: 'f2',
      latitude: 40.72,
      longitude: -73.82,
      callsign: 'FL2',
      typecode: 'B777',
      velocity: 250,
      baro_altitude: 10400,
    },
  ], 'f1')

  const baseState = planeFeatureStateMap(base)
  const selectedChanged = buildPlaneFeatures([
    {
      icao24: 'f1',
      latitude: 40.70,
      longitude: -73.80,
      callsign: 'FL1',
      typecode: 'A320',
      velocity: 220,
      baro_altitude: 9800,
    },
    {
      icao24: 'f2',
      latitude: 40.72,
      longitude: -73.82,
      callsign: 'FL2',
      typecode: 'B777',
      velocity: 250,
      baro_altitude: 10400,
    },
  ], 'f2')

  const diff = buildPlaneSourceDiff(selectedChanged, baseState)
  const updatesById = new Map(
    diff.update.map(item => [item.id, Object.fromEntries(item.addOrUpdateProperties.map((entry) => [entry.key, entry.value]))]),
  )

  assert.equal(diff.update.length, 2)
  assert.equal(updatesById.get('f1').selected, false)
  assert.equal(updatesById.get('f2').selected, true)
  assert.equal(updatesById.get('f1').planeTypeKey, 'a320')
  assert.equal(updatesById.get('f2').planeTypeKey, 'b777')
  assert.equal(updatesById.get('f1').planeIcon, 'plane-icon-a320')
  assert.equal(updatesById.get('f2').planeIcon, 'plane-icon-b777')
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
  assert.equal(diff.update[0].id, 'b2')
  assert.deepEqual(diff.update[0].newGeometry, { type: 'Point', coordinates: [-73.8, 40.7] })
  const updatedProps = Object.fromEntries(
    diff.update[0].addOrUpdateProperties.map(item => [item.key, item.value]),
  )
  assert.equal(updatedProps.icao24, undefined)
  assert.equal(updatedProps.callsign, 'B')
  assert.equal(updatedProps.identifier, 'B')
  assert.equal(updatedProps.heading, 180)
  assert.equal(updatedProps.headingText, '180°')
  assert.equal(updatedProps.headingLine, 'HDG 180°')
  assert.equal(updatedProps.selected, false)
  assert.equal(updatedProps.planeType, 'Narrowbody Jet')
  assert.equal(updatedProps.planeTypeKey, 'narrowbody')
  assert.equal(updatedProps.planeIcon, 'plane-icon-narrowbody')
  assert.equal(updatedProps.trendSummary, '—')
  assert.equal(updatedProps.metricLine, 'ALT — · SPD —')
  assert.equal(updatedProps.trendLine, 'Level')
  assert.equal(diff.remove.length, 0)
})

test('buildPlaneSourceDiff clears stale optional properties when telemetry context changes', () => {
  const prev = buildPlaneFeatures([
    {
      icao24: 'gnd1',
      latitude: 40.7,
      longitude: -73.8,
      callsign: 'GND1',
      on_ground: true,
      category: 3,
      velocity: 35,
      baro_altitude: 0,
      vertical_rate: null,
      distKm: 2.1,
    },
  ], null)
  const prevState = planeFeatureStateMap(prev)

  const next = buildPlaneFeatures([
    {
      icao24: 'gnd1',
      latitude: 40.7,
      longitude: -73.8,
      callsign: 'GND1',
      on_ground: false,
      category: 3,
      velocity: 120,
      baro_altitude: 5000,
      vertical_rate: 0.4,
      distKm: 1.4,
    },
  ], null)
  const diff = buildPlaneSourceDiff(next, prevState)

  assert.equal(diff.update.length, 1)
  const updatedProps = Object.fromEntries(
    diff.update[0].addOrUpdateProperties.map(item => [item.key, item.value]),
  )
  assert.equal(updatedProps.phaseLine, null)
  assert.equal(updatedProps.trendSummary, '↑ 79 fpm')
  assert.equal(updatedProps.labelCompact.includes('GND1'), true)
  assert.equal(updatedProps.distanceLine, '1 nmi')
})

test('buildPlanePopupText renders rich details consistently for telemetry and no-telemetry flights', () => {
  const withTelemetry = buildPlanePopupText({
    properties: {
      identifier: 'DAL123',
      planeType: 'Narrowbody Jet',
      metricLine: 'ALT 35,000 ft · SPD 455 kt',
      trendSummary: '↑ 1,200 fpm',
      trendLine: 'Climbing +1,200 fpm',
      headingLine: 'HDG 270°',
    },
  })
  assert.equal(
    withTelemetry,
    'DAL123 · Narrowbody Jet\nALT 35,000 ft · SPD 455 kt · ↑ 1,200 fpm · HDG 270°\nClimbing +1,200 fpm · HDG 270°',
  )

  const withoutTelemetry = buildPlanePopupText({
    properties: {
      identifier: 'UA444',
      planeType: 'Widebody Jet',
      metricLine: 'No telemetry',
      trendLine: 'Level',
      headingLine: 'HDG 12°',
    },
  })
  assert.equal(
    withoutTelemetry,
    'UA444 · Widebody Jet\nALT — · SPD — · Level · HDG 12°\nLevel · HDG 12°',
  )

  const withOperationalContext = buildPlanePopupText({
    properties: {
      identifier: 'UA444',
      planeType: 'Boeing 777',
      metricLine: 'ALT 37,000 ft · SPD 490 kt',
      trendSummary: '↓ -560 fpm',
      trendLine: 'Descending -560 fpm',
      distanceLine: '11 nmi',
      phaseLine: 'GND',
      headingLine: 'HDG 272°',
    },
  })
  assert.equal(
    withOperationalContext,
    'UA444 · Boeing 777\nALT 37,000 ft · SPD 490 kt · ↓ -560 fpm · 11 nmi · GND · HDG 272°\nDescending -560 fpm · GND · HDG 272°',
  )
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

test('buildOverlayPadding normalizes panel width inputs into map padding', () => {
  assert.deepEqual(buildOverlayPadding(0, 0), {
    left: 16,
    right: 16,
    top: 16,
    bottom: 16,
  })
  assert.deepEqual(buildOverlayPadding(50, 120), {
    left: 60,
    right: 130,
    top: 16,
    bottom: 16,
  })
  assert.deepEqual(buildOverlayPadding(-20, 'abc'), {
    left: 16,
    right: 16,
    top: 16,
    bottom: 16,
  })
  assert.deepEqual(buildOverlayPadding('220.9', 50.2), {
    left: 231,
    right: 60,
    top: 16,
    bottom: 16,
  })
})

test('resolveRecenterDecision triggers recenter on offscreen target', () => {
  const decision = resolveRecenterDecision({
    width: 900,
    height: 600,
    targetPoint: { x: 20, y: 300 },
    leftPanelWidth: 240,
    rightPanelWidth: 50,
    selectedChanged: false,
    insetsChanged: false,
  })

  assert.equal(decision?.padding.left, 250)
  assert.equal(decision?.padding.right, 60)
  assert.equal(decision?.duration, 220)
  assert.equal(decision?.isOffCanvas, true)
})

test('resolveRecenterDecision keeps selected plane anchored while throttling repeated follows', () => {
  const first = resolveRecenterDecision({
    width: 1200,
    height: 800,
    targetPoint: { x: 1200, y: 400 },
    leftPanelWidth: 0,
    rightPanelWidth: 0,
    selectedChanged: false,
    insetsChanged: false,
    nowMs: 5_000,
    lastAutoFollowMs: 0,
  })
  assert.equal(first?.duration, 220)

  const throttled = resolveRecenterDecision({
    width: 1200,
    height: 800,
    targetPoint: { x: 1200, y: 400 },
    leftPanelWidth: 0,
    rightPanelWidth: 0,
    selectedChanged: false,
    insetsChanged: false,
    nowMs: 5_600,
    lastAutoFollowMs: 5_000,
  })
  assert.equal(throttled, null)

  const bypassSelectionChange = resolveRecenterDecision({
    width: 1200,
    height: 800,
    targetPoint: { x: 1200, y: 400 },
    leftPanelWidth: 0,
    rightPanelWidth: 0,
    selectedChanged: true,
    insetsChanged: false,
    nowMs: 5_600,
    lastAutoFollowMs: 4_500,
  })
  assert.equal(bypassSelectionChange?.duration, 300)
})

test('resolveRecenterDecision respects force and user gesture states for stable UX', () => {
  const noForceDuringGesture = resolveRecenterDecision({
    width: 900,
    height: 600,
    targetPoint: { x: 400, y: 300 },
    leftPanelWidth: 0,
    rightPanelWidth: 0,
    selectedChanged: false,
    insetsChanged: false,
    userCameraGesture: true,
    nowMs: 1000,
    lastAutoFollowMs: 0,
  })
  assert.equal(noForceDuringGesture, null)

  const forcedDuringGesture = resolveRecenterDecision({
    width: 900,
    height: 600,
    targetPoint: { x: 400, y: 300 },
    leftPanelWidth: 0,
    rightPanelWidth: 0,
    selectedChanged: false,
    insetsChanged: false,
    userCameraGesture: true,
    force: true,
    nowMs: 1000,
    lastAutoFollowMs: 900,
  })
  assert.equal(typeof forcedDuringGesture, 'object')
  assert.equal(forcedDuringGesture?.duration, 220)
})
