const R = 6371 // Earth radius in km

export function distanceKm(lat1, lon1, lat2, lon2) {
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function distanceMiles(lat1, lon1, lat2, lon2) {
  return distanceKm(lat1, lon1, lat2, lon2) * 0.621371
}

function toRad(deg) {
  return (deg * Math.PI) / 180
}

export function bearingDeg(lat1, lon1, lat2, lon2) {
  const dLon = toRad(lon2 - lon1)
  const y = Math.sin(dLon) * Math.cos(toRad(lat2))
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon)
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
}

export function metersToFeet(m) {
  if (m === null || m === undefined || m === '') return null
  const value = Number(m)
  if (!Number.isFinite(value)) return null
  return Math.round(value * 3.28084)
}

export function msToKnots(ms) {
  if (ms === null || ms === undefined || ms === '') return null
  const value = Number(ms)
  if (!Number.isFinite(value)) return null
  return Math.round(value * 1.94384)
}

export function mphToKnots(mph) {
  if (mph === null || mph === undefined || mph === '') return null
  const value = Number(mph)
  if (!Number.isFinite(value)) return null
  return Math.round(value * 0.868976)
}

export function headingToCardinal(deg) {
  if (deg === null || deg === undefined) return '—'
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']
  return dirs[Math.round(((deg % 360) + 360) % 360 / 22.5) % 16]
}

// Vertical rate in m/s → fpm
export function msTofpm(ms) {
  if (ms === null || ms === undefined || ms === '') return null
  const value = Number(ms)
  if (!Number.isFinite(value)) return null
  return Math.round(value * 196.85)
}
