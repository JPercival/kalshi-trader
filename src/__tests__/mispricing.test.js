import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase } from '../db.js';
import { detectMispricings, getTopSignals } from '../mispricing.js';

describe('detectMispricings', () => {
  let handle;

  beforeEach(() => {
    handle = createDatabase();
  });

  afterEach(() => {
    if (handle) handle.close();
  });

  function seedMarket(db, ticker, price, category = 'weather') {
    db.prepare("INSERT INTO markets (ticker, title, category, status, last_yes_price) VALUES (?, ?, ?, ?, ?)").run(
      ticker, `Market ${ticker}`, category, 'active', price
    );
  }

  function seedEstimate(db, ticker, modelName, prob, confidence, timestamp = Date.now()) {
    db.prepare(
      "INSERT INTO model_estimates (ticker, timestamp, model_name, estimated_prob, confidence) VALUES (?, ?, ?, ?, ?)"
    ).run(ticker, timestamp, modelName, prob, confidence);
  }

  it('detects a yes-side mispricing', () => {
    const { db } = handle;

    seedMarket(db, 'MKT-1', 0.40);
    seedEstimate(db, 'MKT-1', 'weather', 0.70, 0.85);

    const signals = detectMispricings(db, { minEdgePct: 5, minConfidence: 0.6, minLiquidity: 0 });

    expect(signals).toHaveLength(1);
    expect(signals[0].ticker).toBe('MKT-1');
    expect(signals[0].side).toBe('yes');
    expect(signals[0].edge).toBe(0.3);
    expect(signals[0].modelProb).toBe(0.7);
    expect(signals[0].marketPrice).toBe(0.4);
  });

  it('detects a no-side mispricing', () => {
    const { db } = handle;

    seedMarket(db, 'MKT-2', 0.80);
    seedEstimate(db, 'MKT-2', 'economics', 0.50, 0.75);

    const signals = detectMispricings(db, { minEdgePct: 5, minConfidence: 0.6, minLiquidity: 0 });

    expect(signals).toHaveLength(1);
    expect(signals[0].side).toBe('no');
    expect(signals[0].edge).toBe(-0.3);
    expect(signals[0].absEdge).toBe(0.3);
  });

  it('filters by minimum edge percentage', () => {
    const { db } = handle;

    seedMarket(db, 'MKT-3', 0.50);
    seedEstimate(db, 'MKT-3', 'weather', 0.53, 0.9); // 3% edge — below 5% threshold

    const signals = detectMispricings(db, { minEdgePct: 5, minConfidence: 0.6, minLiquidity: 0 });
    expect(signals).toHaveLength(0);
  });

  it('filters by minimum confidence', () => {
    const { db } = handle;

    seedMarket(db, 'MKT-4', 0.40);
    seedEstimate(db, 'MKT-4', 'weather', 0.70, 0.4); // Low confidence

    const signals = detectMispricings(db, { minEdgePct: 5, minConfidence: 0.6, minLiquidity: 0 });
    expect(signals).toHaveLength(0);
  });

  it('uses latest estimate per model', () => {
    const { db } = handle;

    seedMarket(db, 'MKT-5', 0.40);
    seedEstimate(db, 'MKT-5', 'weather', 0.70, 0.85, 1000); // Old
    seedEstimate(db, 'MKT-5', 'weather', 0.50, 0.85, 2000); // New — only 10% edge

    const signals = detectMispricings(db, { minEdgePct: 5, minConfidence: 0.6, minLiquidity: 0 });

    expect(signals).toHaveLength(1);
    expect(signals[0].modelProb).toBe(0.5);
  });

  it('returns signals from multiple models', () => {
    const { db } = handle;

    seedMarket(db, 'MKT-6', 0.40);
    seedEstimate(db, 'MKT-6', 'weather', 0.70, 0.85);
    seedEstimate(db, 'MKT-6', 'base_rate', 0.65, 0.7);

    const signals = detectMispricings(db, { minEdgePct: 5, minConfidence: 0.6, minLiquidity: 0 });

    expect(signals).toHaveLength(2);
  });

  it('sorts by score descending', () => {
    const { db } = handle;

    seedMarket(db, 'MKT-A', 0.30);
    seedEstimate(db, 'MKT-A', 'model1', 0.60, 0.7); // edge=0.3, score=0.3*0.7=0.21

    seedMarket(db, 'MKT-B', 0.20);
    seedEstimate(db, 'MKT-B', 'model2', 0.70, 0.9); // edge=0.5, score=0.5*0.9=0.45

    const signals = detectMispricings(db, { minEdgePct: 5, minConfidence: 0.6, minLiquidity: 0 });

    expect(signals[0].ticker).toBe('MKT-B');
    expect(signals[1].ticker).toBe('MKT-A');
  });

  it('ignores non-active markets', () => {
    const { db } = handle;

    db.prepare("INSERT INTO markets (ticker, title, status, last_yes_price) VALUES (?, ?, ?, ?)").run(
      'MKT-CL', 'Closed', 'closed', 0.50
    );
    seedEstimate(db, 'MKT-CL', 'weather', 0.90, 0.85);

    const signals = detectMispricings(db, { minEdgePct: 5, minConfidence: 0.6, minLiquidity: 0 });
    expect(signals).toHaveLength(0);
  });

  it('ignores markets with null price', () => {
    const { db } = handle;

    db.prepare("INSERT INTO markets (ticker, title, status, last_yes_price) VALUES (?, ?, ?, ?)").run(
      'MKT-NP', 'No Price', 'active', null
    );
    seedEstimate(db, 'MKT-NP', 'weather', 0.70, 0.85);

    const signals = detectMispricings(db, { minEdgePct: 5, minConfidence: 0.6, minLiquidity: 0 });
    expect(signals).toHaveLength(0);
  });

  it('returns empty array when no markets exist', () => {
    const signals = detectMispricings(handle.db, { minEdgePct: 5, minConfidence: 0.6, minLiquidity: 0 });
    expect(signals).toEqual([]);
  });

  it('includes title and category in signal', () => {
    const { db } = handle;

    seedMarket(db, 'MKT-INFO', 0.40, 'economics');
    seedEstimate(db, 'MKT-INFO', 'econ', 0.70, 0.85);

    const signals = detectMispricings(db, { minEdgePct: 5, minConfidence: 0.6, minLiquidity: 0 });

    expect(signals[0].title).toBe('Market MKT-INFO');
    expect(signals[0].category).toBe('economics');
  });
});

describe('getTopSignals', () => {
  let handle;

  beforeEach(() => {
    handle = createDatabase();
  });

  afterEach(() => {
    if (handle) handle.close();
  });

  it('returns top N signals', () => {
    const { db } = handle;

    for (let i = 0; i < 20; i++) {
      db.prepare("INSERT INTO markets (ticker, title, status, last_yes_price) VALUES (?, ?, ?, ?)").run(
        `SIG-${i}`, `Market ${i}`, 'active', 0.30
      );
      db.prepare(
        "INSERT INTO model_estimates (ticker, timestamp, model_name, estimated_prob, confidence) VALUES (?, ?, ?, ?, ?)"
      ).run(`SIG-${i}`, Date.now(), 'model', 0.60 + i * 0.01, 0.8);
    }

    const top5 = getTopSignals(db, { limit: 5, minEdgePct: 5, minConfidence: 0.6 });
    expect(top5).toHaveLength(5);
    // Should be sorted by score desc
    expect(top5[0].score).toBeGreaterThanOrEqual(top5[4].score);
  });

  it('uses defaults when no options provided', () => {
    const signals = getTopSignals(handle.db);
    expect(signals).toEqual([]);
  });
});
