export const JFK = { lat: 40.6413, lon: -73.7781, iata: 'JFK', icao: 'KJFK' }
export const TWA_HOTEL = { lat: 40.6414, lon: -73.7783 }

export const MAP_RADIUS_MI = 1
export const MAP_RADIUS_KM = MAP_RADIUS_MI * 1.609344
export const TWA_VISIBLE_RADIUS_MI = 1

const MILES_PER_LAT_DEG = 69

function latDeltaFromMiles(miles) {
  return miles / MILES_PER_LAT_DEG
}

function lonDeltaFromMiles(miles, latitudeDeg) {
  return miles / (Math.cos((latitudeDeg * Math.PI) / 180) * MILES_PER_LAT_DEG)
}

export function bboxAround(center, radiusMiles) {
  const dLat = latDeltaFromMiles(radiusMiles)
  const dLon = lonDeltaFromMiles(radiusMiles, center.lat)
  return {
    lamin: center.lat - dLat,
    lomin: center.lon - dLon,
    lamax: center.lat + dLat,
    lomax: center.lon + dLon,
  }
}

export const JFK_ONE_MILE_BBOX = bboxAround(JFK, MAP_RADIUS_MI)
export const JFK_ONE_MILE_MAX_BOUNDS = [
  [JFK_ONE_MILE_BBOX.lomin, JFK_ONE_MILE_BBOX.lamin],
  [JFK_ONE_MILE_BBOX.lomax, JFK_ONE_MILE_BBOX.lamax],
]

function normAirport(code) {
  return String(code || '').trim().toUpperCase()
}

export function isJfkAirport(code) {
  const airport = normAirport(code)
  return airport === JFK.iata || airport === JFK.icao
}

export function routeTouchesJfk(route) {
  if (!route) return false
  return (
    isJfkAirport(route?.origin?.iata_code) ||
    isJfkAirport(route?.origin?.icao_code) ||
    isJfkAirport(route?.destination?.iata_code) ||
    isJfkAirport(route?.destination?.icao_code)
  )
}
