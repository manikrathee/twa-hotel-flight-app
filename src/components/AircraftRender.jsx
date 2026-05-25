import { useId } from 'react'
import { getAircraftCategory } from '../utils/aircraft'

const AIRCRAFT_RENDER_CONFIG = {
  narrowbody: {
    label: 'Narrowbody commercial jet',
    scale: 0.98,
    fuselage: '#edf8ff',
    fuselageDark: '#9eb6cc',
    wing: '#9eb8d0',
    wingDark: '#526b86',
    accent: '#41c9ef',
    engines: 2,
  },
  widebody: {
    label: 'Widebody commercial jet',
    scale: 1.08,
    fuselage: '#f5fbff',
    fuselageDark: '#9fb8cf',
    wing: '#a9c1d7',
    wingDark: '#58718b',
    accent: '#67d6ff',
    engines: 2,
  },
  quad: {
    label: 'Four-engine widebody jet',
    scale: 1.08,
    fuselage: '#f5fbff',
    fuselageDark: '#9fb8cf',
    wing: '#a9c1d7',
    wingDark: '#58718b',
    accent: '#ffbf6b',
    engines: 4,
  },
  regional: {
    label: 'Regional commercial jet',
    scale: 0.86,
    fuselage: '#eaf7ff',
    fuselageDark: '#91a9bf',
    wing: '#96b0ca',
    wingDark: '#4a6179',
    accent: '#71e7ff',
    engines: 2,
    rearEngines: true,
  },
  turboprop: {
    label: 'Commercial turboprop',
    scale: 0.84,
    fuselage: '#eef9ff',
    fuselageDark: '#8fa8be',
    wing: '#9eb9d2',
    wingDark: '#526a83',
    accent: '#94f0c6',
    engines: 2,
    props: true,
  },
  unknown: {
    label: 'Commercial aircraft',
    scale: 0.98,
    fuselage: '#edf8ff',
    fuselageDark: '#9eb6cc',
    wing: '#9eb8d0',
    wingDark: '#526b86',
    accent: '#41c9ef',
    engines: 2,
  },
}

function enginePositions(config) {
  if (config.props) return [[-28, -20], [-28, 36]]
  if (config.rearEngines) return [[-54, -16], [-54, 22]]
  if (config.engines === 4) return [[-16, -42], [24, -31], [-16, 55], [24, 43]]
  return [[10, -36], [10, 48]]
}

