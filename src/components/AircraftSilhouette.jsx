import { getAircraftCategory } from '../utils/aircraft'

// All silhouettes: top-down view, nose pointing UP, 200×240 viewBox
const SILHOUETTES = {
  narrowbody: (
    // B737/A320 family - 2 under-wing engines, conventional tail
    <g>
      {/* Fuselage */}
      <ellipse cx="100" cy="118" rx="9" ry="96" />
      {/* Left wing */}
      <path d="M 91 98 L 16 148 L 19 160 L 91 118 Z" />
      {/* Right wing */}
      <path d="M 109 98 L 184 148 L 181 160 L 109 118 Z" />
      {/* Left engine */}
      <rect x="32" y="137" width="13" height="20" rx="4" />
      {/* Right engine */}
      <rect x="155" y="137" width="13" height="20" rx="4" />
      {/* Left wing tip */}
      <path d="M 16 148 L 8 145 L 8 152 L 19 160 Z" />
      {/* Right wing tip */}
      <path d="M 184 148 L 192 145 L 192 152 L 181 160 Z" />
      {/* Left H-stab */}
      <path d="M 91 196 L 52 210 L 53 217 L 91 203 Z" />
      {/* Right H-stab */}
      <path d="M 109 196 L 148 210 L 147 217 L 109 203 Z" />
      {/* Vertical stab */}
      <ellipse cx="100" cy="200" rx="4" ry="12" />
    </g>
  ),

  widebody: (
    // B777/B787/A330/A350 - wide fuselage, highly swept wings, 2 large engines
    <g>
      {/* Fuselage */}
      <ellipse cx="100" cy="118" rx="13" ry="96" />
      {/* Left wing - highly swept */}
      <path d="M 88 92 L 4 152 L 8 166 L 88 115 Z" />
      {/* Right wing */}
      <path d="M 112 92 L 196 152 L 192 166 L 112 115 Z" />
      {/* Left engine (large) */}
      <rect x="24" y="139" width="16" height="24" rx="6" />
      {/* Right engine (large) */}
      <rect x="160" y="139" width="16" height="24" rx="6" />
      {/* Left raked wingtip */}
      <path d="M 4 152 L -4 146 L -2 156 L 8 166 Z" />
      {/* Right raked wingtip */}
      <path d="M 196 152 L 204 146 L 202 156 L 192 166 Z" />
      {/* Left H-stab */}
      <path d="M 88 198 L 44 215 L 46 223 L 88 205 Z" />
      {/* Right H-stab */}
      <path d="M 112 198 L 156 215 L 154 223 L 112 205 Z" />
      {/* Vertical stab */}
      <ellipse cx="100" cy="202" rx="5" ry="13" />
    </g>
  ),

  quad: (
    // A380/B747 - 4 engines, very wide fuselage
    <g>
      {/* Fuselage (wide) */}
      <ellipse cx="100" cy="118" rx="16" ry="96" />
      {/* Left wing */}
      <path d="M 85 88 L 2 150 L 6 164 L 85 112 Z" />
      {/* Right wing */}
      <path d="M 115 88 L 198 150 L 194 164 L 115 112 Z" />
      {/* Left inner engine */}
      <rect x="44" y="133" width="14" height="22" rx="5" />
      {/* Right inner engine */}
      <rect x="142" y="133" width="14" height="22" rx="5" />
      {/* Left outer engine */}
      <rect x="14" y="143" width="14" height="22" rx="5" />
      {/* Right outer engine */}
      <rect x="172" y="143" width="14" height="22" rx="5" />
      {/* Left H-stab */}
      <path d="M 85 200 L 38 218 L 40 226 L 85 207 Z" />
      {/* Right H-stab */}
      <path d="M 115 200 L 162 218 L 160 226 L 115 207 Z" />
      {/* Vertical stab */}
      <ellipse cx="100" cy="204" rx="5" ry="14" />
    </g>
  ),

  regional: (
    // Embraer E-jets / CRJ - narrow fuselage, aft-mounted engines, T-tail
    <g>
      {/* Fuselage (narrow) */}
      <ellipse cx="100" cy="112" rx="7" ry="90" />
      {/* Left wing */}
      <path d="M 93 105 L 30 138 L 32 147 L 93 118 Z" />
      {/* Right wing */}
      <path d="M 107 105 L 170 138 L 168 147 L 107 118 Z" />
      {/* Aft-mounted engines */}
      <rect x="79" y="175" width="11" height="18" rx="4" />
      <rect x="110" y="175" width="11" height="18" rx="4" />
      {/* T-tail H-stab (at top of vertical stab) */}
      <path d="M 91 195 L 42 196 L 42 202 L 91 201 Z" />
      <path d="M 109 195 L 158 196 L 158 202 L 109 201 Z" />
      {/* Vertical stab */}
      <ellipse cx="100" cy="198" rx="5" ry="13" />
    </g>
  ),

  turboprop: (
    // ATR/Dash 8 - high wing, 2 propeller engines
    <g>
      {/* Fuselage */}
      <ellipse cx="100" cy="115" rx="7" ry="88" />
      {/* Left wing (high, less swept) */}
      <path d="M 93 108 L 18 125 L 18 136 L 93 122 Z" />
      {/* Right wing */}
      <path d="M 107 108 L 182 125 L 182 136 L 107 122 Z" />
      {/* Left prop engine */}
      <ellipse cx="36" cy="130" rx="7" ry="9" />
      <line x1="36" y1="118" x2="36" y2="112" stroke="currentColor" strokeWidth="2" />
      <line x1="36" y1="142" x2="36" y2="148" stroke="currentColor" strokeWidth="2" />
      {/* Right prop engine */}
      <ellipse cx="164" cy="130" rx="7" ry="9" />
      <line x1="164" y1="118" x2="164" y2="112" stroke="currentColor" strokeWidth="2" />
      <line x1="164" y1="142" x2="164" y2="148" stroke="currentColor" strokeWidth="2" />
      {/* Left H-stab */}
      <path d="M 93 192 L 56 202 L 57 208 L 93 198 Z" />
      {/* Right H-stab */}
      <path d="M 107 192 L 144 202 L 143 208 L 107 198 Z" />
      {/* Vertical stab */}
      <ellipse cx="100" cy="195" rx="4" ry="10" />
    </g>
  ),

  unknown: (
    <g>
      <ellipse cx="100" cy="118" rx="9" ry="96" />
      <path d="M 91 98 L 16 148 L 19 160 L 91 118 Z" />
      <path d="M 109 98 L 184 148 L 181 160 L 109 118 Z" />
      <rect x="32" y="137" width="13" height="20" rx="4" />
      <rect x="155" y="137" width="13" height="20" rx="4" />
      <path d="M 91 196 L 52 210 L 53 217 L 91 203 Z" />
      <path d="M 109 196 L 148 210 L 147 217 L 109 203 Z" />
      <ellipse cx="100" cy="200" rx="4" ry="12" />
    </g>
  ),
}

