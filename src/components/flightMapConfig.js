export const TWA_HOTEL = [-73.7783, 40.6414]

// Initial camera: standing at TWA Hotel looking NW down runway 31L/13R approach path
// Pitch 52deg = strong perspective. Bearing 312deg = NW up, runway center goes toward horizon.
export const INITIAL_VIEW = {
  center: [-73.778, 40.638],
  zoom: 14.2,
  pitch: 52,
  bearing: 312,
}

// CartoDB dark raster + vector overlays (no API key needed)
export const MAP_STYLE = {
  version: 8,
  sources: {
    carto: {
      type: 'raster',
      tiles: [
        'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
        'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
        'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
      ],
      tileSize: 256,
      maxzoom: 20,
    },
  },
  layers: [{ id: 'carto-raster', type: 'raster', source: 'carto' }],
  glyphs: 'https://fonts.openmaptiles.org/{fontstack}/{range}.pbf',
}

const RUNWAY_DEFS = [
  {
    id: '04L/22R',
    width: 150,
    surface: 'CONC',
    lengthFt: 12079,
    endpoints: [[-73.7895, 40.6173], [-73.7648, 40.6652]],
  },
  {
    id: '04R/22L',
    width: 150,
    surface: 'ASPH',
    lengthFt: 8400,
    endpoints: [[-73.7841, 40.6169], [-73.7594, 40.6648]],
  },
  {
    id: '13L/31R',
    width: 200,
    surface: 'CONC',
    lengthFt: 10000,
    endpoints: [[-73.7973, 40.6556], [-73.7469, 40.626]],
  },
  {
    id: '13R/31L',
    width: 200,
    surface: 'CONC',
    lengthFt: 14511,
    endpoints: [[-73.8016, 40.6511], [-73.7592, 40.6225]],
  },
]

// JFK runway centerlines (FAA-approximate coordinates)
export const JFK_RUNWAYS = {
  type: 'FeatureCollection',
  features: RUNWAY_DEFS.map((runway) => {
    const [start, end] = runway.endpoints
    return {
      type: 'Feature',
      properties: {
        id: runway.id,
        width: runway.width,
        surface: runway.surface,
        lengthFt: runway.lengthFt,
      },
      geometry: { type: 'LineString', coordinates: [start, end] },
    }
  }),
}

// Runway labels (threshold positions for text placement)
export const RUNWAY_LABELS = {
  type: 'FeatureCollection',
  features: JFK_RUNWAYS.features.flatMap((feature) => {
    const [start, end] = feature.geometry.coordinates
    const [startLabel, endLabel] = String(feature.properties.id || '').split('/')
    return [
      { type: 'Feature', properties: { label: startLabel }, geometry: { type: 'Point', coordinates: start } },
      { type: 'Feature', properties: { label: endLabel }, geometry: { type: 'Point', coordinates: end } },
    ]
  }),
}
