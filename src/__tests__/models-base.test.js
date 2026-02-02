import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase } from '../db.js';
import { validateEstimate, storeEstimate, getLatestEstimate } from '../models/base.js';

describe('validateEstimate', () => {
  const valid = {
    ticker: 'MKT-1',
    estimatedProb: 0.65,
    confidence: 0.8,
    dataSources: ['NOAA'],
    reasoning: 'Forecast says likely',
  };

  it('returns true for a valid estimate', () => {
    expect(validateEstimate(valid)).toBe(true);
  });

  it('returns false for null/undefined', () => {
    expect(validateEstimate(null)).toBe(false);
    expect(validateEstimate(undefined)).toBe(false);
  });

  it('returns false for non-object', () => {
    expect(validateEstimate('string')).toBe(false);
    expect(validateEstimate(42)).toBe(false);
  });

  it('returns false for missing ticker', () => {
    expect(validateEstimate({ ...valid, ticker: '' })).toBe(false);
    expect(validateEstimate({ ...valid, ticker: 123 })).toBe(false);
  });

  it('returns false for invalid estimatedProb', () => {
    expect(validateEstimate({ ...valid, estimatedProb: -0.1 })).toBe(false);
    expect(validateEstimate({ ...valid, estimatedProb: 1.1 })).toBe(false);
    expect(validateEstimate({ ...valid, estimatedProb: 'abc' })).toBe(false);
  });

  it('returns false for invalid confidence', () => {
    expect(validateEstimate({ ...valid, confidence: -0.1 })).toBe(false);
    expect(validateEstimate({ ...valid, confidence: 1.1 })).toBe(false);
    expect(validateEstimate({ ...valid, confidence: 'high' })).toBe(false);
  });

  it('returns false for non-array dataSources', () => {
    expect(validateEstimate({ ...valid, dataSources: 'NOAA' })).toBe(false);
  });

  it('returns false for non-string reasoning', () => {
    expect(validateEstimate({ ...valid, reasoning: 42 })).toBe(false);
  });

  it('accepts edge values (0 and 1)', () => {
    expect(validateEstimate({ ...valid, estimatedProb: 0, confidence: 0 })).toBe(true);
    expect(validateEstimate({ ...valid, estimatedProb: 1, confidence: 1 })).toBe(true);
  });
});

describe('storeEstimate', () => {
  let handle;

  beforeEach(() => {
    handle = createDatabase();
    handle.db.prepare('INSERT INTO markets (ticker) VALUES (?)').run('MKT-1');
  });

  afterEach(() => {
    if (handle) handle.close();
  });

  it('stores an estimate and returns its id', () => {
    const result = storeEstimate(handle.db, 'weather', {
      ticker: 'MKT-1',
      estimatedProb: 0.7,
      confidence: 0.85,
      dataSources: ['NOAA', 'NWS'],
      reasoning: 'High probability per NOAA forecast',
    });

    expect(result.id).toBeGreaterThan(0);

    const row = handle.db.prepare('SELECT * FROM model_estimates WHERE id = ?').get(result.id);
    expect(row.ticker).toBe('MKT-1');
    expect(row.model_name).toBe('weather');
    expect(row.estimated_prob).toBe(0.7);
    expect(row.confidence).toBe(0.85);
    expect(JSON.parse(row.data_sources)).toEqual(['NOAA', 'NWS']);
    expect(row.reasoning).toBe('High probability per NOAA forecast');
    expect(row.timestamp).toBeGreaterThan(0);
  });
});

describe('getLatestEstimate', () => {
  let handle;

  beforeEach(() => {
    handle = createDatabase();
    handle.db.prepare('INSERT INTO markets (ticker) VALUES (?)').run('MKT-1');
  });

  afterEach(() => {
    if (handle) handle.close();
  });

  it('returns the latest estimate for a ticker', () => {
    const { db } = handle;

    db.prepare(
      'INSERT INTO model_estimates (ticker, timestamp, model_name, estimated_prob, confidence) VALUES (?, ?, ?, ?, ?)'
    ).run('MKT-1', 1000, 'weather', 0.5, 0.7);
    db.prepare(
      'INSERT INTO model_estimates (ticker, timestamp, model_name, estimated_prob, confidence) VALUES (?, ?, ?, ?, ?)'
    ).run('MKT-1', 2000, 'weather', 0.6, 0.8);

    const est = getLatestEstimate(db, 'MKT-1');
    expect(est.estimated_prob).toBe(0.6);
    expect(est.timestamp).toBe(2000);
  });

  it('filters by model name when provided', () => {
    const { db } = handle;

    db.prepare(
      'INSERT INTO model_estimates (ticker, timestamp, model_name, estimated_prob, confidence) VALUES (?, ?, ?, ?, ?)'
    ).run('MKT-1', 1000, 'weather', 0.5, 0.7);
    db.prepare(
      'INSERT INTO model_estimates (ticker, timestamp, model_name, estimated_prob, confidence) VALUES (?, ?, ?, ?, ?)'
    ).run('MKT-1', 2000, 'base_rate', 0.6, 0.8);

    const est = getLatestEstimate(db, 'MKT-1', 'weather');
    expect(est.model_name).toBe('weather');
    expect(est.estimated_prob).toBe(0.5);
  });

  it('returns null when no estimate exists', () => {
    expect(getLatestEstimate(handle.db, 'NONEXIST')).toBeNull();
  });

  it('returns null when no estimate exists for given model', () => {
    const { db } = handle;

    db.prepare(
      'INSERT INTO model_estimates (ticker, timestamp, model_name, estimated_prob, confidence) VALUES (?, ?, ?, ?, ?)'
    ).run('MKT-1', 1000, 'weather', 0.5, 0.7);

    expect(getLatestEstimate(db, 'MKT-1', 'base_rate')).toBeNull();
  });
});
