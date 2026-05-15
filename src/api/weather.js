// JFK coordinates
const LAT = 40.6413
const LON = -73.7781

export async function fetchWeather() {
  const url = `/api/weather/v1/forecast?latitude=${LAT}&longitude=${LON}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,wind_gusts_10m,visibility&wind_speed_unit=mph&temperature_unit=fahrenheit&timezone=America%2FNew_York`
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
  if (!res.ok) throw new Error(`Weather ${res.status}`)
  const data = await res.json()
  return data.current
}

export function weatherCodeToCondition(code) {
  if (code === 0) return 'Clear'
  if (code <= 3) return 'Partly Cloudy'
  if (code <= 49) return 'Foggy'
  if (code <= 59) return 'Drizzle'
  if (code <= 69) return 'Rain'
  if (code <= 79) return 'Snow'
  if (code <= 82) return 'Showers'
  if (code <= 89) return 'Hail'
  if (code <= 99) return 'Thunderstorm'
  return 'Unknown'
}

// Estimate which JFK runways are active based on wind direction
// JFK runways: 04L/22R, 04R/22L, 13L/31R, 13R/31L
export function estimateActiveRunways(windDeg) {
  if (windDeg === null || windDeg === undefined) return []
  const w = ((windDeg % 360) + 360) % 360
  // Aircraft land into the wind. Runway is preferred if wind within 45deg of runway heading.
  const runways = [
    { name: '04L/04R', heading: 40 },
    { name: '22L/22R', heading: 220 },
    { name: '13L/13R', heading: 130 },
    { name: '31L/31R', heading: 310 },
  ]
  const active = runways.filter(r => {
    const diff = Math.abs(((w - r.heading + 540) % 360) - 180)
    return diff < 60
  })
  return active.map(r => r.name)
}
