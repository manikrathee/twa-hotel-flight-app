import { useState, useMemo, useEffect } from 'react'
import { metersToFeet } from '../utils/geo'

const COUNTRY_SAMPLE_LIMIT = 8
const COUNTRY_REQUEST_TIMEOUT_MS = 5000
const COUNTRY_CACHE = new Map()

export default function FlightPath({ track, route, countries = [], onCountryTrail }) {
  const [hoverIdx, setHoverIdx] = useState(null)

  const points = useMemo(() => {
    if (!track?.path) return []
    return track.path
      .filter(p => p[1] != null && p[2] != null)
      .map(p => ({
        time: p[0],
        lat: p[1],
        lon: p[2],
        altM: p[3],
        heading: p[4],
        onGround: p[5],
      }))
  }, [track])

  const phases = useMemo(() => deriveAltitudePhases(points), [points])
  const destinationAltFt = route?.destination?.elevation_ft == null ? null : Number(route.destination.elevation_ft)

  useEffect(() => {
    let cancelled = false
    if (!points.length) {
      onCountryTrail?.([])
      return
    }

    ;(async () => {
      try {
        const countries = await resolveTrackCountries(points)
        if (cancelled) return
        onCountryTrail?.(countries)
      } catch {
        if (cancelled) return
        onCountryTrail?.([])
      }
    })()

    return () => { cancelled = true }
  }, [onCountryTrail, points])

  if (!points.length) return (
    <div style={{ color: 'var(--text-dim)', fontSize: 12, textAlign: 'center', padding: 12 }}>
      No path data
    </div>
  )

  const startTime = points[0].time
  const endTime = points[points.length - 1].time
  const totalSec = endTime - startTime || 1

  const altitudes = points.map(p => metersToFeet(p.altM || 0))
  const maxAlt = Math.max(...altitudes, 1)
  const minAlt = 0

  const W = 300
  const H = 70

  // Build SVG polyline points
  const svgPoints = points.map((p, i) => {
    const x = ((p.time - startTime) / totalSec) * W
    const y = H - ((altitudes[i] - minAlt) / (maxAlt - minAlt)) * H
    return `${x},${y}`
  }).join(' ')

  // Fill area under curve
  const fillPoints = `0,${H} ${svgPoints} ${W},${H}`

  const hovered = hoverIdx !== null ? points[hoverIdx] : null

  const maxAltFt = Math.round(maxAlt / 100) * 100
  const maxAltLabel = maxAltFt >= 1000 ? `${Math.round(maxAltFt / 1000)}k` : `${maxAltFt}`

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, alignItems: 'baseline' }}>
        <span style={{ fontSize: 12, color: 'var(--text-dim)', fontWeight: 600 }}>
          ALTITUDE HISTORY
        </span>
        <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>
          {formatDuration(totalSec)} tracked
        </span>
      </div>

      {/* Altitude chart */}
      <div style={{
        position: 'relative',
        border: '1px solid var(--border)',
        borderRadius: 8,
        overflow: 'hidden',
        background: 'var(--panel-chart)',
      }}>
        <svg
          width="100%"
          viewBox={`0 0 ${W} ${H}`}
          style={{ display: 'block', cursor: 'crosshair' }}
          onMouseMove={e => {
            const rect = e.currentTarget.getBoundingClientRect()
            const ratio = (e.clientX - rect.left) / rect.width
            const idx = Math.round(ratio * (points.length - 1))
            setHoverIdx(Math.max(0, Math.min(points.length - 1, idx)))
          }}
          onMouseLeave={() => setHoverIdx(null)}
        >
          {/* Background grid */}
          {[0.25, 0.5, 0.75].map(f => (
            <line key={f} x1="0" y1={H * (1 - f)} x2={W} y2={H * (1 - f)}
              stroke="rgba(var(--text-soft-rgb), 0.12)" strokeWidth="1" />
          ))}

          {/* Fill */}
          <defs>
            <linearGradient id="altFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" style={{ stopColor: 'var(--cyan-alt)', stopOpacity: 0.25 }} />
              <stop offset="100%" style={{ stopColor: 'var(--cyan-alt)', stopOpacity: 0.02 }} />
            </linearGradient>
          </defs>
          <polygon points={fillPoints} fill="url(#altFill)" />

          {/* Line */}
          <polyline
            points={svgPoints}
            fill="none"
            stroke="var(--cyan-alt)"
            strokeWidth="1.5"
            strokeLinejoin="round"
            style={{
              strokeDasharray: 560,
              strokeDashoffset: 560,
              animation: 'path-draw 0.8s ease forwards',
            }}
          />

          {/* Hover line */}
          {hoverIdx !== null && (() => {
            const p = points[hoverIdx]
            const x = ((p.time - startTime) / totalSec) * W
            const y = H - ((altitudes[hoverIdx] - minAlt) / (maxAlt - minAlt)) * H
            return (
              <g>
                <line x1={x} y1="0" x2={x} y2={H} stroke="rgba(var(--text-soft-rgb), 0.22)" strokeWidth="1" />
                <circle cx={x} cy={y} r="3" fill="var(--cyan-alt)" />
              </g>
            )
          })()}
        </svg>
      </div>

      {/* Hover tooltip */}
      <div style={{
        marginTop: 6, height: 28, display: 'flex', alignItems: 'center',
        gap: 12, fontSize: 12,
      }}>
        {hovered ? (
          <>
            <span style={{ color: 'var(--text-dim)' }}>{formatTime(hovered.time)}</span>
            <span style={{ color: 'var(--cyan)', fontWeight: 600 }}>
              {metersToFeet(hovered.altM || 0).toLocaleString()} ft
            </span>
            {hovered.heading != null && (
              <span style={{ color: 'var(--text-dim)' }}>HDG {Math.round(hovered.heading)}°</span>
            )}
          </>
        ) : (
          <span style={{ color: 'var(--text-dim)' }}>
            {formatTime(startTime)} → {formatTime(endTime)}
            {' · '}{maxAltLabel} ft max
          </span>
        )}
      </div>

      {/* Progress dots */}
      <div style={{
        marginTop: 6,
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        fontSize: 12,
        color: 'var(--text-dim)',
      }}>
        <span style={{
          width: 8, height: 8, borderRadius: '50%',
          background: 'var(--green)', display: 'inline-block',
        }} />
        <span>Departed</span>
        <div style={{ flex: 1, height: 1, background: 'var(--border)', margin: '0 4px' }} />
        <span style={{
          width: 8, height: 8, borderRadius: '50%',
          background: 'var(--cyan)', display: 'inline-block',
          boxShadow: '0 0 6px var(--cyan)',
          animation: 'pulse-dot 1.4s ease-in-out infinite',
        }} />
        <span style={{ color: 'var(--cyan)' }}>Now</span>
      </div>

      {phases.length > 0 && (
        <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', fontWeight: 600, letterSpacing: 0.2 }}>
            ALTITUDE PHASES
          </div>
          {phases.map((phase, index) => {
            const nextPhase = phases[index + 1]
            return (
              <div key={`${phase.type}-${index}-${phase.startIndex}`} style={{
                background: 'var(--panel-soft)',
                border: '1px solid var(--panel-border)',
                borderLeft: `3px solid ${phaseColor(phase.type)}`,
                borderRadius: 6,
                padding: '8px 10px',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12 }}>
                  <span style={{ color: 'var(--heading)', fontWeight: 700, letterSpacing: 0.2 }}>
                    {phase.type}
                  </span>
                  <span style={{ color: 'var(--text-dim)' }}>
                    {formatPhaseTime(phase.durationSec)}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 3 }}>
                  {`Altitude ${phase.startAlt.toLocaleString()} → ${phase.endAlt.toLocaleString()} ft`}
                </div>
                <div style={{ marginTop: 4, fontSize: 11, color: 'var(--cyan)', lineHeight: 1.4 }}>
                  {phaseForecast(phase, destinationAltFt, nextPhase)}
                </div>
                {nextPhase && (
                  <div style={{ marginTop: 4, fontSize: 11, color: 'var(--text-dim)' }}>
                    Next transition target: {nextPhase.startAlt.toLocaleString()} ft start · {nextPhase.durationSec ? `${nextPhase.durationSec}s` : ''}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {countries.length > 0 && (
        <div style={{ marginTop: 12, borderTop: '1px solid var(--panel-line)', paddingTop: 10 }}>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', fontWeight: 600, letterSpacing: 0.2, marginBottom: 6 }}>
            COUNTRIES ALONG TRACK
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
            {countries.map(country => (
              <span key={country} style={{
                padding: '3px 8px',
                borderRadius: 999,
                fontSize: 11,
                background: 'rgba(var(--cyan-alt-rgb), 0.12)',
                border: '1px solid rgba(var(--cyan-alt-rgb), 0.34)',
                color: 'var(--text)',
                letterSpacing: 0.1,
              }}>
                {country}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(sec) {
  const d = new Date(sec * 1000)
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/New_York' })
}

function formatDuration(sec) {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function formatPhaseTime(sec) {
  if (!Number.isFinite(sec) || sec <= 0) return '0s'
  if (sec >= 3600) return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`
  if (sec >= 60) return `${Math.floor(sec / 60)}m`
  return `${sec}s`
}

function phaseColor(type) {
  if (type === 'CLIMB') return 'var(--green)'
  if (type === 'DESCENT') return 'var(--amber)'
  if (type === 'CRUISE') return 'var(--cyan)'
  return 'var(--text-dim)'
}

function phaseForecast(phase, destinationAltFt, nextPhase) {
  if (!phase) return 'No phase summary'

  if (phase.type === 'CLIMB') {
    if (nextPhase && nextPhase.type === 'CRUISE') {
      return `Climb target is likely ~${Math.round(phase.maxAlt).toLocaleString()} ft before cruise.` 
    }
    return 'Climb trend active; expect higher altitude gain until cruise profile holds.'
  }

  if (phase.type === 'CRUISE') {
    if (Number.isFinite(destinationAltFt) && destinationAltFt >= 0) {
      return `Cruising near ${Math.round(phase.avgAlt).toLocaleString()} ft. Arrival target from destination metadata: ${Math.round(destinationAltFt).toLocaleString()} ft`
    }
    return `Cruising near ${Math.round(phase.avgAlt).toLocaleString()} ft; altitude trend is flat.`
  }

  if (phase.type === 'DESCENT') {
    const target = Number.isFinite(destinationAltFt) && destinationAltFt >= 0 ? Math.round(destinationAltFt) : 0
    return `Descending profile is tracking toward ${target.toLocaleString()} ft at destination.`
  }

  return 'Ground segment / takeoff roll.'
}

function classifyPhase(deltaFtPerMin) {
  const abs = Math.abs(deltaFtPerMin)
  if (abs <= 250) return 'CRUISE'
  return deltaFtPerMin > 0 ? 'CLIMB' : 'DESCENT'
}

function deriveAltitudePhases(points) {
  if (points.length < 2) return []

  const segments = []
  let segmentStart = 0
  let currentType = null

  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1]
    const cur = points[i]
    const dt = Math.max(1, cur.time - prev.time)
    const delta = metersToFeet(cur.altM || 0) - metersToFeet(prev.altM || 0)
    const type = prev.onGround || cur.onGround ? 'GROUND' : classifyPhase((delta / dt) * 60)

    if (currentType === null) {
      currentType = type
      continue
    }

    if (type !== currentType) {
      const segment = buildPhaseSegment(points, segmentStart, i - 1, currentType)
      if (segment) segments.push(segment)
      segmentStart = i - 1
      currentType = type
    }
  }

  const final = buildPhaseSegment(points, segmentStart, points.length - 1, currentType)
  if (final) segments.push(final)

  return segments
    .filter(Boolean)
    .filter((segment, index, list) => {
      if (segment.type === 'GROUND' && index !== list.length - 1) return false
      return segment.durationSec >= 20 || list.length === 1
    })
}

function buildPhaseSegment(points, startIndex, endIndex, type) {
  const slice = points.slice(startIndex, endIndex + 1)
  if (!slice.length) return null
  const first = slice[0]
  const last = slice[slice.length - 1]

  if (!Number.isFinite(first.time) || !Number.isFinite(last.time)) return null

  const startAlt = metersToFeet(first.altM || 0)
  const endAlt = metersToFeet(last.altM || 0)
  const alts = slice.map(p => metersToFeet(p.altM || 0))
  const minAlt = Math.min(...alts, startAlt)
  const maxAlt = Math.max(...alts, startAlt)

  return {
    type,
    startIndex,
    endIndex,
    startTime: first.time,
    endTime: last.time,
    durationSec: Math.max(1, last.time - first.time),
    startAlt: Math.round(startAlt),
    endAlt: Math.round(endAlt),
    avgAlt: Math.round((startAlt + endAlt) / 2),
    minAlt: Math.round(minAlt),
    maxAlt: Math.round(maxAlt),
  }
}

async function resolveTrackCountries(points) {
  const indices = sampleIndices(points.length, COUNTRY_SAMPLE_LIMIT)
  const seen = new Set()
  const countries = []

  for (const idx of indices) {
    const point = points[idx]
    const lat = Number(point.lat)
    const lon = Number(point.lon)
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue

    const country = await reverseGeoCountry(lat, lon)
    if (!country) continue

    if (!seen.has(country)) {
      seen.add(country)
      countries.push(country)
    }
  }

  return countries
}

async function reverseGeoCountry(lat, lon) {
  const key = `${lat.toFixed(2)},${lon.toFixed(2)}`
  if (COUNTRY_CACHE.has(key)) return COUNTRY_CACHE.get(key)

  const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}&localityLanguage=en`
  const response = await fetch(url, { signal: AbortSignal.timeout(COUNTRY_REQUEST_TIMEOUT_MS) })
  if (!response.ok) return null

  const data = await response.json()
  const country = (data?.countryName || data?.country || data?.country_name || '').trim()
  const resolved = country || null
  COUNTRY_CACHE.set(key, resolved)
  return resolved
}

function sampleIndices(total, maxSamples) {
  if (total <= maxSamples) return [...Array(total).keys()]

  const step = (total - 1) / (maxSamples - 1)
  const seen = new Set()
  const idxs = []

  for (let i = 0; i < maxSamples; i += 1) {
    const idx = Math.round(i * step)
    if (!seen.has(idx)) {
      seen.add(idx)
      idxs.push(idx)
    }
  }
  return idxs
}