export default function AircraftSilhouette({ typeCode, size = 180, color = '#00c3ff', glowColor }) {
  const category = getAircraftCategory(typeCode)
  const shape = SILHOUETTES[category] || SILHOUETTES.unknown
  const glow = glowColor || color
  const filterId = `glow-${(typeCode || 'default').replace(/[^a-z0-9]/gi, '')}`

  return (
    <div style={{ width: size, height: size * 1.2, position: 'relative', flexShrink: 0 }}>
      <svg
        width={size}
        height={size * 1.2}
        viewBox="0 0 200 240"
        style={{ position: 'absolute', inset: 0, overflow: 'visible' }}
      >
        <defs>
          <filter id={filterId} x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur" />
            <feColorMatrix in="blur" type="matrix"
              values="0 0 0 0 0   0 0.76 1 0 0   0 0 1 0 0   0 0 0 0.9 0" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Radar rings */}
        {[38, 66, 94].map(r => (
          <circle key={r} cx="100" cy="120" r={r} fill="none"
            stroke={color} strokeWidth="0.6" opacity="0.1" />
        ))}
        <line x1="100" y1="26" x2="100" y2="214" stroke={color} strokeWidth="0.4" opacity="0.08" />
        <line x1="6" y1="120" x2="194" y2="120" stroke={color} strokeWidth="0.4" opacity="0.08" />

        {/* Shadow/depth layer */}
        <g fill={color} opacity="0.15" transform="translate(3,5)">
          {shape}
        </g>

        {/* Main silhouette with glow */}
        <g fill={color} filter={`url(#${filterId})`}>
          {shape}
        </g>
      </svg>
    </div>
  )
}
