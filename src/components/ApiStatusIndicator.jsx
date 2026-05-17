import { useState, useEffect } from 'react'

export default function ApiStatusIndicator({ status, backoffUntil, lastUpdated, isStale }) {
  const [remaining, setRemaining] = useState(0)
  const [nowMs, setNowMs] = useState(null)

  useEffect(() => {
    const needsClock = (status === 'blocked' && backoffUntil) || (isStale && lastUpdated)
    if (!needsClock) return undefined

    const id = setInterval(() => {
      const nextNowMs = Date.now()
      setNowMs(nextNowMs)
      if (status === 'blocked' && backoffUntil) {
        setRemaining(Math.max(0, Math.ceil((backoffUntil - nextNowMs) / 1000)))
      }
    }, 1000)
    return () => clearInterval(id)
  }, [status, backoffUntil, isStale, lastUpdated])

  if (status === 'ok' && !isStale) return null

  if (isStale && status === 'ok' && lastUpdated) {
    const ageSec = nowMs ? Math.floor((nowMs - Number(lastUpdated)) / 1000) : null
    const ageLabel = ageSec == null ? '' : ageSec < 120 ? ` ${ageSec}s` : ` ${Math.floor(ageSec / 60)}m`
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginRight: 16 }}>
        <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--amber)' }} />
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 9, color: 'var(--amber)', letterSpacing: 2 }}>
          STALE{ageLabel}
        </span>
      </div>
    )
  }

  const color = status === 'blocked' || status === 'error' ? 'var(--red)' : 'var(--amber)'
  const label = status === 'blocked' ? `API HOLD ${remaining}s` : 'API ERROR'

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginRight: 16 }}>
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
