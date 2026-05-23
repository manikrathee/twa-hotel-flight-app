// Draw plane icon to canvas ImageData — synchronous, no SVG/fetch needed
export function createPlaneImageData() {
  const size = 32
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, size, size)
  ctx.fillStyle = 'white'
  ctx.beginPath()
  // Plane pointing up (north), classic silhouette
  ctx.moveTo(16, 1)
  ctx.lineTo(20, 13)
  ctx.lineTo(31, 16)
  ctx.lineTo(20, 18)
  ctx.lineTo(18.5, 30)
  ctx.lineTo(16, 27)
  ctx.lineTo(13.5, 30)
  ctx.lineTo(12, 18)
  ctx.lineTo(1, 16)
  ctx.lineTo(12, 13)
  ctx.closePath()
  ctx.fill()
  return ctx.getImageData(0, 0, size, size)
}

export function buildPlaneFeatures(flights, selectedIcao) {
  return flights
    .filter(f => f.icao24 != null && f.latitude != null && f.longitude != null)
    .map(f => ({
      type: 'Feature',
      properties: {
        icao24: f.icao24,
        callsign: (f.callsign || f.icao24).trim(),
        heading: f.heading || 0,
        selected: f.icao24 === selectedIcao,
      },
      geometry: { type: 'Point', coordinates: [f.longitude, f.latitude] },
    }))
}

export function buildPlaneSourceDiff(features, prevSet) {
  const nextSet = new Set()
  const add = []
  const update = []

  // updateData requires GeoJSONFeatureDiff shape for update entries.
  for (const f of features) {
    const id = f.properties.icao24
    nextSet.add(id)
    if (prevSet.has(id)) {
      update.push({
        id,
        newGeometry: f.geometry,
        addOrUpdateProperties: Object.entries(f.properties).map(([key, value]) => ({ key, value })),
      })
    } else {
      add.push(f)
    }
  }

  const remove = []
  for (const id of prevSet) {
    if (!nextSet.has(id)) remove.push(id)
  }

  return { add, update, remove, nextSet }
}

export function getTrackCoordinates(track, cutoffSec) {
  if (!track?.path?.length) return []

  const recentPath = track.path.filter(p => p[0] >= cutoffSec)
  const pathToUse = recentPath.length >= 2 ? recentPath : track.path

  return pathToUse
    .filter(p => p[1] != null && p[2] != null)
    .map(p => [p[2], p[1]]) // [lng, lat]
}
