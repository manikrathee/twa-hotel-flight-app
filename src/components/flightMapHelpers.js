import { getAircraftCategory, isKnownAircraftTypeCode, modelLabel } from '../utils/aircraft.js'

export const PLANE_SVG_PATH = `
M17.7448 2.81298C18.7095 1.8165 20.3036 1.80361 21.2843 2.78436C22.2382 3.73823 22.2559 5.27921 21.3243 6.25481L18.5456 9.16457C18.3278 9.39265 18.219 9.50668 18.1518 9.64024C18.0924 9.75847 18.0571 9.88732 18.0478 10.0193C18.0374 10.1684 18.0728 10.3221 18.1438 10.6293L19.8717 18.1169C19.9444 18.4323 19.9808 18.59 19.9691 18.7426C19.9587 18.8776 19.921 19.0091 19.8582 19.1291C19.7873 19.2647 19.6729 19.3792 19.444 19.608L19.0732 19.9788C18.4671 20.585 18.164 20.888 17.8538 20.9429C17.583 20.9908 17.3043 20.925 17.0835 20.761C16.8306 20.5733 16.695 20.1666 16.424 19.3534L14.4142 13.3241L11.0689 16.6695C10.8692 16.8691 10.7694 16.969 10.7026 17.0866C10.6434 17.1907 10.6034 17.3047 10.5846 17.423C10.5633 17.5565 10.5789 17.6968 10.61 17.9775L10.7937 19.6309C10.8249 19.9116 10.8405 20.0519 10.8192 20.1854C10.8004 20.3037 10.7604 20.4177 10.7012 20.5219C10.6344 20.6394 10.5346 20.7393 10.3349 20.939L10.1374 21.1365C9.66434 21.6095 9.42781 21.8461 9.16496 21.9146C8.93442 21.9746 8.68999 21.9504 8.47571 21.8463C8.2314 21.7276 8.04585 21.4493 7.67475 20.8926L6.10643 18.5401C6.04013 18.4407 6.00698 18.391 5.96849 18.3459C5.9343 18.3058 5.89701 18.2685 5.85694 18.2343C5.81184 18.1958 5.76212 18.1627 5.66267 18.0964L3.31018 16.5281C2.75354 16.157 2.47521 15.9714 2.35649 15.7271C2.25236 15.5128 2.22816 15.2684 2.28824 15.0378C2.35674 14.775 2.59327 14.5385 3.06633 14.0654L3.26384 13.8679C3.46352 13.6682 3.56337 13.5684 3.68095 13.5016C3.78511 13.4424 3.89906 13.4024 4.01736 13.3836C4.15089 13.3623 4.29123 13.3779 4.5719 13.4091L6.22529 13.5928C6.50596 13.6239 6.6463 13.6395 6.77983 13.6182C6.89813 13.5994 7.01208 13.5594 7.11624 13.5002C7.23382 13.4334 7.33366 13.3336 7.53335 13.1339L10.8787 9.7886L4.84939 7.77884C4.03616 7.50776 3.62955 7.37222 3.44176 7.11932C3.27777 6.89848 3.212 6.61984 3.2599 6.34898C3.31477 6.03879 3.61784 5.73572 4.22399 5.12957L4.59476 4.7588C4.82365 4.52991 4.9381 4.41546 5.07369 4.34457C5.1937 4.28183 5.3252 4.24411 5.46023 4.23371C5.61278 4.22197 5.77049 4.25836 6.0859 4.33115L13.545 6.05249C13.855 6.12401 14.01 6.15978 14.1596 6.14914C14.3041 6.13886 14.4446 6.09733 14.5714 6.02742C14.7028 5.95501 14.8134 5.84074 15.0347 5.6122L17.7448 2.81298Z
`

const PLANE_PATH = PLANE_SVG_PATH.trim()
const PLANE_STROKE_WIDTH = 0.74
const PLANE_PATH_ROTATION_RADIANS = -45 * (Math.PI / 180)
const PLANE_CANVAS_SIZE = 144
const DISTANCE_NM_PER_KM = 0.5399568
const PLANE_TRACK_GAP_MAX_MS = 18_000
const PLANE_TRACK_GAP_STEP_MS = 2_000
const NO_DATA_LABEL = '—'
const CLIMB_UP_THRESHOLD = 0.35
const CLIMB_DOWN_THRESHOLD = -0.35

const PLANE_TYPE_PROFILE = {
  narrowbody: {
    key: 'narrowbody',
    label: 'Narrowbody Jet',
    iconImage: 'plane-icon-narrowbody',
    iconScale: 1,
  },
  widebody: {
    key: 'widebody',
    label: 'Widebody Jet',
    iconImage: 'plane-icon-widebody',
    iconScale: 1.05,
  },
  regional: {
    key: 'regional',
    label: 'Regional Jet',
    iconImage: 'plane-icon-regional',
    iconScale: 0.98,
  },
  turboprop: {
    key: 'turboprop',
    label: 'Turboprop',
    iconImage: 'plane-icon-turboprop',
    iconScale: 0.92,
  },
  quad: {
    key: 'quad',
    label: 'Quad-Engine',
    iconImage: 'plane-icon-quad',
    iconScale: 1.08,
  },
  a320: {
    key: 'a320',
    label: 'A320 Family',
    iconImage: 'plane-icon-a320',
    iconScale: 1.12,
  },
  b737: {
    key: 'b737',
    label: 'B737 Family',
    iconImage: 'plane-icon-b737',
    iconScale: 1.09,
  },
  b777: {
    key: 'b777',
    label: 'B777 Family',
    iconImage: 'plane-icon-b777',
    iconScale: 1.14,
  },
  a350: {
    key: 'a350',
    label: 'A350 Family',
    iconImage: 'plane-icon-a350',
    iconScale: 1.16,
  },
  a380: {
    key: 'a380',
    label: 'A380 Family',
    iconImage: 'plane-icon-a380',
    iconScale: 1.2,
  },
}

