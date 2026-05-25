import { getAircraftCategory } from '../utils/aircraft'

// All silhouettes: top-down view, nose pointing UP, 200×240 viewBox
const SILHOUETTES = {
  narrowbody: (
    // B737/A320 family - 2 under-wing engines, conventional tail
    <g>
      {/* Fuselage */}
      <path d="M100 18 C128 18 136 35 136 66 C136 111 136 130 132 188 C130 204 122 218 110 224 C100 230 100 230 90 224 C78 218 70 204 68 188 C64 130 64 111 64 66 C64 35 72 18 100 18 Z" />
      <ellipse cx="100" cy="34" rx="12" ry="6" />
      {/* Left wing */}
      <path d="M93 98 C78 97 36 112 18 122 C14 125 12 132 16 136 C20 143 26 144 33 142 C62 132 76 126 96 120 Z" />
      <path d="M93 98 C86 97 80 97 70 99 C72 103 77 107 85 109 C92 112 100 112 107 111 C113 110 118 107 122 104 C128 101 128 99 122 99 C112 98 103 98 93 98 Z" />
      {/* Right wing */}
      <path d="M107 98 C122 97 164 112 182 122 C186 125 188 132 184 136 C180 143 174 144 167 142 C138 132 124 126 104 120 Z" />
      <path d="M107 98 C114 97 120 97 130 99 C128 103 123 107 115 109 C108 112 100 112 93 111 C87 110 82 107 78 104 C72 101 72 99 78 99 C88 98 97 98 107 98 Z" />
      {/* Left engine */}
      <path d="M34 142 C30 142 27 146 27 150 L27 161 C27 165 30 169 34 169 L34 174 C34 178 37 181 41 181 L48 181 C52 181 55 178 55 174 L55 150 C55 146 52 142 48 142 Z" />
      <path d="M34 150 L41 150 L41 169 L34 169 Z" fill="rgba(255,255,255,0.2)" />
      {/* Right engine */}
      <path d="M166 142 C170 142 173 146 173 150 L173 161 C173 165 170 169 166 169 L166 174 C166 178 163 181 159 181 L152 181 C148 181 145 178 145 174 L145 150 C145 146 148 142 152 142 Z" />
      <path d="M166 150 L159 150 L159 169 L166 169 Z" fill="rgba(255,255,255,0.2)" />
      {/* Left wing tip */}
      <path d="M33 118 L14 136 L8 128 L12 121 Z" />
      {/* Right wing tip */}
      <path d="M167 118 L186 136 L192 128 L188 121 Z" />
      {/* Cockpit */}
      <path d="M92 24 L96 16 L104 16 L108 24 L108 34 L92 34 Z" />
      {/* APU bay */}
      <ellipse cx="100" cy="74" rx="7" ry="8" />
      <line x1="100" y1="74" x2="92" y2="74" />
      <line x1="100" y1="74" x2="108" y2="74" />
      {/* Left H-stab */}
      <path d="M 91 196 L 56 210 L 58 219 L 91 205 Z" />
      <path d="M 91 198 L 70 208 L 70 214 L 91 207 Z" fill="rgba(255,255,255,0.2)" />
      {/* Right H-stab */}
      <path d="M 109 196 L 144 210 L 142 219 L 109 205 Z" />
      <path d="M 109 198 L 130 208 L 130 214 L 109 207 Z" fill="rgba(255,255,255,0.2)" />
      {/* Vertical stab */}
      <path d="M100 198 C105 198 108 203 108 208 L108 219 C108 224 105 227 100 227 C95 227 92 224 92 219 L92 208 C92 203 95 198 100 198 Z" />
      {/* Ventral fin detail */}
      <path d="M95 222 L100 214 L105 222 Z" fill="rgba(255,255,255,0.2)" />
    </g>
  ),

  widebody: (
    // B777/B787/A330/A350 - wide fuselage, highly swept wings, 2 large engines
    <g>
      {/* Fuselage */}
      <path d="M100 16 C134 16 148 42 148 74 C148 112 148 141 146 200 C144 220 128 232 110 236 C100 238 100 238 90 236 C72 232 56 220 54 200 C52 141 52 112 52 74 C52 42 66 16 100 16 Z" />
      <ellipse cx="100" cy="35" rx="16" ry="8" />
      {/* Left wing - highly swept */}
      <path d="M88 92 C68 88 24 103 10 115 C3 121 2 132 8 138 C16 148 30 150 46 146 C57 143 72 137 84 131 C80 123 74 108 88 92 Z" />
      <path d="M90 95 C81 106 73 116 70 128 C68 132 68 136 72 139 C77 144 84 143 89 139 C93 136 96 132 100 128 Z" fill="rgba(255,255,255,0.17)" />
      {/* Right wing */}
      <path d="M112 92 C132 88 176 103 190 115 C197 121 198 132 192 138 C184 148 170 150 154 146 C143 143 128 137 116 131 C120 123 126 108 112 92 Z" />
      <path d="M110 95 C119 106 127 116 130 128 C132 132 132 136 128 139 C123 144 116 143 111 139 C107 136 104 132 100 128 Z" fill="rgba(255,255,255,0.17)" />
      {/* Left engine (large) */}
      <path d="M30 148 C24 148 20 153 20 160 L20 181 C20 188 24 193 30 193 L30 200 C30 204 34 208 38 208 L52 208 C56 208 60 204 60 200 L60 160 C60 153 56 148 52 148 Z" />
      <path d="M30 155 L38 155 L38 193 L30 193 Z" fill="rgba(255,255,255,0.2)" />
      {/* Right engine (large) */}
      <path d="M170 148 C176 148 180 153 180 160 L180 181 C180 188 176 193 170 193 L170 200 C170 204 166 208 162 208 L148 208 C144 208 140 204 140 200 L140 160 C140 153 144 148 148 148 Z" />
      <path d="M170 155 L162 155 L162 193 L170 193 Z" fill="rgba(255,255,255,0.2)" />
      {/* Nacelle inlets */}
      <ellipse cx="40" cy="172" rx="9" ry="12" />
      <ellipse cx="160" cy="172" rx="9" ry="12" />
      {/* Left raked wingtip */}
      <path d="M7 120 L-4 116 L0 136 L12 145 Z" />
      {/* Right raked wingtip */}
      <path d="M193 120 L204 116 L200 136 L188 145 Z" />
      {/* Left H-stab */}
      <path d="M 88 198 L 48 216 L 50 226 L 88 208 Z" />
      <path d="M 88 201 L 66 214 L 66 221 L 88 211 Z" fill="rgba(255,255,255,0.2)" />
      {/* Right H-stab */}
      <path d="M 112 198 L 152 216 L 150 226 L 112 208 Z" />
      <path d="M 112 201 L 134 214 L 134 221 L 112 211 Z" fill="rgba(255,255,255,0.2)" />
      {/* Vertical stab */}
      <path d="M100 200 C106 200 110 205 110 212 L110 226 C110 233 106 238 100 238 C94 238 90 233 90 226 L90 212 C90 205 94 200 100 200 Z" />
      {/* Lower-body relief */}
      <path d="M100 90 C92 92 86 97 86 102 L86 170 C86 176 92 181 100 181 C108 181 114 176 114 170 L114 102 C114 97 108 92 100 90 Z" fill="rgba(255,255,255,0.08)" />
    </g>
  ),

  quad: (
    // A380/B747 - 4 engines, very wide fuselage
    <g>
      {/* Fuselage (wide) */}
      <path d="M100 13 C142 13 162 42 162 79 C162 120 162 151 158 206 C156 228 130 244 110 247 C100 249 100 249 90 247 C70 244 44 228 42 206 C38 151 38 120 38 79 C38 42 58 13 100 13 Z" />
      <ellipse cx="100" cy="30" rx="19" ry="10" />
      {/* Left wing */}
      <path d="M85 88 C54 86 9 104 0 116 C-6 122 -6 134 1 140 C10 150 24 153 46 149 C64 145 77 140 84 134 Z" />
      <path d="M85 92 C72 106 60 118 58 130 C56 136 59 142 64 145 C73 150 84 150 90 148 C95 146 98 139 96 132 C94 124 90 108 85 92 Z" fill="rgba(255,255,255,0.17)" />
      {/* Right wing */}
      <path d="M115 88 C146 86 191 104 200 116 C206 122 206 134 199 140 C190 150 176 153 154 149 C136 145 123 140 116 134 Z" />
      <path d="M115 92 C128 106 140 118 142 130 C144 136 141 142 136 145 C127 150 116 150 110 148 C105 146 102 139 104 132 C106 124 110 108 115 92 Z" fill="rgba(255,255,255,0.17)" />
      {/* Left inner engine */}
      <path d="M56 144 C50 144 46 149 46 156 L46 175 C46 181 50 186 56 186 L56 193 C56 198 60 202 64 202 L76 202 C80 202 84 198 84 193 L84 175 C84 149 80 144 76 144 Z" />
      <path d="M56 151 L64 151 L64 186 L56 186 Z" fill="rgba(255,255,255,0.2)" />
      {/* Right inner engine */}
      <path d="M144 144 C150 144 154 149 154 156 L154 175 C154 181 150 186 144 186 L144 193 C144 198 140 202 136 202 L124 202 C120 202 116 198 116 193 L116 175 C116 149 120 144 124 144 Z" />
      <path d="M144 151 L136 151 L136 186 L144 186 Z" fill="rgba(255,255,255,0.2)" />
      {/* Left outer engine */}
      <path d="M38 166 C32 166 28 170 28 176 L28 184 C28 188 32 192 38 192 L38 199 C38 204 42 208 46 208 L62 208 C66 208 70 204 70 199 L70 176 C70 170 66 166 62 166 Z" />
      <path d="M38 172 L46 172 L46 192 L38 192 Z" fill="rgba(255,255,255,0.16)" />
      {/* Right outer engine */}
      <path d="M162 166 C168 166 172 170 172 176 L172 184 C172 188 168 192 162 192 L162 199 C162 204 158 208 154 208 L138 208 C134 208 130 204 130 199 L130 176 C130 170 134 166 138 166 Z" />
      <path d="M162 172 L154 172 L154 192 L162 192 Z" fill="rgba(255,255,255,0.16)" />
      {/* Nacelle pods */}
      <ellipse cx="40" cy="184" rx="9" ry="11" />
      <ellipse cx="160" cy="184" rx="9" ry="11" />
      {/* Left H-stab */}
      <path d="M 85 200 L 38 220 L 40 229 L 85 210 Z" />
      <path d="M 85 202 L 60 214 L 60 221 L 85 211 Z" fill="rgba(255,255,255,0.22)" />
      {/* Right H-stab */}
      <path d="M 115 200 L 162 220 L 160 229 L 115 210 Z" />
      <path d="M 115 202 L 140 214 L 140 221 L 115 211 Z" fill="rgba(255,255,255,0.22)" />
      {/* Vertical stab */}
      <path d="M100 200 C108 200 113 206 113 214 L113 234 C113 243 108 248 100 248 C92 248 87 243 87 234 L87 214 C87 206 92 200 100 200 Z" />
      {/* Centerline panel */}
      <path d="M100 82 C90 83 84 90 84 98 L84 150 C84 158 90 165 100 165 C110 165 116 158 116 150 L116 98 C116 90 110 83 100 82 Z" fill="rgba(255,255,255,0.08)" />
    </g>
  ),

  regional: (
    // Embraer E-jets / CRJ - narrow fuselage, aft-mounted engines, T-tail
    <g>
      {/* Fuselage (narrow) */}
      <path d="M100 19 C119 19 128 37 128 63 C128 110 128 125 126 186 C124 205 112 220 100 223 C88 220 76 205 74 186 C72 125 72 110 72 63 C72 37 81 19 100 19 Z" />
      <ellipse cx="100" cy="32" rx="11" ry="6" />
      {/* Left wing */}
      <path d="M94 112 L34 136 L36 148 L94 122 Z" />
      <path d="M86 123 L44 138 L47 146 L93 125 Z" />
      {/* Right wing */}
      <path d="M106 112 L166 136 L164 148 L106 122 Z" />
      <path d="M114 123 L156 138 L153 146 L107 125 Z" />
      {/* Aft-mounted engines */}
      <path d="M79 180 C73 180 68 184 68 189 C68 202 68 202 79 202 L79 204 C79 207 82 210 86 210 L93 210 C97 210 100 207 100 204 C100 197 100 197 92 197 Z" />
      <path d="M121 180 C127 180 132 184 132 189 C132 202 132 202 121 202 L121 204 C121 207 118 210 114 210 L107 210 C103 210 100 207 100 204 C100 197 100 197 108 197 Z" />
      {/* T-tail H-stab (at top of vertical stab) */}
      <path d="M 94 192 L 48 194 L 48 202 L 94 198 Z" />
      <path d="M 106 192 L 152 194 L 152 202 L 106 198 Z" />
      <path d="M 94 196 L 68 198 L 68 204 L 94 202 Z" fill="rgba(255,255,255,0.2)" />
      <path d="M 106 196 L 132 198 L 132 204 L 106 202 Z" fill="rgba(255,255,255,0.2)" />
      {/* Vertical stab */}
      <path d="M100 196 C105 196 109 201 109 206 L109 220 C109 226 105 230 100 230 C95 230 91 226 91 220 L91 206 C91 201 95 196 100 196 Z" />
      <path d="M100 200 L96 204 L104 204 Z" fill="rgba(255,255,255,0.24)" />
      {/* Cargo doors */}
      <path d="M88 60 L100 60 L100 94 L88 94 Z" fill="rgba(255,255,255,0.08)" />
      <path d="M100 60 L112 60 L112 94 L100 94 Z" fill="rgba(255,255,255,0.08)" />
      {/* Rear pod */}
      <path d="M96 148 L100 153 L104 148 L104 188 C104 196 100 196 100 196 C100 196 96 196 96 188 Z" fill="rgba(255,255,255,0.08)" />
    </g>
  ),

  turboprop: (
    // ATR/Dash 8 - high wing, 2 propeller engines
    <g>
      {/* Fuselage */}
      <path d="M100 20 C118 20 126 38 126 66 C126 104 126 136 124 189 C122 208 112 222 100 226 C88 226 78 208 76 189 C74 136 74 104 74 66 C74 38 82 20 100 20 Z" />
      <ellipse cx="100" cy="34" rx="10" ry="6" />
      {/* Left wing (high, less swept) */}
      <path d="M94 105 C74 106 28 110 16 120 C10 124 9 132 14 136 C22 142 28 145 36 145 C52 145 72 136 94 125 Z" />
      <path d="M94 112 C82 118 68 123 57 127 C52 129 48 129 45 127 C40 124 40 120 43 116 C54 114 68 110 82 108 Z" fill="rgba(255,255,255,0.2)" />
      {/* Right wing */}
      <path d="M106 105 C126 106 172 110 184 120 C190 124 191 132 186 136 C178 142 172 145 164 145 C148 145 128 136 106 125 Z" />
      <path d="M106 112 C118 118 132 123 143 127 C148 129 152 129 155 127 C160 124 160 120 157 116 C146 114 132 110 118 108 Z" fill="rgba(255,255,255,0.2)" />
      {/* Left prop engine */}
      <ellipse cx="35" cy="127" rx="10" ry="12" />
      <ellipse cx="35" cy="127" rx="3" ry="6" />
      <line x1="35" y1="115" x2="35" y2="109" stroke="currentColor" strokeWidth="2" />
      <line x1="35" y1="145" x2="35" y2="151" stroke="currentColor" strokeWidth="2" />
      <line x1="23" y1="127" x2="17" y2="127" stroke="currentColor" strokeWidth="2" />
      <line x1="47" y1="127" x2="53" y2="127" stroke="currentColor" strokeWidth="2" />
      {/* Right prop engine */}
      <ellipse cx="165" cy="127" rx="10" ry="12" />
      <ellipse cx="165" cy="127" rx="3" ry="6" />
      <line x1="165" y1="115" x2="165" y2="109" stroke="currentColor" strokeWidth="2" />
      <line x1="165" y1="145" x2="165" y2="151" stroke="currentColor" strokeWidth="2" />
      <line x1="153" y1="127" x2="147" y2="127" stroke="currentColor" strokeWidth="2" />
      <line x1="175" y1="127" x2="181" y2="127" stroke="currentColor" strokeWidth="2" />
      {/* Left H-stab */}
      <path d="M 93 194 L 58 206 L 60 214 L 93 202 Z" />
      {/* Right H-stab */}
      <path d="M 107 194 L 142 206 L 140 214 L 107 202 Z" />
      <path d="M 98 205 L 102 212 L 108 210 L 104 203 Z" fill="rgba(255,255,255,0.18)" />
      {/* Vertical stab */}
      <path d="M100 196 C104 196 108 200 108 205 L108 218 C108 224 104 228 100 228 C96 228 92 224 92 218 L92 205 C92 200 96 196 100 196 Z" />
      {/* Cabin band */}
      <path d="M88 60 L100 60 L100 94 L88 94 Z" fill="rgba(255,255,255,0.08)" />
      <path d="M100 60 L112 60 L112 94 L100 94 Z" fill="rgba(255,255,255,0.08)" />
    </g>
  ),

  unknown: (
    <g>
      <path d="M100 18 C128 18 136 35 136 66 C136 111 136 130 132 188 C130 204 122 218 110 224 C100 230 100 230 90 224 C78 218 70 204 68 188 C64 130 64 111 64 66 C64 35 72 18 100 18 Z" />
      <path d="M91 98 C16 148 19 160 91 118 Z" />
      <path d="M109 98 C184 148 181 160 109 118 Z" />
      <path d="M34 142 C27 146 27 161 34 169 L48 169 L55 150 Z" />
      <path d="M166 142 C173 146 173 161 166 169 L152 169 L145 150 Z" />
      <path d="M91 196 L52 210 L53 217 L91 203 Z" />
      <path d="M109 196 L148 210 L147 217 L109 203 Z" />
      <ellipse cx="100" cy="202" rx="4" ry="12" />
      <ellipse cx="100" cy="35" rx="11" ry="5" />
    </g>
  ),
}

export default function AircraftSilhouette({ typeCode, size = 180, color = '#00c3ff', glowColor }) {
  const category = getAircraftCategory(typeCode)
  const shape = SILHOUETTES[category] || SILHOUETTES.unknown
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
              values={glowMatrix(glowColor || color)} result="coloredBlur" />
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

function glowMatrix(color) {
  if (!color.startsWith('#') || color.length !== 7) {
    return '0 0 0 0 0   0 0.76 1 0 0   0 0 1 0 0   0 0 0 0.9 0'
  }
  const r = parseInt(color.slice(1, 3), 16) / 255
  const g = parseInt(color.slice(3, 5), 16) / 255
  const b = parseInt(color.slice(5, 7), 16) / 255
  return `0 0 0 0 ${r}   0 0 0 0 ${g}   0 0 0 0 ${b}   0 0 0 0.9 0`
}
