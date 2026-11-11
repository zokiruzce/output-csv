// Column layout of output.csv (no header row, 18 columns, field_01..field_18),
// as used in production. It differs from the original requirements in
// fields 12–16: GOVT Trade uses 11 (price) + 12 (yield), MMKT Trade and
// FX Fixing share one rate in field 15, and 13, 14, 16 stay empty.
// `key`   — internal name used by the app and the records saved in the browser.
// `name`  — field name; used as the JSON key.
// `label` — text shown on screen.
// `max`   — maximum length in characters; longer values are an error, never cut.
export const COLUMNS = [
  { key: 'instrument', name: 'instrument_id', label: 'ISIN', kind: 'text', max: 12 },        // field_01: UZA000002255, 1D, USD/UZS_TOM
  { key: 'ticker', name: 'instrument_code', label: 'Issue Code', kind: 'text', max: 7 },    // field_02: 24094UM, 1D, 3766
  { key: 'market', name: 'market_type', label: 'Market', kind: 'text', max: 4 },            // field_03: GOVT | MMKT | FX
  { key: 'type', name: 'record_type', label: 'Type', kind: 'text', max: 6 },                // field_04: Bid | Offer | Trade | Fixing
  { key: 'offerPrice', name: 'offer_price', label: 'Offer price', kind: 'number', max: 8 },     // field_05
  { key: 'bidPrice', name: 'bid_price', label: 'Bid price', kind: 'number', max: 8 },           // field_06
  { key: 'offerYield', name: 'offer_yield', label: 'Offer yield', kind: 'number', max: 8 },     // field_07
  { key: 'bidYield', name: 'bid_yield', label: 'Bid yield', kind: 'number', max: 8 },           // field_08
  { key: 'offerRate', name: 'offer_rate', label: 'Offer rate', kind: 'number', max: 4 },        // field_09 — not used (MMKT Offer not confirmed)
  { key: 'bidRate', name: 'bid_rate', label: 'Bid rate', kind: 'number', max: 4 },              // field_10 — not used (MMKT Bid not confirmed)
  { key: 'tradePrice', name: 'trade_price', label: 'Trade price', kind: 'number', max: 8 },     // field_11: GOVT Trade, dirty price % of par
  { key: 'tradeYield', name: 'trade_yield', label: 'Trade yield', kind: 'number', max: 8 },     // field_12: GOVT Trade, yield to maturity
  { key: 'field13', name: 'field_13', label: 'Field 13', kind: 'number', max: 8 },              // field_13 — reserved, always empty
  { key: 'field14', name: 'field_14', label: 'Field 14', kind: 'number', max: 8 },              // field_14 — reserved, always empty
  { key: 'rate', name: 'rate', label: 'Rate', kind: 'number', max: 10 },                         // field_15: MMKT Trade rate, FX Fixing rate (e.g. 11903.15)
  { key: 'field16', name: 'field_16', label: 'Field 16', kind: 'number', max: 4 },              // field_16 — reserved, always empty
  { key: 'volume', name: 'volume', label: 'Volume', kind: 'number', max: 12 },                   // field_17
  { key: 'timestamp', name: 'timestamp', label: 'Timestamp', kind: 'text', max: 25 },            // field_18: 2025-01-07T09:49:49+05:00
];

// The market/type combinations seen in production, and the value fields each
// one fills (all of them are required). Any other combination is not written.
// MMKT Bid / Offer / Fixing are not confirmed yet — add them here when they are.
export const COMBOS = {
  GOVT: {
    Bid: ['bidPrice', 'bidYield'],
    Offer: ['offerPrice', 'offerYield'],
    Trade: ['tradePrice', 'tradeYield'],
  },
  MMKT: {
    Trade: ['rate'],
  },
  FX: {
    Fixing: ['rate'],
  },
};

export const MARKETS = Object.keys(COMBOS);

// Record types allowed for a market, e.g. typesFor('FX') -> ['Fixing'].
export function typesFor(market) {
  return Object.keys(COMBOS[market] ?? {});
}

// Value fields for a market/type pair; empty if the combination is not allowed.
export function valueKeysFor(market, type) {
  return COMBOS[market]?.[type] ?? [];
}

export const VALUE_KEYS = COLUMNS.slice(4, 16).map((c) => c.key);

export function emptyRecord() {
  return Object.fromEntries(COLUMNS.map((c) => [c.key, '']));
}

const JSON_NUMBER_RE = /^(0|[1-9]\d*)(\.\d+)?$/;

// Number written exactly as entered, so precision is kept ("12.300" stays
// 12.300, not 12.3). Leading zeros ("02.20") are dropped because JSON does
// not allow them.
function jsonNumber(v) {
  const n = v.replace(/^0+(?=\d)/, '');
  return JSON_NUMBER_RE.test(n) ? n : JSON.stringify(v);
}

