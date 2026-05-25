export function normalizeFlightState(raw) {
  const latitude = toFiniteNumber(raw?.latitude)
  const longitude = toFiniteNumber(raw?.longitude)
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null

  const altitude = toFiniteNumber(raw?.baro_altitude)
  const verticalRate = toFiniteNumber(raw?.vertical_rate)
  const heading = toFiniteNumber(raw?.heading)
  const velocity = toFiniteNumber(raw?.velocity)
  const geoAltitude = toFiniteNumber(raw?.geo_altitude)
  const squawk = raw?.squawk == null ? null : String(raw.squawk).trim()

  return {
    ...raw,
    icao24: String(raw?.icao24 || '').trim().toLowerCase(),
    callsign: String(raw?.callsign || '').trim(),
    latitude,
    longitude,
    baro_altitude: Number.isFinite(altitude) ? altitude : null,
    geo_altitude: Number.isFinite(geoAltitude) ? geoAltitude : null,
    vertical_rate: Number.isFinite(verticalRate) ? verticalRate : null,
    heading: Number.isFinite(heading) ? heading : null,
    velocity: Number.isFinite(velocity) ? velocity : null,
    squawk,
  }
}

export function buildPositionedSamples(raw) {
  return raw
    .map(normalizeFlightState)
    .filter(Boolean)
}

function toFiniteNumber(value) {
  if (value == null) return null
  if (typeof value === 'string' && value.trim() === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}
