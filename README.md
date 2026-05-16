# TWA Hotel Flight App

Live JFK-area traffic display for the TWA Hotel.

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
