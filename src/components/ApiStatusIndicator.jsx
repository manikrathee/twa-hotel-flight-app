import { useState, useEffect } from 'react'

export default function ApiStatusIndicator({ status, backoffUntil, lastUpdated, isStale }) {
  const [remaining, setRemaining] = useState(0)

  useEffect(() => {
    if (status !== 'blocked' || !backoffUntil) return
    const update = () => setRemaining(Math.max(0, Math.ceil((backoffUntil - Date.now()) / 1000)))
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [status, backoffUntil])

  if (status === 'ok' && !isStale) return null

  if (isStale && status === 'ok' && lastUpdated) {
    const staleTime = new Date(Number(lastUpdated)).toUTCString().slice(17, 25)
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginRight: 16 }}>
        <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--amber)' }} />
        <span style={{ fontSize: 12, color: 'var(--amber)', fontWeight: 600 }}>
          STALE {staleTime}Z
        </span>
      </div>
    )
  }

  const color = status === 'blocked' ? 'var(--red)' : 'var(--amber)'
  const label = status === 'blocked' ? `API HOLD ${remaining}s` : 'API SLOW'

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginRight: 16 }}>
      <div style={{
        width: 5, height: 5, borderRadius: '50%', background: color,
        boxShadow: `0 0 6px ${color}`,
        animation: 'pulse-dot 1.2s ease-in-out infinite',
      }} />
      <span style={{ fontSize: 12, color, fontWeight: 600 }}>
        {label}
      </span>
    </div>
  )
}
