import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { categorizeMarket, categorizeAllMarkets } from '../categorizer.js';
import { createDatabase } from '../db.js';

describe('categorizeMarket', () => {
  describe('ticker-based categorization', () => {
    it('categorizes weather markets by series_ticker', () => {
      expect(categorizeMarket({ series_ticker: 'KXWEATHER-26FEB03' })).toBe('weather');
      expect(categorizeMarket({ series_ticker: 'TEMP-NYC' })).toBe('weather');
      expect(categorizeMarket({ series_ticker: 'RAIN-LA' })).toBe('weather');
      expect(categorizeMarket({ series_ticker: 'SNOW-BOSTON' })).toBe('weather');
      expect(categorizeMarket({ series_ticker: 'HURRICANE-2026' })).toBe('weather');
    });

    it('categorizes economics markets', () => {
      expect(categorizeMarket({ event_ticker: 'CPI-JAN2026' })).toBe('economics');
      expect(categorizeMarket({ event_ticker: 'GDP-Q1' })).toBe('economics');
      expect(categorizeMarket({ series_ticker: 'UNEMPLOYMENT-RATE' })).toBe('economics');
      expect(categorizeMarket({ event_ticker: 'NONFARM-PAYROLL' })).toBe('economics');
    });

    it('categorizes fed_rates markets', () => {
      expect(categorizeMarket({ event_ticker: 'FED-MARCH' })).toBe('fed_rates');
      expect(categorizeMarket({ series_ticker: 'FOMC-DEC' })).toBe('fed_rates');
      expect(categorizeMarket({ event_ticker: 'RATE-CUT-2026' })).toBe('fed_rates');
    });

    it('categorizes politics markets', () => {
      expect(categorizeMarket({ event_ticker: 'ELECT-2026' })).toBe('politics');
      expect(categorizeMarket({ series_ticker: 'PRESIDENT-2028' })).toBe('politics');
      expect(categorizeMarket({ event_ticker: 'SENATE-GA' })).toBe('politics');
    });

    it('categorizes sports markets', () => {
      expect(categorizeMarket({ event_ticker: 'NFL-SUPERBOWL' })).toBe('sports');
      expect(categorizeMarket({ series_ticker: 'NBA-FINALS' })).toBe('sports');
      expect(categorizeMarket({ event_ticker: 'MLB-WS' })).toBe('sports');
      expect(categorizeMarket({ event_ticker: 'UFC-300' })).toBe('sports');
    });

    it('categorizes crypto markets', () => {
      expect(categorizeMarket({ event_ticker: 'BITCOIN-100K' })).toBe('crypto');
      expect(categorizeMarket({ series_ticker: 'ETH-PRICE' })).toBe('crypto');
    });

    it('categorizes finance markets', () => {
      expect(categorizeMarket({ event_ticker: 'SP500-CLOSE' })).toBe('finance');
      expect(categorizeMarket({ series_ticker: 'NASDAQ-LEVEL' })).toBe('finance');
      expect(categorizeMarket({ event_ticker: 'DOW-JONES' })).toBe('finance');
    });
  });

  describe('title-based categorization', () => {
    it('categorizes weather by title', () => {
      expect(categorizeMarket({ title: 'Will the temperature exceed 90°F in NYC?' })).toBe('weather');
      expect(categorizeMarket({ title: 'Will it rain in San Francisco this week?' })).toBe('weather');
      expect(categorizeMarket({ title: 'Will there be a heat wave in July?' })).toBe('weather');
      expect(categorizeMarket({ title: 'Hurricane season: will a tornado hit Texas?' })).toBe('weather');
    });

    it('categorizes economics by title', () => {
      expect(categorizeMarket({ title: 'Will CPI be above 3%?' })).toBe('economics');
      expect(categorizeMarket({ title: 'Will the unemployment rate fall below 4%?' })).toBe('economics');
      expect(categorizeMarket({ title: 'GDP growth in Q1' })).toBe('economics');
      expect(categorizeMarket({ title: 'Will inflation exceed 5% in 2026?' })).toBe('economics');
    });

    it('categorizes fed_rates by title', () => {
      expect(categorizeMarket({ title: 'Will the Federal Reserve cut rates?' })).toBe('fed_rates');
      expect(categorizeMarket({ title: 'FOMC interest rate decision in March' })).toBe('fed_rates');
      expect(categorizeMarket({ title: 'Will there be a rate hike?' })).toBe('fed_rates');
    });

    it('categorizes politics by title', () => {
      expect(categorizeMarket({ title: 'Will a Democrat win the election?' })).toBe('politics');
      expect(categorizeMarket({ title: 'Presidential polling shows tight race' })).toBe('politics');
      expect(categorizeMarket({ title: 'Will the Republican senator win?' })).toBe('politics');
    });

    it('categorizes sports by title', () => {
      expect(categorizeMarket({ title: 'NFL Super Bowl winner 2026' })).toBe('sports');
      expect(categorizeMarket({ title: 'NBA playoff game 7 outcome' })).toBe('sports');
      expect(categorizeMarket({ title: 'MLB World Series champion' })).toBe('sports');
    });

    it('categorizes crypto by title', () => {
      expect(categorizeMarket({ title: 'Will Bitcoin hit $200k?' })).toBe('crypto');
      expect(categorizeMarket({ title: 'Ethereum price above $10k' })).toBe('crypto');
    });

    it('categorizes finance by title', () => {
      expect(categorizeMarket({ title: 'Will the S&P 500 close above 6000?' })).toBe('finance');
      expect(categorizeMarket({ title: 'Nasdaq composite performance' })).toBe('finance');
    });
  });

  describe('fallback behavior', () => {
    it('returns "other" for unrecognized markets', () => {
      expect(categorizeMarket({ title: 'Will aliens visit Earth?' })).toBe('other');
      expect(categorizeMarket({})).toBe('other');
    });

    it('prefers ticker match over title match', () => {
      // Ticker says weather, title says economics
      expect(categorizeMarket({
        series_ticker: 'WEATHER-NYC',
        title: 'Will CPI come in above 3%?',
      })).toBe('weather');
    });

    it('handles null/undefined fields gracefully', () => {
      expect(categorizeMarket({ series_ticker: null, event_ticker: undefined, title: null })).toBe('other');
    });
  });
});

