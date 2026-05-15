// ICAO airline prefix → airline name
const AIRLINE_LOOKUP = {
  AAL: 'American Airlines', UAL: 'United Airlines', DAL: 'Delta Air Lines',
  SWA: 'Southwest Airlines', JBU: 'JetBlue Airways', ASA: 'Alaska Airlines',
  BAW: 'British Airways', DLH: 'Lufthansa', AFR: 'Air France',
  KLM: 'KLM', EIN: 'Aer Lingus', VIR: 'Virgin Atlantic',
  UAE: 'Emirates', QTR: 'Qatar Airways', ETH: 'Ethiopian Airlines',
  AIC: 'Air India', SIA: 'Singapore Airlines', CPA: 'Cathay Pacific',
  QFA: 'Qantas', ELY: 'El Al', TAM: 'LATAM Airlines',
  GLO: 'GOL Linhas Aéreas', AZU: 'Azul Brazilian Airlines',
  THY: 'Turkish Airlines', AZA: 'ITA Airways', TGW: 'TUI Airways',
  NKS: 'Spirit Airlines', FFT: 'Frontier Airlines', HAL: 'Hawaiian Airlines',
  RPA: 'Republic Airways', PDT: 'Piedmont Airlines', OPT: 'PSA Airlines',
  SKW: 'SkyWest Airlines', ENY: 'Envoy Air', FXE: 'FedEx Feeder',
  FDX: 'FedEx Express', UPS: 'UPS Airlines', ABX: 'ABX Air',
  DHL: 'DHL Aviation', GIA: 'Garuda Indonesia', MAS: 'Malaysia Airlines',
  JAL: 'Japan Airlines', ANA: 'All Nippon Airways', KAL: 'Korean Air',
  OZZ: 'Asiana Airlines', CCA: 'Air China', CSN: 'China Southern',
  CES: 'China Eastern', SVA: 'Saudia', ETD: 'Etihad Airways',
  IBE: 'Iberia', VLG: 'Vueling', AEA: 'Air Europa',
  TAP: 'TAP Air Portugal', SAS: 'SAS', AUA: 'Austrian Airlines',
  BEL: 'Brussels Airlines', FIN: 'Finnair', WZZ: 'Wizz Air',
  RYR: 'Ryanair', EZY: 'easyJet', TOM: 'TUI Airways',
  TCX: 'TUI fly', AMX: 'Aeromexico', MXY: 'Aeromexico Connect',
  ACA: 'Air Canada', WJA: 'WestJet', TRZ: 'Transat',
  SRS: 'Sunwing', CMP: 'Copa Airlines', AVA: 'Avianca',
}

// Aircraft type code → category
const NARROW_BODY = new Set([
  'B737', 'B738', 'B739', 'B73H', 'B732', 'B733', 'B734', 'B735', 'B736',
  'A319', 'A320', 'A321', 'A20N', 'A21N', 'A318', 'A319N',
  'B752', 'B753', 'B757',
  'B727', 'MD82', 'MD83', 'MD88', 'MD90',
  'B717', 'DC93',
])

const WIDE_BODY_TWIN = new Set([
  'B767', 'B762', 'B763', 'B764', 'B76W',
  'B772', 'B773', 'B77L', 'B77W', 'B778', 'B779', 'B77X',
  'B787', 'B788', 'B789', 'B78X',
  'A332', 'A333', 'A338', 'A339',
  'A359', 'A35K',
  'A306', 'A30B', 'A310',
])

const QUAD_JET = new Set([
  'A388', 'A380',
  'B744', 'B748', 'B74S', 'B741', 'B742', 'B743', 'B74D',
  'DC86', 'DC87', 'DC85',
])

const REGIONAL_JET = new Set([
  'E170', 'E175', 'E190', 'E195', 'E7W8', 'E175L', 'E290',
  'CRJ2', 'CRJ7', 'CRJ9', 'CRJX', 'CL60',
  'F100', 'F70', 'B463',
])

const TURBOPROP = new Set([
  'DH8A', 'DH8B', 'DH8C', 'DH8D', 'AT43', 'AT45', 'AT72', 'AT75', 'AT76',
  'SF34', 'BE20', 'C208', 'PC12', 'MA60',
])

export function getAircraftCategory(typeCode) {
  if (!typeCode) return 'unknown'
  const t = typeCode.toUpperCase()
  if (QUAD_JET.has(t)) return 'quad'
  if (WIDE_BODY_TWIN.has(t)) return 'widebody'
  if (NARROW_BODY.has(t)) return 'narrowbody'
  if (REGIONAL_JET.has(t)) return 'regional'
  if (TURBOPROP.has(t)) return 'turboprop'
  return 'narrowbody' // sensible default for commercial
}

export function getAirlineName(callsign) {
  if (!callsign) return null
  const prefix = callsign.replace(/\d+.*$/, '').trim().toUpperCase()
  return AIRLINE_LOOKUP[prefix] || null
}

export function parseFlightNumber(callsign) {
  if (!callsign) return null
  const m = callsign.match(/^([A-Z]{2,3})(\d+.*)$/)
  if (!m) return callsign
  return `${m[1]} ${m[2]}`
}

// Human-readable model label
export function modelLabel(manufacturer, model, typeCode) {
  if (model) return model
  if (typeCode) {
    const labels = {
      B737: 'Boeing 737', B738: 'Boeing 737-800', B739: 'Boeing 737-900',
      A319: 'Airbus A319', A320: 'Airbus A320', A321: 'Airbus A321',
      A20N: 'Airbus A320neo', A21N: 'Airbus A321neo',
      B752: 'Boeing 757-200', B767: 'Boeing 767',
      B772: 'Boeing 777-200', B773: 'Boeing 777-300', B77W: 'Boeing 777-300ER',
      B788: 'Boeing 787-8', B789: 'Boeing 787-9', B78X: 'Boeing 787-10',
      A332: 'Airbus A330-200', A333: 'Airbus A330-300',
      A359: 'Airbus A350-900', A35K: 'Airbus A350-1000',
      A388: 'Airbus A380', B744: 'Boeing 747-400', B748: 'Boeing 747-8',
      E190: 'Embraer E190', E175: 'Embraer E175',
      CRJ9: 'Bombardier CRJ-900', DH8D: 'Bombardier Q400',
    }
    return labels[typeCode.toUpperCase()] || typeCode
  }
  return 'Unknown Aircraft'
}

// Engine count hint
export function engineCount(category) {
  if (category === 'quad') return 4
  if (category === 'turboprop') return 2
  return 2
}
