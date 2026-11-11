import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  COLUMNS, MARKETS, emptyRecord, fromCsvLine, fromJson, normalizeIssueCode, nowTimestamp,
  toCsvLine, toJsonText, typesFor, validate, valueKeysFor,
} from './schema.js';

// Real production lines, one per allowed market/type combination.
const PROD_ROWS = {
  govtBid: 'UZA000005449,28040UM,GOVT,Bid,,107.5089,,11.9644,,,,,,,,,1000,2026-11-09T10:07:34+05:00',
  govtOffer: 'UZA000005449,28040UM,GOVT,Offer,107.7887,,11.8224,,,,,,,,,,1000,2026-11-09T10:07:34+05:00',
  govtTrade: 'UZA000005449,28040UM,GOVT,Trade,,,,,,,107.4356,11.9150,,,,,50000,2026-11-04T10:57:15+05:00',
  mmktTrade: '1D,1D,MMKT,Trade,,,,,,,,,,,13.76,,500000000000,2026-11-09T11:15:00+05:00',
  fxFixing: 'USD/UZS_TOM,6472,FX,Fixing,,,,,,,,,,,11903.15,,248000000,2026-10-22T17:32:49+05:00',
};

// A valid GOVT Bid record; each test changes only the fields it is about.
const govtBid = (changes = {}) => ({
  ...fromCsvLine(PROD_ROWS.govtBid),
  ...changes,
});

describe('COLUMNS', () => {
  it('has the 18 production fields in field_01..field_18 order', () => {
    expect(COLUMNS.map((c) => c.name)).toEqual([
      'instrument_id', 'instrument_code', 'market_type', 'record_type',
      'offer_price', 'bid_price', 'offer_yield', 'bid_yield', 'offer_rate', 'bid_rate',
      'trade_price', 'trade_yield', 'field_13', 'field_14', 'rate', 'field_16',
      'volume', 'timestamp',
    ]);
  });

  it('has the maximum lengths', () => {
    const max = Object.fromEntries(COLUMNS.map((c) => [c.name, c.max]));
    expect(max).toMatchObject({
      instrument_id: 12, instrument_code: 7, market_type: 4, record_type: 6,
      offer_price: 8, bid_yield: 8, trade_price: 8, trade_yield: 8, rate: 10, volume: 12, timestamp: 25,
    });
  });
});

describe('allowed combinations', () => {
  it('markets are GOVT, MMKT and FX', () => {
    expect(MARKETS).toEqual(['GOVT', 'MMKT', 'FX']);
  });

  it('each market offers only its confirmed types', () => {
    expect(typesFor('GOVT')).toEqual(['Bid', 'Offer', 'Trade']);
    expect(typesFor('MMKT')).toEqual(['Trade']);
    expect(typesFor('FX')).toEqual(['Fixing']);
    expect(typesFor('XYZ')).toEqual([]);
  });

  it('GOVT uses a price and a yield', () => {
    expect(valueKeysFor('GOVT', 'Bid')).toEqual(['bidPrice', 'bidYield']);
    expect(valueKeysFor('GOVT', 'Offer')).toEqual(['offerPrice', 'offerYield']);
    expect(valueKeysFor('GOVT', 'Trade')).toEqual(['tradePrice', 'tradeYield']);
  });

  it('MMKT Trade and FX Fixing share the rate in field 15', () => {
    expect(valueKeysFor('MMKT', 'Trade')).toEqual(['rate']);
    expect(valueKeysFor('FX', 'Fixing')).toEqual(['rate']);
  });

  it.each([['GOVT', 'Fixing'], ['MMKT', 'Bid'], ['MMKT', 'Offer'], ['MMKT', 'Fixing'], ['FX', 'Trade']])(
    '%s %s is not allowed',
    (market, type) => {
      expect(valueKeysFor(market, type)).toEqual([]);
      expect(validate(govtBid({ market, type })).type).toMatch(/is not allowed/);
    }
  );
});

