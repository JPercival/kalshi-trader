import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase } from '../db.js';
import { computeBaseRate, computeAllBaseRates, createBaseRateModel, createBaseRateModelWithDb } from '../models/base-rate.js';

describe('computeBaseRate', () => {
  let handle;

  beforeEach(() => {
    handle = createDatabase();
  });

  afterEach(() => {
    if (handle) handle.close();
  });

  it('computes base rate from resolved markets', () => {
    const { db } = handle;

    // Insert 10 resolved markets, 7 yes, 3 no
    for (let i = 0; i < 7; i++) {
      db.prepare("INSERT INTO markets (ticker, series_ticker, result) VALUES (?, ?, ?)").run(
        `MKT-Y-${i}`, 'SERIES-A', 'yes'
      );
    }
    for (let i = 0; i < 3; i++) {
      db.prepare("INSERT INTO markets (ticker, series_ticker, result) VALUES (?, ?, ?)").run(
        `MKT-N-${i}`, 'SERIES-A', 'no'
      );
    }

    const result = computeBaseRate(db, 'SERIES-A');
    expect(result).not.toBeNull();
    expect(result.yesRate).toBe(0.7);
    expect(result.totalResolved).toBe(10);
  });

  it('returns null when not enough samples', () => {
    const { db } = handle;

    for (let i = 0; i < 5; i++) {
      db.prepare("INSERT INTO markets (ticker, series_ticker, result) VALUES (?, ?, ?)").run(
        `MKT-${i}`, 'SERIES-B', 'yes'
      );
    }

    const result = computeBaseRate(db, 'SERIES-B');
    expect(result).toBeNull();
  });

  it('respects custom minSamples', () => {
    const { db } = handle;

    for (let i = 0; i < 5; i++) {
      db.prepare("INSERT INTO markets (ticker, series_ticker, result) VALUES (?, ?, ?)").run(
        `MKT-${i}`, 'SERIES-C', 'yes'
      );
    }

    const result = computeBaseRate(db, 'SERIES-C', { minSamples: 3 });
    expect(result).not.toBeNull();
    expect(result.yesRate).toBe(1.0);
  });

  it('ignores markets without result', () => {
    const { db } = handle;

    for (let i = 0; i < 10; i++) {
      db.prepare("INSERT INTO markets (ticker, series_ticker, result) VALUES (?, ?, ?)").run(
        `MKT-R-${i}`, 'SERIES-D', 'yes'
      );
    }
    // These should be ignored
    db.prepare("INSERT INTO markets (ticker, series_ticker, result) VALUES (?, ?, ?)").run(
      'MKT-OPEN-1', 'SERIES-D', null
    );
    db.prepare("INSERT INTO markets (ticker, series_ticker, result) VALUES (?, ?, ?)").run(
      'MKT-OPEN-2', 'SERIES-D', ''
    );

    const result = computeBaseRate(db, 'SERIES-D');
    expect(result.totalResolved).toBe(10);
  });

  it('returns null for nonexistent series', () => {
    const result = computeBaseRate(handle.db, 'NONEXIST');
    expect(result).toBeNull();
  });
});

describe('computeAllBaseRates', () => {
  let handle;

  beforeEach(() => {
    handle = createDatabase();
  });

  afterEach(() => {
    if (handle) handle.close();
  });

  it('returns base rates for all qualifying series', () => {
    const { db } = handle;

    // Series A: 10 resolved
    for (let i = 0; i < 10; i++) {
      db.prepare("INSERT INTO markets (ticker, series_ticker, result) VALUES (?, ?, ?)").run(
        `A-${i}`, 'SER-A', i < 6 ? 'yes' : 'no'
      );
    }

    // Series B: 15 resolved
    for (let i = 0; i < 15; i++) {
      db.prepare("INSERT INTO markets (ticker, series_ticker, result) VALUES (?, ?, ?)").run(
        `B-${i}`, 'SER-B', i < 3 ? 'yes' : 'no'
      );
    }

    // Series C: only 5 (below threshold)
    for (let i = 0; i < 5; i++) {
      db.prepare("INSERT INTO markets (ticker, series_ticker, result) VALUES (?, ?, ?)").run(
        `C-${i}`, 'SER-C', 'yes'
      );
    }

    const rates = computeAllBaseRates(db);
    expect(Object.keys(rates)).toHaveLength(2);
    expect(rates['SER-A'].yesRate).toBe(0.6);
    expect(rates['SER-B'].yesRate).toBe(0.2);
    expect(rates['SER-C']).toBeUndefined();
  });

  it('returns empty object when no qualifying series', () => {
    const rates = computeAllBaseRates(handle.db);
    expect(rates).toEqual({});
  });
});

