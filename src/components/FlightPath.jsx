import { useState, useMemo } from 'react'
import { metersToFeet } from '../utils/geo'

export default function FlightPath({ track }) {
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

  function formatTime(sec) {
    const d = new Date(sec * 1000)
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/New_York' })
  }

  function formatDuration(sec) {
    const h = Math.floor(sec / 3600)
    const m = Math.floor((sec % 3600) / 60)
    return h > 0 ? `${h}h ${m}m` : `${m}m`
  }

  const hovered = hoverIdx !== null ? points[hoverIdx] : null

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
        background: 'rgba(5,12,18,0.78)',
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
              stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
          ))}

          {/* Fill */}
          <defs>
            <linearGradient id="altFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#00c3ff" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#00c3ff" stopOpacity="0.02" />
            </linearGradient>
          </defs>
          <polygon points={fillPoints} fill="url(#altFill)" />

          {/* Line */}
          <polyline
            points={svgPoints}
            fill="none"
            stroke="#00c3ff"
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
                <line x1={x} y1="0" x2={x} y2={H} stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
                <circle cx={x} cy={y} r="3" fill="#00c3ff" />
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
            <span style={{ color: 'var(--cyan)', fontWeight: 600 }}>{metersToFeet(hovered.altM || 0).toLocaleString()} ft</span>
            {hovered.heading != null && (
              <span style={{ color: 'var(--text-dim)' }}>HDG {Math.round(hovered.heading)}°</span>
            )}
          </>
        ) : (
          <span style={{ color: 'var(--text-dim)' }}>
            {formatTime(startTime)} → {formatTime(endTime)}
            {' · '}{Math.round(maxAlt / 100) * 100 >= 1000 ? `${Math.round(maxAlt / 1000)}k` : maxAlt} ft max
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
    </div>
  )
}