export const PLANE_ICON_TYPES = Object.keys(PLANE_TYPE_PROFILE)
const A320_FAMILY_PREFIXES = ['A318', 'A319', 'A320', 'A321', 'A20N', 'A21N']
const A350_FAMILY_PREFIX = 'A35'
const A380_FAMILY_PREFIX = 'A38'
const B737_FAMILY_PREFIX = 'B73'
const B777_FAMILY_PREFIX = 'B77'

const TOP5_MODEL_PROFILES = [
  { key: 'a320', matcher: code => A320_FAMILY_PREFIXES.some(prefix => code.startsWith(prefix)) },
  { key: 'b737', matcher: code => code.startsWith(B737_FAMILY_PREFIX) },
  { key: 'b777', matcher: code => code.startsWith(B777_FAMILY_PREFIX) },
  { key: 'a350', matcher: code => code.startsWith(A350_FAMILY_PREFIX) },
  { key: 'a380', matcher: code => code.startsWith(A380_FAMILY_PREFIX) },
]

export function buildOverlayPadding(leftPanelWidth = 0, rightPanelWidth = 0) {
  return {
    left: Math.max(16, Math.max(0, Math.round(Number(leftPanelWidth) || 0)) + 10),
    right: Math.max(16, Math.max(0, Math.round(Number(rightPanelWidth) || 0)) + 10),
    top: 16,
    bottom: 16,
  }
}

export function resolveRecenterDecision({
  width,
  height,
  targetPoint,
  leftPanelWidth,
  rightPanelWidth,
  selectedChanged,
  insetsChanged,
  force = false,
  userCameraGesture = false,
  nowMs = Date.now(),
  lastAutoFollowMs = 0,
  driftThresholdPx = { x: 58, y: 38 },
  minIntervalMs = 1000,
}) {
  const canvasWidth = Number(width)
  const canvasHeight = Number(height)
  if (!canvasWidth || !canvasHeight) {
    return null
  }
  if (!targetPoint || !Number.isFinite(targetPoint.x) || !Number.isFinite(targetPoint.y)) {
    return null
  }

  const padding = buildOverlayPadding(leftPanelWidth, rightPanelWidth)

  if (userCameraGesture && !force && !selectedChanged && !insetsChanged) {
    return null
  }

  const visibleWidth = Math.max(1, canvasWidth - padding.left - padding.right)
  const expectedX = padding.left + (visibleWidth / 2)
  const expectedY = padding.top + (Math.max(1, canvasHeight - padding.top - padding.bottom) / 2)

  const driftPx = Math.abs(targetPoint.x - expectedX)
  const driftY = Math.abs(targetPoint.y - expectedY)
  const isOffCanvasX = targetPoint.x < padding.left || targetPoint.x > (canvasWidth - padding.right)
  const isOffCanvasY = targetPoint.y < padding.top || targetPoint.y > (canvasHeight - padding.bottom)
  const isOffCanvas = isOffCanvasX || isOffCanvasY

  const shouldFollow = selectedChanged || insetsChanged || isOffCanvas || driftPx > driftThresholdPx.x || driftY > driftThresholdPx.y
  if (!force && !shouldFollow) {
    return null
  }

  const requiresThrottle = !force && !selectedChanged && !insetsChanged
  if (requiresThrottle && nowMs - lastAutoFollowMs < minIntervalMs) {
    return null
  }

  return {
    padding,
    duration: selectedChanged ? 300 : 220,
    expectedX,
    expectedY,
    driftPx,
    driftY,
    isOffCanvas,
  }
}

function normalizeFlightId(value) {
  return String(value ?? '').trim().toLowerCase()
}

function normalizeTypeCode(value) {
  const text = String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
  return text || null
}