export default function AircraftRender({ typeCode, width = 120, height = 80 }) {
  const reactId = useId().replace(/:/g, '')
  const category = getAircraftCategory(typeCode)
  const config = AIRCRAFT_RENDER_CONFIG[category] || AIRCRAFT_RENDER_CONFIG.unknown
  const ids = {
    bg: `aircraft-bg-${reactId}`,
    body: `aircraft-body-${reactId}`,
    wing: `aircraft-wing-${reactId}`,
    glass: `aircraft-glass-${reactId}`,
    glow: `aircraft-glow-${reactId}`,
    shadow: `aircraft-shadow-${reactId}`,
  }

  return (
    <div
      aria-label={config.label}
      role="img"
      style={{
        width,
        height,
        border: '1px solid rgba(109, 210, 255, 0.26)',
        borderRadius: 7,
        overflow: 'hidden',
        background: '#06131d',
        boxShadow: '0 16px 34px rgba(0, 0, 0, 0.36), inset 0 1px 0 rgba(255, 255, 255, 0.08)',
      }}
    >
      <svg viewBox="0 0 320 214" width="100%" height="100%" preserveAspectRatio="xMidYMid slice">
        <defs>
          <radialGradient id={ids.bg} cx="58%" cy="34%" r="76%">
            <stop offset="0%" stopColor="#335f94" />
            <stop offset="42%" stopColor="#102b45" />
            <stop offset="100%" stopColor="#06121c" />
          </radialGradient>
          <linearGradient id={ids.body} x1="20%" y1="24%" x2="86%" y2="78%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="34%" stopColor={config.fuselage} />
            <stop offset="72%" stopColor="#bfd2e3" />
            <stop offset="100%" stopColor={config.fuselageDark} />
          </linearGradient>
          <linearGradient id={ids.wing} x1="28%" y1="16%" x2="75%" y2="92%">
            <stop offset="0%" stopColor="#e4f2ff" />
            <stop offset="48%" stopColor={config.wing} />
            <stop offset="100%" stopColor={config.wingDark} />
          </linearGradient>
          <linearGradient id={ids.glass} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#baf8ff" />
            <stop offset="100%" stopColor="#1b75ad" />
          </linearGradient>
          <filter id={ids.glow} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="3.2" result="blur" />
            <feColorMatrix
              in="blur"
              type="matrix"
              values="0 0 0 0 0.25 0 0 0 0 0.82 0 0 0 0 1 0 0 0 0.55 0"
            />
            <feBlend in="SourceGraphic" />
          </filter>
          <filter id={ids.shadow} x="-40%" y="-40%" width="180%" height="180%">
            <feDropShadow dx="0" dy="12" stdDeviation="8" floodColor="#000" floodOpacity="0.45" />
          </filter>
        </defs>

        <rect width="320" height="214" fill={`url(#${ids.bg})`} />
        <path d="M0 160 C70 125 119 132 171 154 C216 173 269 164 320 136 L320 214 L0 214 Z" fill="#061925" opacity="0.72" />
        <path d="M16 38 L74 19 L132 29 L73 52 Z" fill="#67d6ff" opacity="0.08" />
        <path d="M208 35 L294 65 L247 78 L173 49 Z" fill="#ffffff" opacity="0.055" />
        <path d="M47 178 L126 151 L220 159 L135 196 Z" fill="#67d6ff" opacity="0.07" />

        <g transform={`translate(164 105) rotate(-12) scale(${config.scale})`} filter={`url(#${ids.shadow})`}>
          <ellipse cx="20" cy="64" rx="118" ry="20" fill="#000" opacity="0.23" />

          <path d="M-20 4 L-102 -58 L-64 -65 L64 -4 Z" fill={`url(#${ids.wing})`} />
          <path d="M-15 17 L-96 82 L-57 89 L68 20 Z" fill={`url(#${ids.wing})`} />
          <path d="M-95 -58 L-64 -65 L-31 -49 L-77 -45 Z" fill="#dff0ff" opacity="0.56" />
          <path d="M-88 81 L-57 89 L-25 70 L-70 69 Z" fill="#dff0ff" opacity="0.42" />

          <path d="M-86 -2 L-139 -36 L-109 -45 L-55 -9 Z" fill={`url(#${ids.wing})`} />
          <path d="M-86 15 L-136 48 L-106 58 L-53 22 Z" fill={`url(#${ids.wing})`} />
          <path d="M-136 -33 L-108 -72 L-83 -61 L-105 -26 Z" fill={`url(#${ids.wing})`} />

          {enginePositions(config).map(([x, y], index) => (
            config.props ? (
              <g key={`prop-${index}`} transform={`translate(${x} ${y})`}>
                <ellipse cx="0" cy="0" rx="14" ry="8" fill="#1b3349" />
                <circle cx="0" cy="0" r="3.5" fill={config.accent} />
                <path d="M0 -21 C5 -13 5 -7 0 0 C-5 -7 -5 -13 0 -21Z" fill="#d9f4ff" opacity="0.78" />
                <path d="M0 21 C-5 13 -5 7 0 0 C5 7 5 13 0 21Z" fill="#d9f4ff" opacity="0.5" />
              </g>
            ) : (
              <g key={`engine-${index}`} transform={`translate(${x} ${y})`}>
                <ellipse cx="0" cy="0" rx="18" ry="10" fill="#263c52" />
                <ellipse cx="2" cy="-1" rx="10" ry="5.5" fill="#07121d" />
                <ellipse cx="4" cy="-2" rx="4.5" ry="2.3" fill={config.accent} opacity="0.78" />
              </g>
            )
          ))}

          <path
            d="M-116 10 C-93 -18 -47 -33 31 -30 C94 -28 151 -12 176 8 C191 20 187 37 166 45 C127 60 26 57 -49 42 C-93 33 -127 23 -116 10 Z"
            fill={`url(#${ids.body})`}
          />
          <path
            d="M-104 10 C-69 1 21 -1 91 5 C132 9 163 18 177 29 C169 42 123 50 43 48 C-29 46 -91 31 -112 18 C-116 15 -114 12 -104 10 Z"
            fill="#10283c"
            opacity="0.2"
          />
          <path d="M61 -27 C106 -24 146 -15 172 4 C143 0 104 -3 61 -6 Z" fill="#ffffff" opacity="0.45" />
          <path d="M129 -14 C149 -10 164 -4 175 7 C159 7 143 5 128 2 Z" fill={`url(#${ids.glass})`} />
          <path d="M-101 9 C-81 2 -53 -5 -25 -8" fill="none" stroke={config.accent} strokeWidth="4" strokeLinecap="round" opacity="0.78" filter={`url(#${ids.glow})`} />

          {[-60, -38, -16, 6, 28, 50, 72, 94].map((x) => (
            <rect key={x} x={x} y="-13" width="8" height="3" rx="1.5" fill="#163a55" opacity="0.72" transform="rotate(4)" />
          ))}

          <path d="M-125 9 C-145 1 -151 -2 -160 1 C-150 14 -137 20 -115 19 Z" fill={config.accent} opacity="0.78" />
        </g>
      </svg>
    </div>
  )
}
