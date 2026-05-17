# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```sh
npm run dev      # start dev server (with API proxies)
npm run build    # production build
npm run lint     # ESLint check
npm run preview  # preview production build locally
```

No test suite exists. The lint + build pair is the pre-merge gate.

## Environment

Create a `.env.local` at the root for authenticated OpenSky access:
```
VITE_OPENSKY_CLIENT_ID=...
VITE_OPENSKY_CLIENT_SECRET=...
```

Without these, the app falls back to unauthenticated OpenSky requests (lower rate limit). The `openskyAuth.js` module silently skips auth if the env vars are absent.

All external APIs are proxied through Vite (`vite.config.js`) to avoid CORS:
- `/api/opensky` → `opensky-network.org/api`
- `/api/opensky-auth` → OpenSky OAuth token endpoint
- `/api/adsbdb` → `api.adsbdb.com`
- `/api/weather` → `api.open-meteo.com`

## Architecture

### Data flow

```
useFlights (poll 15s)          useWeather (poll 5min)
    └─ api/opensky.js               └─ api/weather.js
         └─ api/openskyAuth.js

App.jsx  ──── selectedFlight ────►  useFlightDetail (per-selection)
              track / route                └─ api/opensky.js (track)
              aircraftInfo                 └─ api/adsbdb.js (route + aircraft)
```

`App.jsx` owns all state: `selectedId`, `track`, `listWidth`, `detailWidth`. Everything else is derived.

### Component responsibilities

- **HUDBar** — top status bar: live count, weather, clock, API state, and panel width controls.
- **NearbyList** — left sidebar listing flights sorted by distance from JFK. Width is adjustable from the HUD.
- **FlightMap** — MapLibre GL map filling remaining space. Manages its own map lifecycle via refs. Displays runways, plane icons (SDF), hotel marker, flight path, and runway bearing preset buttons.
- **FlightDetail** — absolute overlay (`detail-overlay` CSS class) sliding in from the right without reflowing the map. Width is adjustable from the HUD.
- **FlightPath** — SVG altitude chart with hover interaction, rendered inside FlightDetail.
- **AircraftSilhouette** — pure SVG top-down aircraft drawings, categorized by type code (narrowbody / widebody / quad / regional / turboprop). Used when no aircraft photo is available.

### Map layer stack (MapLibre GL)

The map is initialized once in a `useEffect`. Layer order from bottom:
1. CartoDB dark raster tiles
2. `runways-glow` — thick blurred runway highlight
3. `runways-surface` — paved area
4. `runways-center` — dashed centerline
5. `path-line` — selected flight's historical track (dashed, updated via `setData`)
6. `planes-layer` — SDF symbol layer for all aircraft icons (rotated by heading, tinted by selection state)

DOM markers (not map layers): runway threshold labels, TWA Hotel dot, pulse-ring on selected flight.

### Supplemental data

`src/data/aviationFacts.js` provides offline aircraft specs (`AIRCRAFT_FACTS` keyed by ICAO type code) and airline facts (`AIRLINE_FACTS` keyed by ICAO airline prefix). This supplements ADSBDB lookups and handles the common case where only a type code is known.

`src/utils/aircraft.js` contains the ICAO callsign prefix → airline name lookup table and aircraft category classification (`NARROW_BODY`, `WIDE_BODY_TWIN`, `QUAD_JET`, `REGIONAL_JET`, `TURBOPROP` sets).

### Styling conventions

Styling is mostly inline React styles with shared CSS tokens in `src/index.css`. Typography is Inter-first with a compact 12–14px baseline and single dark theme.
