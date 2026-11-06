import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  COLUMNS, emptyRecord, fromCsvLine, fromJson, normalizeIssueCode, nowTimestamp,
  toCsvLine, toJsonText, validate, valueKeysFor,
} from './schema.js';

// Correctly formed rows from section 8 of the output.csv requirements.
const SPEC_ROWS = {
  govtBid: 'UZA000002255,24094UM,GOVT,Bid,,94.9065,,15.3039,,,,,,,,,1000,2024-12-10T10:12:06+05:00',
  govtOffer: 'UZA000002255,24094UM,GOVT,Offer,95.1526,,14.5268,,,,,,,,,,1000,2024-12-10T10:12:06+05:00',
  mmktBid: '1D,1D,MMKT,Bid,,,,,,13.5,,,,,,,50000000000,2024-12-10T16:27:31+05:00',
  mmktTrade: '1D,1D,MMKT,Trade,,,,,,,,,,,13.5,,185000000000,2024-12-10T16:17:33+05:00',
  fxFixing: 'USD/UZS_TOM,3688,FX,Fixing,,,,,,,,,,,,12874.02,217400000,2024-12-10T16:54:21+05:00',
};

// A valid GOVT Bid record; each test changes only the fields it is about.
const govtBid = (changes = {}) => ({
  ...emptyRecord(),
  instrument: 'UZA000002255',
  ticker: '24094UM',
  market: 'GOVT',
  type: 'Bid',
  bidPrice: '94.9065',
  bidYield: '15.3039',
  volume: '1000',
  timestamp: '2024-12-10T10:12:06+05:00',
  ...changes,
});

describe('COLUMNS', () => {
  it('has the 18 fields in field_01..field_18 order', () => {
    expect(COLUMNS.map((c) => c.name)).toEqual([
      'instrument_id', 'instrument_code', 'market_type', 'record_type',
      'offer_price', 'bid_price', 'offer_yield', 'bid_yield', 'offer_rate', 'bid_rate',
      'trade_price', 'fixing_price', 'trade_yield', 'fixing_yield', 'trade_rate', 'fixing_rate',
      'volume', 'timestamp',
    ]);
  });

  it('has the maximum lengths from the requirements', () => {
    const max = Object.fromEntries(COLUMNS.map((c) => [c.name, c.max]));
    expect(max).toMatchObject({
      instrument_id: 12, instrument_code: 7, market_type: 4, record_type: 6,
      offer_price: 8, bid_yield: 8, bid_rate: 4, trade_rate: 4, volume: 12, timestamp: 25,
    });
  });
});

describe('CSV', () => {
  it.each(Object.entries(SPEC_ROWS))('%s: reads and writes the spec row unchanged', (_, line) => {
    expect(toCsvLine(fromCsvLine(line))).toBe(line);
  });

  it('always writes 18 fields (17 commas), even when everything is empty', () => {
    expect(toCsvLine(emptyRecord())).toBe(','.repeat(17));
  });

  it('keeps numbers exactly as entered', () => {
    expect(toCsvLine(govtBid({ bidPrice: '12.300' }))).toContain(',12.300,');
  });
});

describe('JSON', () => {
  it('writes valid JSON keyed by the official field names', () => {
    const [obj] = JSON.parse(toJsonText([fromCsvLine(SPEC_ROWS.fxFixing)]));
    expect(Object.keys(obj)).toEqual(COLUMNS.map((c) => c.name));
    expect(obj).toMatchObject({
      instrument_id: 'USD/UZS_TOM',
      instrument_code: '3688',
      market_type: 'FX',
      record_type: 'Fixing',
      fixing_rate: 12874.02,
      volume: 217400000,
      timestamp: '2024-12-10T16:54:21+05:00',
    });
  });

  it('writes empty fields as null', () => {
    const [obj] = JSON.parse(toJsonText([fromCsvLine(SPEC_ROWS.govtBid)]));
    expect(obj.offer_price).toBeNull();
    expect(obj.trade_rate).toBeNull();
  });

  it('keeps the precision of numbers ("12.300" is not shortened to 12.3)', () => {
    expect(toJsonText([govtBid({ bidPrice: '12.300' })])).toContain('"bid_price": 12.300');
  });

  it('drops leading zeros, which JSON does not allow', () => {
    const text = toJsonText([govtBid({ bidYield: '02.20' })]);
    expect(text).toContain('"bid_yield": 2.20');
    expect(() => JSON.parse(text)).not.toThrow();
  });

  it('writes an array even for a single record, so Import JSON can read it back', () => {
    expect(Array.isArray(JSON.parse(toJsonText([govtBid()])))).toBe(true);
  });

  it.each(Object.entries(SPEC_ROWS))('%s: CSV -> JSON -> CSV gives the same row', (_, line) => {
    const [obj] = JSON.parse(toJsonText([fromCsvLine(line)]));
    expect(toCsvLine(fromJson(obj))).toBe(line);
  });

  it('imports JSON that uses the older internal keys', () => {
    expect(fromJson({ instrument: 'UZA000002255', bidPrice: 94.9 })).toMatchObject({
      instrument: 'UZA000002255',
      bidPrice: '94.9',
      offerPrice: '',
    });
  });
});

