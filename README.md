# TWA Hotel Flight App

Live traffic display constrained to the immediate JFK/TWA airspace:
- 1-mile radius around JFK for map + OpenSky state query.
- Flights whose resolved route is to or from JFK.
- Final display filtered to aircraft within visual range of the TWA Hotel.

## Screenshots

### Loading

<img src="docs/screenshots/01-loading.png" alt="Loading state while acquiring traffic" width="900">

### API Error

<img src="docs/screenshots/02-api-error.png" alt="OpenSky API error state" width="900">

### Traffic Overview

<img src="docs/screenshots/03-traffic-overview.png" alt="JFK traffic map overview with nearby aircraft list" width="900">

### Flight Detail

<img src="docs/screenshots/04-flight-detail.png" alt="Selected flight detail panel with aircraft and airline dossiers" width="900">

### Flight Path

<img src="docs/screenshots/05-flight-path.png" alt="Expanded flight path and altitude history view" width="900">

## Data Sources

- OpenSky Network state vectors: live ADS-B position, altitude, speed, heading, vertical rate, squawk.
- ADSBDB: selected-flight aircraft registration, type/manufacturer/model, owner/operator, aircraft photo, airline, origin, and destination.
- Local supplemental facts: broad aircraft type specs and airline founding/headquarters data for richer detail when only a few aircraft are visible from the hotel.

Supplemental aircraft values are intentionally approximate operating context, not dispatch data. Seat counts vary by airline cabin layout.

## Development

```sh
npm install
npm run dev
```

## Gate

```sh
npm run lint
npm run build
```
