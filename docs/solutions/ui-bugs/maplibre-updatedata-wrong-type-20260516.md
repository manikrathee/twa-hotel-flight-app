---
name: maplibre-updatedata-wrong-type
description: MapLibre updateData() requires GeoJSONFeatureDiff for update array, not raw GeoJSON.Feature — passing wrong type silently no-ops all updates
metadata:
  type: ui-bug
  component: FlightMap
  library: maplibre-gl@5
  date: 2026-05-16
---

# MapLibre `updateData()` Silent No-op: Wrong Type for `update` Array

## Symptom

Planes rendered correctly on first load but appeared frozen — positions and properties never updated despite live data coming in. No errors thrown. `updateData()` was being called successfully on every tick.

## Root Cause

`GeoJSONSource.updateData()` in MapLibre GL JS v5 accepts different types per field:

| Field    | Accepts                  | Notes                          |
|----------|--------------------------|--------------------------------|
| `add`    | `GeoJSON.Feature[]`      | Same shape as `setData`        |
| `update` | `GeoJSONFeatureDiff[]`   | **NOT** `Feature[]`            |
| `remove` | `(string \| number)[]`   | Feature IDs only               |

`GeoJSONFeatureDiff` is defined in `node_modules/maplibre-gl/dist/maplibre-gl.d.ts` (~lines 2229–2258):

```ts
interface GeoJSONFeatureDiff {
  id: string | number;
  newGeometry?: Geometry;
  addOrUpdateProperties?: { key: string; value: unknown }[];
  removeProperties?: string[];
}
```

The code was passing raw `GeoJSON.Feature` objects in the `update` array — the same objects used for `add`. TypeScript did not catch this because the call compiled without error. At runtime, MapLibre silently ignored every `update` entry, leaving all features frozen at their initial positions.

## Failed Attempts

- Confirmed `promoteId: 'icao24'` was set on the source (required for feature identity — was correct).
- Verified `setData()` initial render was working correctly.
- Confirmed `updateData()` was being called on each data tick with the right feature set.

The API surface looked correct but the shape of `update` objects was wrong, with no runtime warning.

## Solution

**File:** `src/components/FlightMap.jsx`

```js
// WRONG — raw GeoJSON.Feature objects silently no-op in the update array
const update = features.filter(f => prevSet.has(f.properties.icao24))

// CORRECT — map to GeoJSONFeatureDiff format
const update = features
  .filter(f => prevSet.has(f.properties.icao24))
  .map(f => ({
    id: f.properties.icao24,
    newGeometry: f.geometry,
    addOrUpdateProperties: Object.entries(f.properties).map(([key, value]) => ({ key, value })),
  }))
```

Then pass to `updateData()`:

```js
source.updateData({ add, update, remove })
```

Where `add` remains `GeoJSON.Feature[]` and `remove` remains an array of icao24 ID strings.

## How It Was Found

A sub-agent reviewed the code against the installed TypeScript type definitions in `node_modules/maplibre-gl/dist/maplibre-gl.d.ts` and identified the `GeoJSONSourceDiff` interface mismatch. The `update` field was typed as `GeoJSONFeatureDiff[]`, not `Feature[]`.

## Prevention

- **Always check the TypeScript interface for each field of `updateData()`** before writing the call. `add` and `update` are not interchangeable despite being conceptually similar.
- **Verify against the installed type definitions** — blog posts and older examples often show only `add`/`remove` usage and omit `update` entirely.
- Consider adding a runtime shape assertion in development:
  ```js
  if (process.env.NODE_ENV === 'development') {
    update.forEach(u => {
      if (!('id' in u) || 'type' in u) {
        console.error('updateData: update entry looks like a raw Feature, not GeoJSONFeatureDiff', u)
      }
    })
  }
  ```
- `promoteId` must still be configured on the source for `updateData()` to work at all — feature identity relies on it.