// Form records -> JSON text: an array of objects keyed by the official field
// names, in field_01..field_18 order. Empty fields are null.
export function toJsonText(records) {
  const objects = records.map((record) => {
    const lines = COLUMNS.map(({ key, name, kind }) => {
      const v = String(record[key] ?? '').trim();
      const value = v === '' ? 'null' : kind === 'number' ? jsonNumber(v) : JSON.stringify(v);
      return `    ${JSON.stringify(name)}: ${value}`;
    });
    return `  {\n${lines.join(',\n')}\n  }`;
  });
  return `[\n${objects.join(',\n')}\n]\n`;
}

// JSON object -> form record (all strings). Accepts the official field names
// and the older internal keys.
export function fromJson(obj) {
  return Object.fromEntries(
    COLUMNS.map(({ key, name }) => {
      const v = obj[name] ?? obj[key];
      return [key, v == null ? '' : String(v)];
    })
  );
}

export function fromCsvLine(line) {
  const cells = line.split(',');
  return Object.fromEntries(COLUMNS.map(({ key }, i) => [key, (cells[i] ?? '').trim()]));
}

// Form record -> one line in the source CSV format (18 columns, no header).
export function toCsvLine(record) {
  return COLUMNS.map(({ key }) => String(record[key] ?? '').trim()).join(',');
}

// GOVT issue number from the source -> 7-character instrument_code (requirements §2):
//   1. drop a trailing "FS":                      28031UMFS  -> 28031UM
//   2. 6-digit number starting with "20" loses the "0": 201006UMFS -> 21006UM
export function normalizeIssueCode(code) {
  const c = String(code).trim().replace(/FS$/, '');
  const m = c.match(/^(\d{6})UM$/);
  return m && m[1].startsWith('20') ? `2${m[1].slice(2)}UM` : c;
}

const DECIMAL_RE = /^(0|[1-9]\d*)(\.\d+)?$/; // dot as decimal separator, no thousands separator
const INTEGER_RE = /^(0|[1-9]\d*)$/;
const GOVT_CODE_RE = /^\d{5}UM$/;

// Returns a map of key -> error message; empty map means the record is valid.
// Expects the GOVT issue code already passed through normalizeIssueCode().
export function validate(record) {
  const errors = {};
  for (const key of ['instrument', 'ticker', 'market', 'type', 'volume']) {
    if (!String(record[key]).trim()) errors[key] = 'Required';
  }
  for (const { key, kind, max } of COLUMNS) {
    const v = String(record[key] ?? '').trim();
    if (v === '') continue;
    if (v.length > max) {
      errors[key] = `Max ${max} characters (has ${v.length})`;
    } else if (key === 'volume') {
      if (!INTEGER_RE.test(v)) errors[key] = 'Whole number, digits only';
      else if (Number(v) === 0) errors[key] = 'Must be greater than 0';
    } else if (kind === 'number') {
      if (!DECIMAL_RE.test(v)) errors[key] = 'Digits with a dot, e.g. 98.7575';
      // A zero price or rate means "no quote" — such records are not written (§6).
      else if (Number(v) === 0 && !key.endsWith('Yield')) errors[key] = 'Must be greater than 0';
    }
  }
  if (record.market === 'GOVT' && record.ticker && !errors.ticker && !GOVT_CODE_RE.test(record.ticker)) {
    errors.ticker = `"${record.ticker}": GOVT code must be 5 digits + UM, e.g. 24094UM`;
  }
  if (record.market && record.type) {
    const keys = valueKeysFor(record.market, record.type);
    if (!keys.length) {
      errors.type = `${record.market} ${record.type} is not allowed (allowed: ${typesFor(record.market).join(', ') || 'none'})`;
    }
    for (const k of keys) {
      if (!errors[k] && !String(record[k] ?? '').trim()) errors[k] = 'Required';
    }
    // Value fields of other combinations must stay empty (e.g. an FX rate in field 16).
    for (const k of VALUE_KEYS) {
      if (keys.length && !keys.includes(k) && !errors[k] && String(record[k] ?? '').trim()) {
        errors[k] = `Must be empty for ${record.market} ${record.type}`;
      }
    }
  }
  return errors;
}

export function nowTimestamp(offset = '+05:00') {
  const sign = offset.startsWith('-') ? -1 : 1;
  const [h, m] = offset.slice(1).split(':').map(Number);
  const local = new Date(Date.now() + sign * (h * 60 + m) * 60000);
  return local.toISOString().slice(0, 19) + offset;
}