function normalizeNumber(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function normalizeDisplayText(value, fallback) {
  const text = String(value ?? '').trim()
  return text || fallback
}

function normalizeHeading(rawHeading) {
  if (rawHeading === null || rawHeading === undefined || rawHeading === '') return null
  const heading = Number(rawHeading)
  if (!Number.isFinite(heading)) return null
  return (heading % 360 + 360) % 360
}

function resolveHeadingRaw(flight) {
  return normalizeHeading(flight?.heading ?? flight?.true_track)
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function normalizeHeadingDelta(delta) {
  return ((delta + 540) % 360) - 180
}

function blendNumber(prev, next, factor) {
  if (!Number.isFinite(prev)) return next
  if (!Number.isFinite(next)) return prev
  return prev + ((next - prev) * factor)
}

function blendHeading(prev, next, factor) {
  if (!Number.isFinite(prev)) return next
  if (!Number.isFinite(next)) return prev
  return normalizeHeading(prev + (normalizeHeadingDelta(next - prev) * factor))
}

function approximateCoordinateDistanceKm(prev, next) {
  if (!prev || !next) return Infinity
  if (![prev.lng, prev.lat, next.lng, next.lat].every(Number.isFinite)) return Infinity

  const avgLatRad = ((prev.lat + next.lat) / 2) * (Math.PI / 180)
  const lonKm = (next.lng - prev.lng) * 111.32 * Math.cos(avgLatRad)
  const latKm = (next.lat - prev.lat) * 110.574
  return Math.hypot(lonKm, latKm)
}

function resolvePositionSmoothingFactor(prev, next) {
  const gapKm = approximateCoordinateDistanceKm(prev, next)
  if (!Number.isFinite(gapKm)) return 1
  if (next.selected) return gapKm > 0.42 ? 0.72 : 0.56
  if (next.phaseLine === 'GROUND') return gapKm > 0.12 ? 0.84 : 0.66
  if (next.isTakeoffLanding) return gapKm > 0.35 ? 0.68 : 0.42
  if (gapKm > 1.2) return 0.82
  if (gapKm > 0.55) return 0.68
  return 0.52
}

function smoothPlaneSnapshot(prev, next) {
  if (!prev) return next

  const headingFactor = next.isTakeoffLanding ? 0.24 : next.selected ? 0.3 : 0.42

  return {
    ...next,
    lng: blendNumber(prev.lng, next.lng, 1),
    lat: blendNumber(prev.lat, next.lat, 1),
    heading: blendHeading(prev.heading, next.heading, headingFactor),
  }
}

function formatAltitudeFt(altitudeM) {
  if (!Number.isFinite(altitudeM)) return NO_DATA_LABEL
  const ft = Math.round(altitudeM * 3.28084)
  return `${ft.toLocaleString()} ft`
}

function formatSpeedKts(velocityMs) {
  if (!Number.isFinite(velocityMs)) return NO_DATA_LABEL
  const kts = Math.round(velocityMs * 1.94384)
  return `${kts} kt`
}

function formatDistanceNm(distanceKm) {
  if (!Number.isFinite(distanceKm)) return NO_DATA_LABEL
  const nm = Math.round(distanceKm * DISTANCE_NM_PER_KM)
  if (!Number.isFinite(nm)) return NO_DATA_LABEL
  return `${nm.toLocaleString()} nmi`
}

function formatVerticalRateFpm(verticalRateMs) {
  if (!Number.isFinite(verticalRateMs)) return NO_DATA_LABEL
  const fpm = Math.round(verticalRateMs * 196.85)
  return `${fpm >= 0 ? '+' : ''}${fpm} fpm`
}

function formatHeadingDeg(headingRaw) {
  const heading = normalizeHeading(headingRaw)
  if (!Number.isFinite(heading)) return NO_DATA_LABEL
  return `${Math.round(heading)}°`
}

function formatHeadingLine(headingText) {
  if (headingText === NO_DATA_LABEL) return 'HDG —'
  return `HDG ${headingText}`
}

function resolveVerticalTrend(verticalRateMs) {
  if (!Number.isFinite(verticalRateMs)) return 'LEVEL'
  if (verticalRateMs > CLIMB_UP_THRESHOLD) return 'CLIMB'
  if (verticalRateMs < CLIMB_DOWN_THRESHOLD) return 'DESC'
  return 'LEVEL'
}

function buildPlaneTrendText(climbStatus, verticalRateText) {
  if (climbStatus === 'CLIMB') return `Climbing ${verticalRateText}`
  if (climbStatus === 'DESC') return `Descending ${verticalRateText}`
  return 'Level'
}

function buildPlaneTrendSummary(climbStatus, verticalRateText) {
  if (climbStatus === 'CLIMB') return `↑ ${verticalRateText.replace('+', '')}`
  if (climbStatus === 'DESC') return `↓ ${verticalRateText}`
  return '—'
}

function buildPlaneLabelLines({
  identifier,
  planeType,
  planeTypeCode,
  metricLine,
  trendLine,
  trendSummary,
  headingLine,
  phaseLine,
  distanceLine,
}) {
  const id = normalizeDisplayText(identifier, 'Unknown')
  const baseType = normalizeDisplayText(planeType, 'Jet')
  const cleanTypeCode = normalizeDisplayText(planeTypeCode)
  const typeText = cleanTypeCode && cleanTypeCode !== baseType ? `${baseType} · ${cleanTypeCode}` : baseType
  const lineHeader = `${id} · ${typeText}`
  const trendText = trendSummary !== '—' ? trendSummary : trendLine
  const phaseText = phaseLine || ''
  const distanceText = distanceLine || ''
  const compactLineParts = [metricLine, trendText]
    .filter(Boolean)
    .map(value => value.trim())
    .filter(Boolean)
  const expandedContextLine = phaseText || distanceText
  const expandedLineParts = [metricLine, trendText, expandedContextLine, headingLine]
    .filter(Boolean)
    .map(value => value.trim())
    .filter(Boolean)

  const compactLine = compactLineParts.slice(0, 2).join(' · ')
  const expandedLine = expandedLineParts.slice(0, 4)

  return {
    labelCompact: `${lineHeader}\n${compactLine}`,
    labelExpanded: `${lineHeader}\n${expandedLine.join('\n')}`,
  }
}

function resolveModelPlaneProfile(typeCode) {
  if (!typeCode) return null
  for (const rule of TOP5_MODEL_PROFILES) {
    if (rule.matcher(typeCode)) return PLANE_TYPE_PROFILE[rule.key]
  }
  return null
}

function resolvePlaneProfile(flight) {
  const category = normalizeNumber(flight?.category)
  const speedMs = normalizeNumber(flight?.velocity)
  const altitudeM = normalizeNumber(flight?.baro_altitude ?? flight?.geo_altitude)
  const typeCode = normalizeTypeCode(flight?.typecode)
  const modelProfile = resolveModelPlaneProfile(typeCode)
  if (modelProfile) return modelProfile
  const knownTypeProfile = isKnownAircraftTypeCode(typeCode) ? PLANE_TYPE_PROFILE[getAircraftCategory(typeCode)] : null
  if (knownTypeProfile) return knownTypeProfile

  if (typeCode && typeCode.startsWith('A3') && Number.isFinite(altitudeM) && altitudeM > 20_000) {
    return PLANE_TYPE_PROFILE.widebody
  }
  if (typeCode && (typeCode.startsWith('A34') || typeCode.startsWith('B7'))) {
    return PLANE_TYPE_PROFILE.widebody
  }
  if (typeCode && (typeCode.startsWith('B74') || typeCode.startsWith('A38'))) {
    return PLANE_TYPE_PROFILE.quad
  }
  if (typeCode && (typeCode.startsWith('DH') || typeCode.startsWith('AT') || typeCode.startsWith('PC') || typeCode.startsWith('BE'))) {
    return PLANE_TYPE_PROFILE.turboprop
  }
  if (typeCode && (typeCode.startsWith('E') || typeCode.startsWith('CRJ'))) {
    return PLANE_TYPE_PROFILE.regional
  }

  if (
    category === 1 ||
    (Number.isFinite(speedMs) && speedMs < 95 && Number.isFinite(altitudeM) && altitudeM < 2800)
  ) {
    return PLANE_TYPE_PROFILE.turboprop
  }

  if (category === 4 || category === 5 || (Number.isFinite(speedMs) && speedMs > 235 && Number.isFinite(altitudeM) && altitudeM > 9000)) {
    return PLANE_TYPE_PROFILE.widebody
  }

  if (category === 6 || category === 7 || category === 8) {
    return PLANE_TYPE_PROFILE.quad
  }

  if (category === 2 || category === 3 || (Number.isFinite(altitudeM) && altitudeM < 5500 && Number.isFinite(speedMs) && speedMs < 160)) {
    return PLANE_TYPE_PROFILE.regional
  }

  return PLANE_TYPE_PROFILE.narrowbody
}

function buildPlaneMetricText(altitudeText, speedText) {
  const altitude = altitudeText === NO_DATA_LABEL ? '—' : altitudeText
  const speed = speedText === NO_DATA_LABEL ? '—' : speedText
  return `ALT ${altitude} · SPD ${speed}`
}

export function buildPlanePopupText(feature) {
  const props = feature?.properties || feature || {}
  const identifier = normalizeDisplayText(
    props.identifier ?? props.callsign ?? props.icao24,
    'Unknown',
  )
  const type = normalizeDisplayText(props.planeType, 'Jet')
  const typeCode = normalizeDisplayText(props.planeTypeCode)
  const typeLabel = typeCode && !type.includes(typeCode) ? `${type} · ${typeCode}` : type
  const rawMetricLine = normalizeDisplayText(props.metricLine, 'ALT — · SPD —')
  const metricLine = rawMetricLine === 'No telemetry' ? 'ALT — · SPD —' : rawMetricLine
  const trendLine = normalizeDisplayText(props.trendLine, 'Level')
  const trendSummary = normalizeDisplayText(props.trendSummary, '—')
  const headingLine = normalizeDisplayText(props.headingLine, 'HDG —')
  const trendDisplay = trendSummary !== '—' ? trendSummary : trendLine
  const distanceLine = normalizeDisplayText(props.distanceLine)
  const phaseLine = normalizeDisplayText(props.phaseLine)
  const detailParts = [metricLine]
  if (trendDisplay) detailParts.push(trendDisplay)
  if (distanceLine) detailParts.push(distanceLine)
  if (phaseLine) detailParts.push(phaseLine)
  if (headingLine !== 'HDG —') detailParts.push(headingLine)
  const detailLine = detailParts.join(' · ')
  const statusParts = [trendLine]
  if (phaseLine) statusParts.push(phaseLine)
  if (headingLine !== 'HDG —') statusParts.push(headingLine)
  const statusLine = statusParts.join(' · ')

  return `${identifier} · ${typeLabel}\n${detailLine}\n${statusLine}`
}

function drawDetailNarrowbody(ctx) {
  ctx.beginPath()
  ctx.moveTo(16.9, 11.2)
  ctx.lineTo(19.4, 9.8)
  ctx.moveTo(16.9, 12.8)
  ctx.lineTo(19.4, 14.2)
  ctx.moveTo(7.1, 11.2)
  ctx.lineTo(4.6, 9.8)
  ctx.moveTo(7.1, 12.8)
  ctx.lineTo(4.6, 14.2)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(11.8, 11.2)
  ctx.lineTo(14.9, 11.2)
  ctx.moveTo(12.5, 10.5)
  ctx.lineTo(12.5, 11.9)
  ctx.moveTo(10.9, 10.6)
  ctx.lineTo(10.9, 12)
  ctx.moveTo(13.9, 10.5)
  ctx.lineTo(13.9, 12.0)
  ctx.stroke()
}

function drawDetailWidebody(ctx) {
  ctx.beginPath()
  ctx.moveTo(16.8, 9.8)
  ctx.lineTo(20.8, 8.4)
  ctx.moveTo(16.8, 14.2)
  ctx.lineTo(20.8, 15.6)
  ctx.moveTo(7.2, 9.8)
  ctx.lineTo(3.2, 8.4)
  ctx.moveTo(7.2, 14.2)
  ctx.lineTo(3.2, 15.6)
  ctx.stroke()

  ctx.beginPath()
  ctx.arc(15.8, 11.2, 0.62, 0, Math.PI * 2)
  ctx.arc(18.9, 11.2, 0.62, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(4.4, 10.2)
  ctx.lineTo(7.2, 11.2)
  ctx.moveTo(4.4, 12.2)
  ctx.lineTo(7.2, 11.2)
  ctx.moveTo(18.2, 10.2)
  ctx.lineTo(15.4, 11.2)
  ctx.moveTo(18.2, 12.2)
  ctx.lineTo(15.4, 11.2)
  ctx.stroke()
}

function drawDetailRegional(ctx) {
  ctx.beginPath()
  ctx.moveTo(5.2, 10.8)
  ctx.lineTo(7.8, 8.8)
  ctx.lineTo(9.0, 11.0)
  ctx.moveTo(5.2, 11.8)
  ctx.lineTo(9.0, 11.8)
  ctx.moveTo(18.8, 10.8)
  ctx.lineTo(16.2, 8.8)
  ctx.lineTo(15.0, 11.0)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(11.7, 10.7, 1.05, 0, Math.PI * 2)
  ctx.arc(12.3, 11.6, 1.05, 0, Math.PI * 2)
  ctx.stroke()
}

function drawDetailTurboprop(ctx) {
  ctx.beginPath()
  ctx.moveTo(14.2, 11.6)
  ctx.lineTo(17.7, 11.6)
  ctx.moveTo(15.8, 10.0)
  ctx.lineTo(16.1, 12.6)
  ctx.lineTo(15.0, 12.6)
  ctx.lineTo(15.3, 10.0)
  ctx.closePath()
  ctx.fill()

  ctx.beginPath()
  ctx.arc(12.0, 9.8, 0.7, 0, Math.PI * 2)
  ctx.arc(12.0, 11.2, 0.7, 0, Math.PI * 2)
  ctx.arc(12.0, 12.6, 0.7, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(12, 8.0)
  ctx.lineTo(12, 6.4)
  ctx.moveTo(11.5, 6.4)
  ctx.lineTo(12.5, 6.4)
  ctx.stroke()
}

function drawDetailQuad(ctx) {
  ctx.beginPath()
  ctx.arc(8.8, 12.2, 0.5, 0, Math.PI * 2)
  ctx.arc(15.2, 12.2, 0.5, 0, Math.PI * 2)
  ctx.arc(8.8, 10.2, 0.5, 0, Math.PI * 2)
  ctx.arc(15.2, 10.2, 0.5, 0, Math.PI * 2)
  ctx.fill()

  ctx.beginPath()
  ctx.moveTo(8.8, 10.6)
  ctx.lineTo(7.6, 9.0)
  ctx.moveTo(15.2, 10.6)
  ctx.lineTo(16.4, 9.0)
  ctx.moveTo(8.8, 11.8)
  ctx.lineTo(7.6, 13.4)
  ctx.moveTo(15.2, 11.8)
  ctx.lineTo(16.4, 13.4)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(9.0, 12.0)
  ctx.lineTo(9.0, 13.6)
  ctx.moveTo(15.0, 12.0)
  ctx.lineTo(15.0, 13.6)
  ctx.moveTo(6.8, 12.0)
  ctx.lineTo(7.6, 12.0)
  ctx.moveTo(16.4, 12.0)
  ctx.lineTo(17.2, 12.0)
  ctx.stroke()
}

function drawDetailA320(ctx) {
  drawDetailNarrowbody(ctx)
  ctx.beginPath()
  ctx.moveTo(13.6, 10.5)
  ctx.lineTo(20.6, 9.9)
  ctx.moveTo(20.6, 12.5)
  ctx.lineTo(13.6, 11.9)
  ctx.moveTo(11.8, 9.6)
  ctx.lineTo(4.9, 9.0)
  ctx.moveTo(11.8, 12.8)
  ctx.lineTo(4.9, 13.4)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(4.9, 9.0)
  ctx.lineTo(4.1, 8.4)
  ctx.moveTo(4.9, 13.4)
  ctx.lineTo(4.1, 14.0)
  ctx.stroke()
}

function drawDetailB737(ctx) {
  drawDetailNarrowbody(ctx)
  ctx.beginPath()
  ctx.moveTo(13.4, 9.6)
  ctx.lineTo(18.8, 8.3)
  ctx.moveTo(18.8, 14.1)
  ctx.lineTo(13.4, 12.8)
  ctx.moveTo(6.6, 9.6)
  ctx.lineTo(1.2, 8.3)
  ctx.moveTo(6.6, 12.8)
  ctx.lineTo(1.2, 14.1)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(9.0, 10.8, 1.2, 0, Math.PI * 2)
  ctx.arc(9.0, 11.8, 1.2, 0, Math.PI * 2)
  ctx.fill()
}

function drawDetailB777(ctx) {
  drawDetailWidebody(ctx)
  ctx.beginPath()
  ctx.moveTo(16.6, 11)
  ctx.lineTo(22.2, 9.6)
  ctx.moveTo(16.6, 11.4)
  ctx.lineTo(22.2, 12.8)
  ctx.moveTo(7.4, 11)
  ctx.lineTo(1.8, 9.6)
  ctx.moveTo(7.4, 11.4)
  ctx.lineTo(1.8, 12.8)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(10.6, 10.0, 1.4, 0, Math.PI * 2)
  ctx.arc(10.6, 12.2, 1.4, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.arc(13.4, 10.0, 0.8, 0, Math.PI * 2)
  ctx.arc(13.4, 12.2, 0.8, 0, Math.PI * 2)
  ctx.fill()
}

function drawDetailA350(ctx) {
  drawDetailWidebody(ctx)
  ctx.beginPath()
  ctx.moveTo(8.0, 11.6)
  ctx.lineTo(2.2, 11.6)
  ctx.moveTo(16.0, 11.6)
  ctx.lineTo(21.8, 11.6)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(2.6, 10.4)
  ctx.lineTo(7.2, 8.4)
  ctx.moveTo(2.6, 12.8)
  ctx.lineTo(7.2, 14.8)
  ctx.moveTo(21.4, 10.4)
  ctx.lineTo(16.8, 8.4)
  ctx.moveTo(21.4, 12.8)
  ctx.lineTo(16.8, 14.8)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(9.8, 11.2, 0.6, 0, Math.PI * 2)
  ctx.arc(14.2, 11.2, 0.6, 0, Math.PI * 2)
  ctx.fill()
}

function drawDetailA380(ctx) {
  drawDetailQuad(ctx)
  ctx.beginPath()
  ctx.moveTo(6.0, 11.3)
  ctx.lineTo(1.2, 10.0)
  ctx.moveTo(6.0, 11.7)
  ctx.lineTo(1.2, 13.0)
  ctx.moveTo(18.0, 11.3)
  ctx.lineTo(22.8, 10.0)
  ctx.moveTo(18.0, 11.7)
  ctx.lineTo(22.8, 13.0)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(8.2, 10.0, 0.8, 0, Math.PI * 2)
  ctx.arc(8.2, 12.4, 0.8, 0, Math.PI * 2)
  ctx.arc(15.8, 10.0, 0.8, 0, Math.PI * 2)
  ctx.arc(15.8, 12.4, 0.8, 0, Math.PI * 2)
  ctx.fill()
}

const PLANE_DETAIL_RENDERERS = {
  narrowbody: drawDetailNarrowbody,
  widebody: drawDetailWidebody,
  regional: drawDetailRegional,
  turboprop: drawDetailTurboprop,
  quad: drawDetailQuad,
  a320: drawDetailA320,
  b737: drawDetailB737,
  b777: drawDetailB777,
  a350: drawDetailA350,
  a380: drawDetailA380,
}

function interpolateTrackCoordinates(points, {
  maxGapMs = PLANE_TRACK_GAP_MAX_MS,
  stepMs = PLANE_TRACK_GAP_STEP_MS,
} = {}) {
  if (!Array.isArray(points) || points.length < 2) return []

  const out = []
  const maxGapStep = Math.max(250, stepMs)

  for (let i = 0; i < points.length; i += 1) {
    const current = points[i]
    if (!current) continue

    out.push([current.lon, current.lat])

    const next = points[i + 1]
    if (!next) continue
    if (!Number.isFinite(next.timeMs) || !Number.isFinite(current.timeMs)) continue
    const gapMs = next.timeMs - current.timeMs
    if (gapMs <= 0 || gapMs > maxGapMs || gapMs <= maxGapStep) continue

    const steps = Math.floor(gapMs / maxGapStep)
    if (steps <= 1) continue

    const stepLat = (next.lat - current.lat) / steps
    const stepLon = (next.lon - current.lon) / steps

    for (let step = 1; step < steps; step += 1) {
      const ratio = step / steps
      if (ratio <= 0 || ratio >= 1) continue
      out.push([
        current.lon + stepLon * step,
        current.lat + stepLat * step,
      ])
    }
  }

  return out
}

function drawAirlinerShape(ctx, size) {
  const sourceWidth = 24
  const sourceHeight = 24
  const scale = (size * 0.86) / Math.max(sourceWidth, sourceHeight)
  const transform = {
    sx: scale,
    sy: scale,
    x: (size - sourceWidth * scale) / 2,
    y: (size - sourceHeight * scale) / 2,
  }

  const cx = sourceWidth / 2
  const cy = sourceHeight / 2
  const glow = ctx.createRadialGradient(
    cx * scale + transform.x,
    cy * scale + transform.y,
    size * 0.02,
    cx * scale + transform.x,
    cy * scale + transform.y,
    size * 0.5,
  )
  glow.addColorStop(0, 'rgba(255, 255, 255, 0.28)')
  glow.addColorStop(1, 'rgba(255, 255, 255, 0)')
  ctx.fillStyle = glow
  ctx.beginPath()
  ctx.arc(
    cx * scale + transform.x,
    cy * scale + transform.y,
    size * 0.5,
    0,
    Math.PI * 2,
  )
  ctx.fill()

  // Plane stroke from supplied SVG path
  ctx.save()
  ctx.translate(transform.x, transform.y)
  ctx.scale(transform.sx, transform.sy)
  ctx.translate(cx, cy)
  ctx.rotate(PLANE_PATH_ROTATION_RADIANS)
  ctx.translate(-cx, -cy)
  const planePath = new Path2D(PLANE_PATH)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.055)'
  ctx.fill(planePath)
  ctx.strokeStyle = 'white'
  ctx.lineWidth = PLANE_STROKE_WIDTH
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.stroke(planePath)
  ctx.restore()
}

export function createPlaneImageData(profileKey = PLANE_TYPE_PROFILE.narrowbody.key) {
  const config = PLANE_TYPE_PROFILE[profileKey] || PLANE_TYPE_PROFILE.narrowbody
  const size = PLANE_CANVAS_SIZE
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, size, size)
  const detailRenderer = PLANE_DETAIL_RENDERERS[config.key] || PLANE_DETAIL_RENDERERS.narrowbody

  drawAirlinerShape(ctx, size)
  const sourceWidth = 24
  const sourceHeight = 24
  const scale = (size * 0.86) / Math.max(sourceWidth, sourceHeight)
  const transform = {
    sx: scale,
    sy: scale,
    x: (size - sourceWidth * scale) / 2,
    y: (size - sourceHeight * scale) / 2,
  }
  const cx = sourceWidth / 2
  const cy = sourceHeight / 2

  ctx.save()
  ctx.translate(transform.x, transform.y)
  ctx.scale(transform.sx, transform.sy)
  ctx.translate(cx, cy)
  ctx.rotate(PLANE_PATH_ROTATION_RADIANS)
  ctx.translate(-cx, -cy)
  ctx.strokeStyle = 'white'
  ctx.lineWidth = clamp(ctx.lineWidth * 1.15, 0.45, 0.9)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.fillStyle = 'white'
  detailRenderer(ctx)
  ctx.restore()

  return ctx.getImageData(0, 0, size, size)
}

export function buildPlaneFeatures(flights, selectedIcao, options = {}) {
  const target = normalizeFlightId(selectedIcao)
  const suppressInactiveLabels = options?.suppressInactiveLabels === true

  return flights
    .map((f, index) => {
      const icao24 = normalizeFlightId(f?.icao24)
      if (!icao24 || f?.latitude == null || f?.longitude == null) return null
      const latitude = Number(f.latitude)
      const longitude = Number(f.longitude)
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null

      const altitudeM = normalizeNumber(f.baro_altitude ?? f.geo_altitude)
      const speedMs = normalizeNumber(f.velocity)
      const verticalRateMs = normalizeNumber(f.vertical_rate)
      const altitudeText = formatAltitudeFt(altitudeM)
      const speedText = formatSpeedKts(speedMs)
      const verticalRateText = formatVerticalRateFpm(verticalRateMs)
      const climb = resolveVerticalTrend(verticalRateMs)
      const metricLine = buildPlaneMetricText(altitudeText, speedText)
      const profile = resolvePlaneProfile(f)
      const typeCode = normalizeTypeCode(f?.typecode)
      const displayType = modelLabel(null, null, typeCode) || profile.label
      const includeTypeCode = typeCode && !displayType.includes(typeCode)
      const trendLine = buildPlaneTrendText(climb, verticalRateText)
      const trendSummary = buildPlaneTrendSummary(climb, verticalRateText)
      const isTakeoffLanding = f?.on_ground !== true && Number.isFinite(altitudeM) && altitudeM < 2200 && Number.isFinite(speedMs) && speedMs > 30
      const phaseLine = f?.on_ground === true ? 'GROUND' : isTakeoffLanding ? 'DEP / ARR' : null
      const heading = resolveHeadingRaw(f)
      const headingForRotation = Number.isFinite(heading) ? heading : 0
      const headingText = formatHeadingDeg(heading)
      const distanceKm = normalizeNumber(f.distKm)
      const distanceLine = Number.isFinite(distanceKm) ? formatDistanceNm(distanceKm) : null
      const selected = icao24 === target
      const showInactiveLabel = !selected && !suppressInactiveLabels && index < 10
      const showInactiveExpandedLabel = showInactiveLabel && index < 6
      const labels = buildPlaneLabelLines({
        identifier: normalizeDisplayText(f.callsign, icao24),
        planeType: displayType,
        planeTypeCode: includeTypeCode ? typeCode : null,
        metricLine,
        trendLine,
        trendSummary,
        phaseLine,
        distanceLine,
        headingLine: formatHeadingLine(headingText),
      })
      const iconScale = Number.isFinite(profile?.iconScale) && profile.iconScale > 0 ? profile.iconScale : 1

      return {
        type: 'Feature',
        properties: {
          icao24,
          identifier: normalizeDisplayText(f.callsign, icao24),
          callsign: normalizeDisplayText(f.callsign, icao24),
          heading: headingForRotation,
          headingText,
          headingLine: formatHeadingLine(headingText),
          planeIcon: profile.iconImage,
          planeType: displayType,
          planeTypeKey: profile.key,
          planeTypeCode: typeCode || null,
          altitudeM,
          speedMs,
          verticalRateMs,
          altitudeText,
          speedText,
          verticalRateText,
          isTakeoffLanding,
          climbStatus: climb,
          trendLine,
          trendSummary,
          distanceLine: distanceLine || null,
          phaseLine: phaseLine || null,
          selected,
          showInactiveLabel,
          showInactiveExpandedLabel,
          metricLine,
          iconScale,
          ...labels,
        },
        geometry: { type: 'Point', coordinates: [longitude, latitude] },
      }
    })
    .filter(Boolean)
}

function snapshotForPlaneFeature(feature) {
  return {
    lng: feature.geometry?.coordinates?.[0],
    lat: feature.geometry?.coordinates?.[1],
    heading: feature.properties?.heading,
    selected: feature.properties?.selected,
    showInactiveLabel: feature.properties?.showInactiveLabel,
    showInactiveExpandedLabel: feature.properties?.showInactiveExpandedLabel,
    callsign: feature.properties?.callsign,
    identifier: feature.properties?.identifier,
    planeIcon: feature.properties?.planeIcon,
    planeType: feature.properties?.planeType,
    planeTypeKey: feature.properties?.planeTypeKey,
    headingText: feature.properties?.headingText,
    headingLine: feature.properties?.headingLine,
    altitudeText: feature.properties?.altitudeText,
    speedText: feature.properties?.speedText,
    verticalRateText: feature.properties?.verticalRateText,
    planeTypeCode: feature.properties?.planeTypeCode,
    altitudeM: feature.properties?.altitudeM,
    speedMs: feature.properties?.speedMs,
    verticalRateMs: feature.properties?.verticalRateMs,
    isTakeoffLanding: feature.properties?.isTakeoffLanding,
    climbStatus: feature.properties?.climbStatus,
    trendLine: feature.properties?.trendLine,
    trendSummary: feature.properties?.trendSummary,
    distanceLine: feature.properties?.distanceLine,
    phaseLine: feature.properties?.phaseLine,
    labelCompact: feature.properties?.labelCompact,
    labelExpanded: feature.properties?.labelExpanded,
    metricLine: feature.properties?.metricLine,
    iconScale: feature.properties?.iconScale,
  }
}

function hasPlaneFeatureChanged(prev, next) {
  if (!prev || !next) return true
  const prevKeys = Object.keys(prev)
  const nextKeys = Object.keys(next)
  if (prevKeys.length !== nextKeys.length) return true

  for (const key of nextKeys) {
    if (prev[key] !== next[key]) return true
  }

  return false
}

export function buildPlaneSourceDiff(features, prevState) {
  const nextSet = new Set()
  const add = []
  const update = []
  const nextState = new Map()
  const isMapState = prevState instanceof Map

  // updateData requires GeoJSONFeatureDiff shape for update entries.
  for (const f of features) {
    const id = f.properties.icao24
    if (!id) continue
    nextSet.add(id)

    if (!isMapState) {
      const snapshot = snapshotForPlaneFeature(f)
      nextState.set(id, snapshot)
      const isPrevious = prevState?.has?.(id)
      if (isPrevious) {
        update.push({
          id,
          newGeometry: f.geometry,
          addOrUpdateProperties: Object.entries(f.properties).map(([key, value]) => ({ key, value })),
        })
      } else {
        add.push(f)
      }
      continue
    }

    const prev = prevState.get(id)
    if (!prev) {
      nextState.set(id, snapshotForPlaneFeature(f))
      add.push(f)
      continue
    }

    const next = smoothPlaneSnapshot(prev, snapshotForPlaneFeature(f))
    nextState.set(id, next)
    if (hasPlaneFeatureChanged(prev, next)) {
      const addOrUpdateProperties = Object.entries(next)
        .map(([key, value]) => ({ key, value: value === undefined ? null : value }))
      update.push({
        id,
        newGeometry: {
          type: 'Point',
          coordinates: [next.lng, next.lat],
        },
        addOrUpdateProperties,
      })
    }
  }

  const remove = []
  if (isMapState) {
    for (const id of prevState.keys()) {
      if (!nextSet.has(id)) remove.push(id)
    }
  } else if (prevState) {
    for (const id of prevState) {
      if (!nextSet.has(id)) remove.push(id)
    }
  }

  return { add, update, remove, nextSet, nextState }
}

export function planeFeatureStateMap(features) {
  const state = new Map()
  for (const f of features) {
    const id = f?.properties?.icao24
    if (!id) continue
    state.set(id, snapshotForPlaneFeature(f))
  }
  return state
}

export function getTrackCoordinates(track, cutoffSec) {
  if (!track?.path?.length) return []

  const rawPath = track.path
    .filter(p => p?.length >= 3)
    .map(p => ({
      timeMs: Number(p[0]) * 1000,
      lat: p[1],
      lon: p[2],
    }))
    .filter(p =>
      Number.isFinite(p.timeMs) &&
      Number.isFinite(p.lat) &&
      Number.isFinite(p.lon)
    )
    .sort((a, b) => a.timeMs - b.timeMs)

  const cutoffMs = cutoffSec * 1000
  const recentPath = rawPath.filter(p => p.timeMs >= cutoffMs)
  const pathToUse = recentPath.length >= 2 ? recentPath : rawPath

  return interpolateTrackCoordinates(pathToUse)
}
