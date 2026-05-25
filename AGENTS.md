# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Commands

```sh
npm run dev      # start dev server (with API proxies)
npm run build    # production build
npm run lint     # ESLint check
npm run preview  # preview production build locally
```

No test suite exists. The lint + build pair is the pre-merge gate.

## Git workflow

- Always rebase your branch on `origin/main` before opening a PR so changes integrate cleanly.

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

`App.jsx` owns all state: `selectedId`, `track`, `theme`. Everything else is derived. The `theme` string (`'dark'|'light'`) is threaded as a prop to every component — HUDBar, FlightMap, NearbyList, FlightDetail all receive it.

### Component responsibilities

- **HUDBar** — top status bar: live count, weather, clock, theme toggle. Receives `theme` + `onThemeToggle`.
- **NearbyList** — left sidebar listing flights sorted by distance from JFK. Width 442px (scaled). Click selects a flight.
- **FlightMap** — MapLibre GL map filling remaining space. Manages its own map lifecycle via refs. Re-initializes on `theme` change (dependency in the init `useEffect`). Displays runways, plane icons (SDF), hotel marker, flight path, and runway bearing preset buttons.
- **FlightDetail** — absolute overlay (`detail-overlay` CSS class, 594px wide) sliding in from the right without reflowing the map. Shows aircraft dossier, route, live telemetry, altitude profile, and interactive altitude history chart.
- **FlightPath** — SVG altitude chart with hover interaction, rendered inside FlightDetail.
- **AircraftSilhouette** — pure SVG top-down aircraft drawings, categorized by type code (narrowbody / widebody / quad / regional / turboprop). Used when no aircraft photo is available.

### Map layer stack (MapLibre GL)

The map is initialized once in a `useEffect`. Layer order from bottom:
1. CartoDB raster tiles (dark or light based on `theme`)
2. `runways-glow` — thick blurred runway highlight
3. `runways-surface` — paved area
4. `runways-center` — dashed centerline
5. `path-line` — selected flight's historical track (dashed, updated via `setData`)
6. `planes-layer` — SDF symbol layer for all aircraft icons (rotated by heading, tinted by selection state)

DOM markers (not map layers): runway threshold labels, TWA Hotel dot, pulse-ring on selected flight.

### UX guardrails

- Do not add large static location/airport cards on top of the map. They obstruct flight interactions and reduce map readability.
- If location context is needed, use compact non-interactive markers on the map and put rich metadata in side panels (HUD/FlightDetail), not floating map cards.

### Supplemental data

`src/data/aviationFacts.js` provides offline aircraft specs (`AIRCRAFT_FACTS` keyed by ICAO type code) and airline facts (`AIRLINE_FACTS` keyed by ICAO airline prefix). This supplements ADSBDB lookups and handles the common case where only a type code is known.

`src/utils/aircraft.js` contains the ICAO callsign prefix → airline name lookup table and aircraft category classification (`NARROW_BODY`, `WIDE_BODY_TWIN`, `QUAD_JET`, `REGIONAL_JET`, `TURBOPROP` sets).

### Styling conventions

All styling is inline React styles. CSS variables in `index.css` `:root` handle the color system; `[data-theme="light"]` overrides them for light mode. The `--panel` variable is set to a translucent `rgba()` value so `backdropFilter: blur()` works on panels.

UI is scaled **1.65×** from a 14px base — all pixel values in components reflect this (e.g., HUDBar height 86px, NearbyList width 442px, FlightDetail width 594px, body `font-size: 23px`). When adding new UI, multiply your reference px values by 1.65.
