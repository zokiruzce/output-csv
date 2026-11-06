// Column layout of output.csv (no header row, 18 columns, field_01..field_18).
// `key`   — internal name used by the app and the records saved in the browser.
// `name`  — official field name from the output.csv requirements; used as the JSON key.
// `label` — text shown on screen.
// `max`   — maximum length in characters (requirements §2); longer values are an error, never cut.
export const COLUMNS = [
  { key: 'instrument', name: 'instrument_id', label: 'ISIN', kind: 'text', max: 12 },        // field_01: UZA000002255, 1D, USD/UZS_TOM
  { key: 'ticker', name: 'instrument_code', label: 'Issue Code', kind: 'text', max: 7 },    // field_02: 24094UM, 1D, 3766
  { key: 'market', name: 'market_type', label: 'Market', kind: 'text', max: 4 },            // field_03: GOVT | MMKT | FX
  { key: 'type', name: 'record_type', label: 'Type', kind: 'text', max: 6 },                // field_04: Bid | Offer | Trade | Fixing
  { key: 'offerPrice', name: 'offer_price', label: 'Offer price', kind: 'number', max: 8 },     // field_05
  { key: 'bidPrice', name: 'bid_price', label: 'Bid price', kind: 'number', max: 8 },           // field_06
  { key: 'offerYield', name: 'offer_yield', label: 'Offer yield', kind: 'number', max: 8 },     // field_07
  { key: 'bidYield', name: 'bid_yield', label: 'Bid yield', kind: 'number', max: 8 },           // field_08
  { key: 'offerRate', name: 'offer_rate', label: 'Offer rate', kind: 'number', max: 4 },        // field_09
  { key: 'bidRate', name: 'bid_rate', label: 'Bid rate', kind: 'number', max: 4 },              // field_10
  { key: 'tradePrice', name: 'trade_price', label: 'Trade price', kind: 'number', max: 8 },     // field_11
  { key: 'fixingPrice', name: 'fixing_price', label: 'Fixing price', kind: 'number', max: 8 },  // field_12
  { key: 'tradeYield', name: 'trade_yield', label: 'Trade yield', kind: 'number', max: 8 },     // field_13
  { key: 'fixingYield', name: 'fixing_yield', label: 'Fixing yield', kind: 'number', max: 8 },  // field_14
  { key: 'tradeRate', name: 'trade_rate', label: 'Trade rate', kind: 'number', max: 4 },        // field_15
  { key: 'fixingRate', name: 'fixing_rate', label: 'Fixing rate', kind: 'number', max: 8 },     // field_16 — table says 4, but the spec's own FX example is 12874.02 (8); see PLAN.md
  { key: 'volume', name: 'volume', label: 'Volume', kind: 'number', max: 12 },                   // field_17
  { key: 'timestamp', name: 'timestamp', label: 'Timestamp', kind: 'text', max: 25 },            // field_18: 2025-01-07T09:49:49+05:00
];

export const MARKETS = ['GOVT', 'MMKT', 'FX'];
export const TYPES = ['Bid', 'Offer', 'Trade', 'Fixing'];

// Which value columns apply to a market/type pair. Bonds (GOVT) carry a
// price and a yield; money market and FX carry a single rate.
export function valueKeysFor(market, type) {
  const prefix = type.toLowerCase();
  return market === 'GOVT' ? [`${prefix}Price`, `${prefix}Yield`] : [`${prefix}Rate`];
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
    if (keys.every((k) => !String(record[k]).trim())) errors[keys[0]] = 'Enter at least one value';
  }
  return errors;
}

export function nowTimestamp(offset = '+05:00') {
  const sign = offset.startsWith('-') ? -1 : 1;
  const [h, m] = offset.slice(1).split(':').map(Number);
  const local = new Date(Date.now() + sign * (h * 60 + m) * 60000);
  return local.toISOString().slice(0, 19) + offset;
}