describe('categorizeAllMarkets', () => {
  let handle;

  beforeEach(() => {
    handle = createDatabase();
  });

  afterEach(() => {
    if (handle) handle.close();
  });

  it('updates uncategorized markets in the database', () => {
    const { db } = handle;

    db.prepare("INSERT INTO markets (ticker, series_ticker, title, category) VALUES (?, ?, ?, ?)").run(
      'MKT-W1', 'KXWEATHER', 'Will it rain?', null
    );
    db.prepare("INSERT INTO markets (ticker, event_ticker, title, category) VALUES (?, ?, ?, ?)").run(
      'MKT-E1', 'CPI-JAN', 'CPI above 3%?', ''
    );

    const result = categorizeAllMarkets(db);

    expect(result.updated).toBe(2);

    const w = db.prepare('SELECT category FROM markets WHERE ticker = ?').get('MKT-W1');
    expect(w.category).toBe('weather');

    const e = db.prepare('SELECT category FROM markets WHERE ticker = ?').get('MKT-E1');
    expect(e.category).toBe('economics');
  });

  it('does not update already-categorized markets', () => {
    const { db } = handle;

    db.prepare("INSERT INTO markets (ticker, title, category) VALUES (?, ?, ?)").run(
      'MKT-SKIP', 'Some market', 'politics'
    );

    const result = categorizeAllMarkets(db);
    expect(result.updated).toBe(0);
  });

  it('returns zero when no markets exist', () => {
    const { db } = handle;
    const result = categorizeAllMarkets(db);
    expect(result.updated).toBe(0);
  });
});
