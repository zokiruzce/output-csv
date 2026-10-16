// Column layout of the source CSV (no header row, 18 columns).
// The JSON keys below are inferred from the data — rename them here if the
// receiving system expects different names; the order stays the CSV order.
export const COLUMNS = [
  { key: 'instrument', label: 'ISIN', kind: 'text' },   // UZA000002255, 1D, USD/UZS_TOM
  { key: 'ticker', label: 'Issue Code', kind: 'text' },                 // 24094UM, 1D, 3766
  { key: 'market', label: 'Market', kind: 'text' },                 // GOVT | MMKT | FX
  { key: 'type', label: 'Type', kind: 'text' },                     // Bid | Offer | Trade | Fixing
  { key: 'offerPrice', label: 'Offer price', kind: 'number' },
  { key: 'bidPrice', label: 'Bid price', kind: 'number' },
  { key: 'offerYield', label: 'Offer yield', kind: 'number' },
  { key: 'bidYield', label: 'Bid yield', kind: 'number' },
  { key: 'offerRate', label: 'Offer rate', kind: 'number' },
  { key: 'bidRate', label: 'Bid rate', kind: 'number' },
  { key: 'tradePrice', label: 'Trade price', kind: 'number' },
  { key: 'tradeYield', label: 'Trade yield', kind: 'number' },
  { key: 'fixingPrice', label: 'Fixing price', kind: 'number' },
  { key: 'fixingYield', label: 'Fixing yield', kind: 'number' },
  { key: 'tradeRate', label: 'Trade rate', kind: 'number' },
  { key: 'fixingRate', label: 'Fixing rate', kind: 'number' },
  { key: 'volume', label: 'Volume', kind: 'number' },
  { key: 'timestamp', label: 'Timestamp', kind: 'text' },           // 2025-01-07T09:49:49+05:00
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

// Form record (all strings) -> JSON object (numbers as numbers, blanks as null).
export function toJson(record) {
  return Object.fromEntries(
    COLUMNS.map(({ key, kind }) => {
      const v = String(record[key] ?? '').trim();
      if (v === '') return [key, null];
      return [key, kind === 'number' ? Number(v) : v];
    })
  );
}

// JSON object or CSV cells -> form record (all strings).
export function fromJson(obj) {
  return Object.fromEntries(COLUMNS.map(({ key }) => [key, obj[key] == null ? '' : String(obj[key])]));
}

export function fromCsvLine(line) {
  const cells = line.split(',');
  return Object.fromEntries(COLUMNS.map(({ key }, i) => [key, (cells[i] ?? '').trim()]));
}

// Form record -> one line in the source CSV format (18 columns, no header).
export function toCsvLine(record) {
  return COLUMNS.map(({ key }) => String(record[key] ?? '').trim()).join(',');
}

// Returns a map of key -> error message; empty map means the record is valid.
// The timestamp is set by the app, so it is not checked here.
export function validate(record) {
  const errors = {};
  for (const key of ['instrument', 'ticker', 'market', 'type', 'volume']) {
    if (!String(record[key]).trim()) errors[key] = 'Required';
  }
  for (const { key, kind } of COLUMNS) {
    const v = String(record[key]).trim();
    if (kind === 'number' && v !== '' && !Number.isFinite(Number(v))) errors[key] = 'Must be a number';
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
