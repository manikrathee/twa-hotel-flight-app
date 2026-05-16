import { useState, useEffect } from 'react'
import { weatherCodeToCondition, estimateActiveRunways } from '../api/weather'
import { headingToCardinal } from '../utils/geo'
import ApiStatusIndicator from './ApiStatusIndicator'

function Clock() {
  const [time, setTime] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  const utc = time.toUTCString().slice(17, 25)
  const local = time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: 'America/New_York' })
  return (
    <div style={{ display: 'flex', gap: 26, alignItems: 'center' }}>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 21, color: 'var(--heading)', letterSpacing: 2 }}>
        {local} <span style={{ color: 'var(--text-dim)', fontSize: 18 }}>LCL</span>
      </span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 18, color: 'var(--text-dim)', letterSpacing: 1 }}>
        {utc}Z
      </span>
    </div>
  )
}

export default function HUDBar({ flights, weather, rateLimitStatus, backoffUntil, lastUpdated, isStale, theme, onThemeToggle }) {
  const condition = weather ? weatherCodeToCondition(weather.weather_code) : null
  const windDir = weather ? Math.round(weather.wind_direction_10m) : null
  const windSpd = weather ? Math.round(weather.wind_speed_10m) : null
  const windGust = weather ? Math.round(weather.wind_gusts_10m) : null
  const temp = weather ? Math.round(weather.temperature_2m) : null
  const cardinal = windDir !== null ? headingToCardinal(windDir) : '—'
  const runways = weather ? estimateActiveRunways(windDir) : []
  const airborne = flights.length
  const blocked = rateLimitStatus === 'blocked'

  return (
    <div style={{
      height: 86,
      background: 'var(--panel)',
      borderBottom: '1px solid var(--border-bright)',
      boxShadow: '0 1px 0 rgba(0,212,200,0.06), 0 4px 40px rgba(0,0,0,0.6)',
      display: 'flex',
      alignItems: 'center',
      padding: '0 33px',
      gap: 0,
      flexShrink: 0,
      backdropFilter: 'blur(16px)',
      position: 'relative',
      zIndex: 100,
    }}>
      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginRight: 46 }}>
        <div style={{
          background: 'white',
          borderRadius: 8,
          padding: '5px 8px',
          display: 'flex',
          alignItems: 'center',
          boxShadow: '0 0 10px rgba(227,30,38,0.25)',
        }}>
          <img src="/twa-logo.png" alt="TWA Hotel" height={50} style={{ display: 'block' }} />
        </div>
        <div style={{ fontSize: 18, color: 'var(--text-dim)', letterSpacing: 3, fontFamily: 'var(--font-display)' }}>
          FLIGHT DECK
        </div>
      </div>

      <div style={{ width: 1, height: 46, background: 'var(--border)', marginRight: 33 }} />

      {/* Live indicator */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginRight: 33 }}>
        <div style={{
          width: 12, height: 12, borderRadius: '50%',
          background: blocked ? 'var(--red)' : 'var(--green)',
          animation: 'pulse-dot 1.4s ease-in-out infinite',
          boxShadow: blocked ? '0 0 8px var(--red)' : '0 0 8px var(--green)',
        }} />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 18, color: blocked ? 'var(--red)' : 'var(--green)', letterSpacing: 1.5, fontWeight: 500 }}>
          LIVE
        </span>
      </div>

      {/* API rate limit status — only shown when non-ok */}
      <ApiStatusIndicator
        status={rateLimitStatus || 'ok'}
        backoffUntil={backoffUntil}
        lastUpdated={lastUpdated}
        isStale={isStale}
      />

      {/* Airborne count */}
      <HUDStat label="AIRCRAFT" value={airborne || '—'} unit="" color="var(--cyan)" />
      <Divider />

      {/* Weather */}
      {weather && <>
        <HUDStat label="WIND" value={`${cardinal} ${windSpd}`} unit="mph" />
        {windGust > windSpd + 5 && <HUDStat label="GUST" value={windGust} unit="mph" color="var(--amber)" />}
        <HUDStat label="TEMP" value={`${temp}°`} unit="F" />
        <HUDStat label="SKY" value={condition} unit="" />
        {runways.length > 0 && <HUDStat label="ACTIVE RWY" value={runways.join(' · ')} unit="" color="var(--amber)" />}
        <Divider />
      </>}

      {/* JFK location tag */}
      <div style={{ marginRight: 'auto', fontSize: 18, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', letterSpacing: 1 }}>
        KJFK · TWA HOTEL · 40.64°N 73.78°W
      </div>

      {/* Clock */}
      <Clock />

      <div style={{ width: 1, height: 46, background: 'var(--border)', marginLeft: 20 }} />
      <button
        onClick={onThemeToggle}
        title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        style={{
          background: 'none',
          border: '1px solid var(--border-bright)',
          borderRadius: 6,
          color: 'var(--cyan)',
          cursor: 'pointer',
          padding: '6px 14px',
          fontFamily: 'var(--font-display)',
          fontSize: 13,
          letterSpacing: 2,
          marginLeft: 20,
          transition: 'border-color 0.15s, background 0.15s',
          flexShrink: 0,
        }}
        onMouseEnter={e => { e.currentTarget.style.background = 'var(--cyan-glow)' }}
        onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
      >
        {theme === 'dark' ? '◐ LIGHT' : '◑ DARK'}
      </button>
    </div>
  )
}

function HUDStat({ label, value, unit, color = 'var(--text)' }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', marginRight: 33 }}>
      <span style={{ fontSize: 13, color: 'var(--text-dim)', letterSpacing: 2, fontFamily: 'var(--font-display)', textTransform: 'uppercase', lineHeight: 1.2 }}>
        {label}
      </span>
      <span style={{ fontSize: 25, fontFamily: 'var(--font-mono)', color, fontWeight: 400, letterSpacing: 0.5, lineHeight: 1.2 }}>
        {value}{unit ? <span style={{ fontSize: 17, color: 'var(--text-dim)', marginLeft: 5 }}>{unit}</span> : null}
      </span>
    </div>
  )
}

function Divider() {
  return <div style={{ width: 1, height: 46, background: 'var(--border)', marginRight: 33 }} />
}
