import { useState, useEffect } from 'react'

export default function ApiStatusIndicator({
  status,
  backoffUntil,
  lastUpdated,
  isStale,
  blockedLabel = 'API HOLD',
  slowLabel = 'API SLOW',
}) {
  const [remaining, setRemaining] = useState(0)
  const [nowMs, setNowMs] = useState(() => Date.now())

  useEffect(() => {
    if (status !== 'blocked' || !backoffUntil) return
    const update = () => {
      const now = Date.now()
      setNowMs(now)
      setRemaining(Math.max(0, Math.ceil((backoffUntil - now) / 1000)))
    }
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [status, backoffUntil])

  useEffect(() => {
    if (!(isStale && status === 'ok' && lastUpdated)) return
    const update = () => setNowMs(Date.now())
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [isStale, status, lastUpdated])

  if (status === 'ok' && !isStale) return null

  if (isStale && status === 'ok' && lastUpdated) {
    const ageSec = Math.max(0, Math.floor((nowMs - Number(lastUpdated)) / 1000))
    const ageLabel = ageSec < 120 ? `${ageSec}s` : `${Math.floor(ageSec / 60)}m`
    return (
      <div role="status" aria-live="polite" style={{ display: 'flex', alignItems: 'center', gap: 5, marginRight: 16 }}>
        <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--amber)' }} />
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 9, color: 'var(--amber)', letterSpacing: 2 }}>
          STALE {ageLabel}
        </span>
      </div>
    )
  }

  const color = status === 'blocked' ? 'var(--red)' : 'var(--amber)'
  const label = status === 'blocked' ? `${blockedLabel} ${remaining}s` : slowLabel

  return (
    <div role="status" aria-live="polite" style={{ display: 'flex', alignItems: 'center', gap: 5, marginRight: 16 }}>
      <div style={{
        width: 5, height: 5, borderRadius: '50%', background: color,
        boxShadow: `0 0 6px ${color}`,
        animation: 'pulse-dot 1.2s ease-in-out infinite',
      }} />
      <span style={{ fontFamily: 'var(--font-display)', fontSize: 9, color, letterSpacing: 2 }}>
        {label}
      </span>
    </div>
  )
}