describe('valueKeysFor', () => {
  it('GOVT uses a price and a yield', () => {
    expect(valueKeysFor('GOVT', 'Bid')).toEqual(['bidPrice', 'bidYield']);
    expect(valueKeysFor('GOVT', 'Offer')).toEqual(['offerPrice', 'offerYield']);
  });

  it('MMKT and FX use a single rate', () => {
    expect(valueKeysFor('MMKT', 'Trade')).toEqual(['tradeRate']);
    expect(valueKeysFor('FX', 'Fixing')).toEqual(['fixingRate']);
  });
});

describe('normalizeIssueCode (GOVT)', () => {
  it.each([
    ['28031UMFS', '28031UM'],   // rule 1: drop trailing FS
    ['201006UMFS', '21006UM'],  // rule 2: 6 digits starting with 20 lose the 0
    ['201006UM', '21006UM'],
    ['24094UM', '24094UM'],     // already correct: unchanged
    [' 24094UM ', '24094UM'],   // surrounding spaces removed
    ['301006UMFS', '301006UM'], // 6 digits not starting with 20: left for validate to reject
  ])('%s -> %s', (input, expected) => {
    expect(normalizeIssueCode(input)).toBe(expected);
  });
});

describe('validate', () => {
  it.each(Object.entries(SPEC_ROWS))('%s: spec row is valid', (_, line) => {
    expect(validate(fromCsvLine(line))).toEqual({});
  });

  it('requires the identifying fields and volume', () => {
    const errors = validate(emptyRecord());
    for (const key of ['instrument', 'ticker', 'market', 'type', 'volume']) {
      expect(errors[key]).toBe('Required');
    }
  });

  it('requires at least one value for the market/type', () => {
    expect(validate(govtBid({ bidPrice: '', bidYield: '' }))).toHaveProperty('bidPrice');
  });

  describe('field lengths (§2)', () => {
    it('rejects a value longer than the maximum instead of cutting it', () => {
      expect(validate(govtBid({ instrument: 'UZA0000022551' })).instrument).toBe('Max 12 characters (has 13)');
      expect(validate(govtBid({ bidPrice: '94.906512' })).bidPrice).toBe('Max 8 characters (has 9)');
    });

    it('accepts a value of exactly the maximum length', () => {
      expect(validate(govtBid({ bidPrice: '94.90651' }))).toEqual({});
      expect(validate(govtBid({ volume: '999999999999' }))).toEqual({});
    });

    it('accepts an 8-character fixing_rate (spec example 12874.02)', () => {
      expect(validate(fromCsvLine(SPEC_ROWS.fxFixing))).toEqual({});
    });
  });

  describe('number format (§4)', () => {
    it.each(['1e3', '94,9', '02.20', '-5', '.5', '5.', '1 000', 'abc'])('rejects price "%s"', (price) => {
      expect(validate(govtBid({ bidPrice: price })).bidPrice).toBe('Digits with a dot, e.g. 98.7575');
    });

    it.each(['94', '94.9065', '0.5'])('accepts price "%s"', (price) => {
      expect(validate(govtBid({ bidPrice: price }))).toEqual({});
    });

    it('volume must be a whole number', () => {
      expect(validate(govtBid({ volume: '1000.5' })).volume).toBe('Whole number, digits only');
      expect(validate(govtBid({ volume: '1e3' })).volume).toBe('Whole number, digits only');
    });
  });

  describe('zero values (§6)', () => {
    it('rejects zero volume', () => {
      expect(validate(govtBid({ volume: '0' })).volume).toBe('Must be greater than 0');
    });

    it('rejects a zero price or rate', () => {
      expect(validate(govtBid({ bidPrice: '0' })).bidPrice).toBe('Must be greater than 0');
      expect(validate(govtBid({ bidPrice: '0.0' })).bidPrice).toBe('Must be greater than 0');
      const mmkt = fromCsvLine(SPEC_ROWS.mmktBid);
      expect(validate({ ...mmkt, bidRate: '0' }).bidRate).toBe('Must be greater than 0');
    });

    it('allows a zero yield', () => {
      expect(validate(govtBid({ bidYield: '0' }))).toEqual({});
    });
  });

  describe('instrument_code (§2, GOVT only)', () => {
    it('rejects a GOVT code that is not 5 digits + UM', () => {
      expect(validate(govtBid({ ticker: '2409UM' })).ticker).toMatch(/must be 5 digits \+ UM/);
      expect(validate(govtBid({ ticker: '201003U' })).ticker).toMatch(/must be 5 digits \+ UM/);
    });

    it('accepts a GOVT code after normalizing it', () => {
      expect(validate(govtBid({ ticker: normalizeIssueCode('201006UMFS') }))).toEqual({});
    });

    it('does not apply the rule to MMKT and FX codes', () => {
      expect(validate(fromCsvLine(SPEC_ROWS.mmktBid))).toEqual({}); // code "1D"
      expect(validate(fromCsvLine(SPEC_ROWS.fxFixing))).toEqual({}); // code "3688"
    });

    it('reports the length error first for a long code', () => {
      expect(validate(govtBid({ ticker: '201006UMFS' })).ticker).toBe('Max 7 characters (has 10)');
    });
  });
});

describe('nowTimestamp (§5)', () => {
  afterEach(() => vi.useRealTimers());

  it('gives ISO 8601 to the second with the +05:00 offset', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-12-10T11:54:21.789Z')); // 16:54:21 in Tashkent
    expect(nowTimestamp()).toBe('2024-12-10T16:54:21+05:00');
  });

  it('fits the 25-character timestamp field', () => {
    expect(nowTimestamp()).toHaveLength(25);
  });
});