describe('createBaseRateModel', () => {
  it('has correct name and empty categories', () => {
    const model = createBaseRateModel();
    expect(model.name).toBe('base_rate');
    expect(model.categories).toEqual([]);
  });

  it('returns null for markets without series_ticker', async () => {
    const model = createBaseRateModel();
    const result = await model.estimate({ ticker: 'MKT-1', title: 'Test' });
    expect(result).toBeNull();
  });

  it('returns null (placeholder) for markets with series_ticker', async () => {
    const model = createBaseRateModel();
    const result = await model.estimate({ ticker: 'MKT-1', series_ticker: 'SER-A', title: 'Test' });
    expect(result).toBeNull();
  });
});

describe('createBaseRateModelWithDb', () => {
  let handle;

  beforeEach(() => {
    handle = createDatabase();
  });

  afterEach(() => {
    if (handle) handle.close();
  });

  it('has correct name and empty categories', () => {
    const model = createBaseRateModelWithDb({ db: handle.db });
    expect(model.name).toBe('base_rate');
    expect(model.categories).toEqual([]);
  });

  it('returns null for markets without series_ticker', async () => {
    const model = createBaseRateModelWithDb({ db: handle.db });
    const result = await model.estimate({ ticker: 'MKT-1' });
    expect(result).toBeNull();
  });

  it('returns null when no base rate exists for series', async () => {
    const model = createBaseRateModelWithDb({ db: handle.db });
    const result = await model.estimate({ ticker: 'MKT-1', series_ticker: 'UNKNOWN' });
    expect(result).toBeNull();
  });

  it('returns estimate based on historical base rate', async () => {
    const { db } = handle;

    // Insert 20 resolved markets (15 yes, 5 no)
    for (let i = 0; i < 15; i++) {
      db.prepare("INSERT INTO markets (ticker, series_ticker, result) VALUES (?, ?, ?)").run(
        `H-Y-${i}`, 'WEATHER-NYC', 'yes'
      );
    }
    for (let i = 0; i < 5; i++) {
      db.prepare("INSERT INTO markets (ticker, series_ticker, result) VALUES (?, ?, ?)").run(
        `H-N-${i}`, 'WEATHER-NYC', 'no'
      );
    }

    // Active market to estimate
    db.prepare("INSERT INTO markets (ticker, series_ticker, status) VALUES (?, ?, ?)").run(
      'W-CURRENT', 'WEATHER-NYC', 'active'
    );

    const model = createBaseRateModelWithDb({ db });
    const result = await model.estimate({ ticker: 'W-CURRENT', series_ticker: 'WEATHER-NYC' });

    expect(result).not.toBeNull();
    expect(result.ticker).toBe('W-CURRENT');
    expect(result.estimatedProb).toBe(0.75);
    expect(result.dataSources).toContain('kalshi:WEATHER-NYC');
    expect(result.reasoning).toContain('75.0%');
    expect(result.reasoning).toContain('20');
  });

  it('caches base rates for TTL period', async () => {
    const { db } = handle;

    for (let i = 0; i < 10; i++) {
      db.prepare("INSERT INTO markets (ticker, series_ticker, result) VALUES (?, ?, ?)").run(
        `C-${i}`, 'SER-CACHE', 'yes'
      );
    }

    const model = createBaseRateModelWithDb({ db });

    // First call computes
    const r1 = await model.estimate({ ticker: 'X-1', series_ticker: 'SER-CACHE' });
    expect(r1.estimatedProb).toBe(1.0);

    // Add more data — should still use cached value within TTL
    for (let i = 0; i < 10; i++) {
      db.prepare("INSERT INTO markets (ticker, series_ticker, result) VALUES (?, ?, ?)").run(
        `C-NEW-${i}`, 'SER-CACHE', 'no'
      );
    }

    const r2 = await model.estimate({ ticker: 'X-2', series_ticker: 'SER-CACHE' });
    // Should still be 1.0 from cache
    expect(r2.estimatedProb).toBe(1.0);
  });

  it('scales confidence with sample size', async () => {
    const { db } = handle;

    // 10 samples → confidence = 0.3 + 10*0.005 = 0.35
    for (let i = 0; i < 10; i++) {
      db.prepare("INSERT INTO markets (ticker, series_ticker, result) VALUES (?, ?, ?)").run(
        `S-${i}`, 'SER-SMALL', 'yes'
      );
    }

    // 100 samples → confidence = min(0.85, 0.3 + 100*0.005) = 0.8
    for (let i = 0; i < 100; i++) {
      db.prepare("INSERT INTO markets (ticker, series_ticker, result) VALUES (?, ?, ?)").run(
        `L-${i}`, 'SER-LARGE', 'yes'
      );
    }

    const model = createBaseRateModelWithDb({ db, minSamples: 5 });

    const small = await model.estimate({ ticker: 'X-1', series_ticker: 'SER-SMALL' });
    const large = await model.estimate({ ticker: 'X-2', series_ticker: 'SER-LARGE' });

    expect(large.confidence).toBeGreaterThan(small.confidence);
    expect(large.confidence).toBeLessThanOrEqual(0.85);
  });
});