describe('CSV', () => {
  it.each(Object.entries(PROD_ROWS))('%s: reads and writes the production row unchanged', (_, line) => {
    expect(toCsvLine(fromCsvLine(line))).toBe(line);
  });

  it('always writes 18 fields (17 commas), even when everything is empty', () => {
    expect(toCsvLine(emptyRecord())).toBe(','.repeat(17));
  });

  it('puts the FX fixing rate in field 15 and leaves field 16 empty', () => {
    const cells = toCsvLine(fromCsvLine(PROD_ROWS.fxFixing)).split(',');
    expect(cells[14]).toBe('11903.15');
    expect(cells[15]).toBe('');
  });

  it('puts the GOVT trade price and yield in fields 11 and 12', () => {
    const cells = toCsvLine(fromCsvLine(PROD_ROWS.govtTrade)).split(',');
    expect(cells.slice(10, 16)).toEqual(['107.4356', '11.9150', '', '', '', '']);
  });

  it('keeps numbers exactly as entered (trailing zeros too)', () => {
    expect(toCsvLine(fromCsvLine(PROD_ROWS.govtTrade))).toContain(',11.9150,');
  });
});

describe('JSON', () => {
  it('writes valid JSON keyed by the field names', () => {
    const [obj] = JSON.parse(toJsonText([fromCsvLine(PROD_ROWS.fxFixing)]));
    expect(Object.keys(obj)).toEqual(COLUMNS.map((c) => c.name));
    expect(obj).toMatchObject({
      instrument_id: 'USD/UZS_TOM',
      instrument_code: '6472',
      market_type: 'FX',
      record_type: 'Fixing',
      rate: 11903.15,
      field_16: null,
      volume: 248000000,
      timestamp: '2026-10-22T17:32:49+05:00',
    });
  });

  it('writes GOVT trades with trade_price and trade_yield', () => {
    const [obj] = JSON.parse(toJsonText([fromCsvLine(PROD_ROWS.govtTrade)]));
    expect(obj).toMatchObject({ trade_price: 107.4356, trade_yield: 11.915, field_13: null });
  });

  it('writes empty fields as null', () => {
    const [obj] = JSON.parse(toJsonText([fromCsvLine(PROD_ROWS.govtBid)]));
    expect(obj.offer_price).toBeNull();
    expect(obj.rate).toBeNull();
  });

  it('keeps the precision of numbers ("11.9150" is not shortened to 11.915)', () => {
    expect(toJsonText([fromCsvLine(PROD_ROWS.govtTrade)])).toContain('"trade_yield": 11.9150');
  });

  it('drops leading zeros, which JSON does not allow', () => {
    const text = toJsonText([govtBid({ bidYield: '02.20' })]);
    expect(text).toContain('"bid_yield": 2.20');
    expect(() => JSON.parse(text)).not.toThrow();
  });

  it('writes an array even for a single record, so Import JSON can read it back', () => {
    expect(Array.isArray(JSON.parse(toJsonText([govtBid()])))).toBe(true);
  });

  // JSON.parse turns 11.9150 into the number 11.915 (JavaScript drops trailing
  // zeros), so reading JSON back keeps the values but not their exact text.
  // The JSON file itself keeps the text — see the precision test above.
  it.each(Object.entries(PROD_ROWS))('%s: CSV -> JSON -> CSV gives the same values', (_, line) => {
    const [obj] = JSON.parse(toJsonText([fromCsvLine(line)]));
    const back = toCsvLine(fromJson(obj)).split(',');
    line.split(',').forEach((cell, i) => {
      if (/^[\d.]+$/.test(cell)) expect(Number(back[i])).toBe(Number(cell));
      else expect(back[i]).toBe(cell);
    });
  });

  it('imports JSON that uses the internal keys', () => {
    expect(fromJson({ instrument: 'UZA000002255', bidPrice: 94.9 })).toMatchObject({
      instrument: 'UZA000002255',
      bidPrice: '94.9',
      offerPrice: '',
    });
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
  it.each(Object.entries(PROD_ROWS))('%s: production row is valid', (_, line) => {
    expect(validate(fromCsvLine(line))).toEqual({});
  });

  it('requires the identifying fields and volume', () => {
    const errors = validate(emptyRecord());
    for (const key of ['instrument', 'ticker', 'market', 'type', 'volume']) {
      expect(errors[key]).toBe('Required');
    }
  });

  describe('value fields', () => {
    it('GOVT needs both price and yield', () => {
      expect(validate(govtBid({ bidYield: '' })).bidYield).toBe('Required');
      expect(validate(govtBid({ bidPrice: '' })).bidPrice).toBe('Required');
    });

    it('GOVT Trade needs trade price and trade yield', () => {
      const trade = fromCsvLine(PROD_ROWS.govtTrade);
      expect(validate({ ...trade, tradeYield: '' }).tradeYield).toBe('Required');
    });

    it('MMKT Trade and FX Fixing need the rate', () => {
      expect(validate({ ...fromCsvLine(PROD_ROWS.mmktTrade), rate: '' }).rate).toBe('Required');
      expect(validate({ ...fromCsvLine(PROD_ROWS.fxFixing), rate: '' }).rate).toBe('Required');
    });

    it('rejects values in fields that belong to another combination', () => {
      // An FX fixing rate in field 16, as the original requirements described it.
      const oldFx = fromCsvLine('USD/UZS_TOM,6472,FX,Fixing,,,,,,,,,,,,1190,248000000,2026-10-22T17:32:49+05:00');
      expect(validate(oldFx).field16).toBe('Must be empty for FX Fixing');
      expect(validate(oldFx).rate).toBe('Required');
    });
  });

  describe('field lengths', () => {
    it('rejects a value longer than the maximum instead of cutting it', () => {
      expect(validate(govtBid({ instrument: 'UZA0000022551' })).instrument).toBe('Max 12 characters (has 13)');
      expect(validate(govtBid({ bidPrice: '94.906512' })).bidPrice).toBe('Max 8 characters (has 9)');
    });

    it('accepts a value of exactly the maximum length', () => {
      expect(validate(govtBid({ bidPrice: '94.90651' }))).toEqual({});
      expect(validate(govtBid({ volume: '999999999999' }))).toEqual({});
    });

    it('allows a rate of up to 10 characters (FX fixing)', () => {
      const fx = fromCsvLine(PROD_ROWS.fxFixing);
      expect(validate({ ...fx, rate: '11903.1525' })).toEqual({});
      expect(validate({ ...fx, rate: '11903.15251' }).rate).toBe('Max 10 characters (has 11)');
    });
  });

  describe('number format', () => {
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

  describe('zero values', () => {
    it('rejects zero volume', () => {
      expect(validate(govtBid({ volume: '0' })).volume).toBe('Must be greater than 0');
    });

    it('rejects a zero price or rate', () => {
      expect(validate(govtBid({ bidPrice: '0' })).bidPrice).toBe('Must be greater than 0');
      expect(validate(govtBid({ bidPrice: '0.0' })).bidPrice).toBe('Must be greater than 0');
      const mmkt = fromCsvLine(PROD_ROWS.mmktTrade);
      expect(validate({ ...mmkt, rate: '0' }).rate).toBe('Must be greater than 0');
    });

    it('allows a zero yield', () => {
      expect(validate(govtBid({ bidYield: '0' }))).toEqual({});
    });
  });

  describe('instrument_code (GOVT only)', () => {
    it('rejects a GOVT code that is not 5 digits + UM', () => {
      expect(validate(govtBid({ ticker: '2409UM' })).ticker).toMatch(/must be 5 digits \+ UM/);
      expect(validate(govtBid({ ticker: '201003U' })).ticker).toMatch(/must be 5 digits \+ UM/);
    });

    it('accepts a GOVT code after normalizing it', () => {
      expect(validate(govtBid({ ticker: normalizeIssueCode('201006UMFS') }))).toEqual({});
    });

    it('does not apply the rule to MMKT and FX codes', () => {
      expect(validate(fromCsvLine(PROD_ROWS.mmktTrade))).toEqual({}); // code "1D"
      expect(validate(fromCsvLine(PROD_ROWS.fxFixing))).toEqual({}); // code "6472"
    });

    it('reports the length error first for a long code', () => {
      expect(validate(govtBid({ ticker: '201006UMFS' })).ticker).toBe('Max 7 characters (has 10)');
    });
  });
});

describe('nowTimestamp', () => {
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
