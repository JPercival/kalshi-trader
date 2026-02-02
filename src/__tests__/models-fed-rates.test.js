import { describe, it, expect, vi } from 'vitest';
import { parseFedMarket, estimateFedProbability, createFedRatesModel } from '../models/fed-rates.js';

describe('parseFedMarket', () => {
  it('parses rate cut market', () => {
    const result = parseFedMarket('Will the Fed cut rates in March?');
    expect(result).not.toBeNull();
    expect(result.action).toBe('cut');
    expect(result.basisPoints).toBeNull();
  });

  it('parses rate hike market', () => {
    const result = parseFedMarket('Will the Federal Reserve raise rates?');
    expect(result.action).toBe('hike');
  });

  it('parses rate hold market', () => {
    const result = parseFedMarket('Will the FOMC hold rates unchanged?');
    expect(result.action).toBe('hold');
  });

  it('parses rate hold with "pause" keyword', () => {
    const result = parseFedMarket('Will the Fed pause rate changes?');
    expect(result.action).toBe('hold');
  });

  it('parses rate hold with "no change" keyword', () => {
    const result = parseFedMarket('Will the FOMC make no change to interest rate?');
    expect(result.action).toBe('hold');
  });

  it('parses basis points', () => {
    const result = parseFedMarket('Will the Fed cut rates by 50bp?');
    expect(result.basisPoints).toBe(50);
  });

  it('parses "basis point" spelled out', () => {
    const result = parseFedMarket('Will the Fed hike by 25 basis points?');
    expect(result.basisPoints).toBe(25);
  });

  it('parses percentage to basis points', () => {
    const result = parseFedMarket('Will the Fed cut by 0.25%?');
    expect(result.basisPoints).toBe(25);
  });

  it('returns null for non-Fed market', () => {
    expect(parseFedMarket('Will CPI be above 3%?')).toBeNull();
  });

  it('returns null for Fed market without action keyword', () => {
    expect(parseFedMarket('Will the Fed announce something?')).toBeNull();
  });

  it('returns null for null/empty title', () => {
    expect(parseFedMarket(null)).toBeNull();
    expect(parseFedMarket('')).toBeNull();
  });

  it('parses rate reduction keyword', () => {
    const result = parseFedMarket('Federal Reserve rate reduction expected?');
    expect(result.action).toBe('cut');
  });

  it('parses rate decrease keyword', () => {
    const result = parseFedMarket('Fed rate decrease in June?');
    expect(result.action).toBe('cut');
  });

  it('parses rate increase keyword', () => {
    const result = parseFedMarket('Fed rate increase coming?');
    expect(result.action).toBe('hike');
  });

  it('parses interest rate context', () => {
    const result = parseFedMarket('Will the interest rate be cut?');
    expect(result.action).toBe('cut');
  });
});

describe('estimateFedProbability', () => {
  it('returns higher cut probability when rates trending down', () => {
    const { prob } = estimateFedProbability({
      action: 'cut',
      basisPoints: null,
      currentRate: 5.0,
      recentRates: [5.0, 5.25, 5.5, 5.5],
    });
    expect(prob).toBeGreaterThan(0.5);
  });

  it('returns lower cut probability when rates trending up', () => {
    const { prob } = estimateFedProbability({
      action: 'cut',
      basisPoints: null,
      currentRate: 5.5,
      recentRates: [5.5, 5.25, 5.0, 4.75],
    });
    expect(prob).toBeLessThan(0.3);
  });

  it('returns moderate cut probability when rates flat', () => {
    const { prob } = estimateFedProbability({
      action: 'cut',
      basisPoints: null,
      currentRate: 5.0,
      recentRates: [5.0, 5.0, 5.0],
    });
    expect(prob).toBeGreaterThan(0.2);
    expect(prob).toBeLessThan(0.5);
  });

  it('returns higher hike probability when rates trending up', () => {
    const { prob } = estimateFedProbability({
      action: 'hike',
      basisPoints: null,
      currentRate: 5.5,
      recentRates: [5.5, 5.25, 5.0, 4.75],
    });
    expect(prob).toBeGreaterThan(0.5);
  });

  it('returns lower hike probability when rates trending down', () => {
    const { prob } = estimateFedProbability({
      action: 'hike',
      basisPoints: null,
      currentRate: 5.0,
      recentRates: [5.0, 5.25, 5.5],
    });
    expect(prob).toBeLessThan(0.3);
  });

  it('returns moderate hike probability when rates flat', () => {
    const { prob } = estimateFedProbability({
      action: 'hike',
      basisPoints: null,
      currentRate: 5.0,
      recentRates: [5.0, 5.0, 5.0],
    });
    expect(prob).toBeGreaterThan(0.2);
    expect(prob).toBeLessThan(0.5);
  });

  it('returns high hold probability when rates stable', () => {
    const { prob } = estimateFedProbability({
      action: 'hold',
      basisPoints: null,
      currentRate: 5.0,
      recentRates: [5.0, 5.0, 5.0, 5.0],
    });
    expect(prob).toBeGreaterThan(0.6);
  });

  it('returns moderate hold probability with some volatility', () => {
    const { prob } = estimateFedProbability({
      action: 'hold',
      basisPoints: null,
      currentRate: 5.0,
      recentRates: [5.0, 5.02, 4.98, 5.01],
    });
    expect(prob).toBeGreaterThanOrEqual(0.3);
    expect(prob).toBeLessThanOrEqual(0.7);
  });

  it('returns lower hold probability with high volatility', () => {
    const { prob } = estimateFedProbability({
      action: 'hold',
      basisPoints: null,
      currentRate: 5.0,
      recentRates: [5.0, 5.25, 4.75, 5.5],
    });
    expect(prob).toBeLessThan(0.5);
  });

  it('reduces probability for large basis point moves', () => {
    const { prob: small } = estimateFedProbability({
      action: 'cut',
      basisPoints: 25,
      currentRate: 5.0,
      recentRates: [5.0, 5.25, 5.5],
    });

    const { prob: large } = estimateFedProbability({
      action: 'cut',
      basisPoints: 75,
      currentRate: 5.0,
      recentRates: [5.0, 5.25, 5.5],
    });

    expect(large).toBeLessThan(small);
  });

  it('does not reduce probability for standard 25bp move', () => {
    const { prob: noBp } = estimateFedProbability({
      action: 'cut',
      basisPoints: null,
      currentRate: 5.0,
      recentRates: [5.0, 5.25, 5.5],
    });

    const { prob: stdBp } = estimateFedProbability({
      action: 'cut',
      basisPoints: 25,
      currentRate: 5.0,
      recentRates: [5.0, 5.25, 5.5],
    });

    expect(stdBp).toBe(noBp);
  });

  it('returns default for empty rates', () => {
    const { prob, confidence } = estimateFedProbability({
      action: 'cut',
      basisPoints: null,
      currentRate: 5.0,
      recentRates: [],
    });
    expect(prob).toBe(0.5);
    expect(confidence).toBe(0.3);
  });

  it('handles single rate value (no changes)', () => {
    const { prob } = estimateFedProbability({
      action: 'hold',
      basisPoints: null,
      currentRate: 5.0,
      recentRates: [5.0],
    });
    // Zero volatility → high hold prob
    expect(prob).toBeGreaterThan(0.5);
  });

  it('clamps probability between 0.05 and 0.95', () => {
    const { prob: high } = estimateFedProbability({
      action: 'cut',
      basisPoints: null,
      currentRate: 5.0,
      recentRates: [5.0, 5.5, 6.0, 6.5, 7.0, 7.5, 8.0],
    });
    expect(high).toBeLessThanOrEqual(0.95);
    expect(high).toBeGreaterThanOrEqual(0.05);
  });
});

describe('createFedRatesModel', () => {
  it('has correct name and categories', () => {
    const model = createFedRatesModel({ apiKey: 'key' });
    expect(model.name).toBe('fed_rates');
    expect(model.categories).toEqual(['fed_rates']);
  });

  it('returns null when no API key', async () => {
    const model = createFedRatesModel({ apiKey: '' });
    const result = await model.estimate({ ticker: 'M1', title: 'Will the Fed cut rates?' });
    expect(result).toBeNull();
  });

  it('returns null for non-Fed market', async () => {
    const model = createFedRatesModel({ apiKey: 'key' });
    const result = await model.estimate({ ticker: 'M1', title: 'Will it rain?' });
    expect(result).toBeNull();
  });

  it('returns null when FRED returns no data', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ observations: [] }),
    });

    const model = createFedRatesModel({ apiKey: 'key', fetch: mockFetch });
    const result = await model.estimate({ ticker: 'M1', title: 'Will the Fed cut rates?' });
    expect(result).toBeNull();
  });

  it('returns a valid estimate for a Fed cut market', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        observations: [
          { date: '2026-01-01', value: '5.00' },
          { date: '2025-12-01', value: '5.25' },
          { date: '2025-11-01', value: '5.25' },
          { date: '2025-10-01', value: '5.50' },
        ],
      }),
    });

    const model = createFedRatesModel({ apiKey: 'key', fetch: mockFetch });
    const result = await model.estimate({
      ticker: 'FED-CUT-MAR',
      title: 'Will the Fed cut rates in March?',
    });

    expect(result).not.toBeNull();
    expect(result.ticker).toBe('FED-CUT-MAR');
    expect(result.estimatedProb).toBeGreaterThan(0);
    expect(result.estimatedProb).toBeLessThanOrEqual(1);
    expect(result.dataSources).toContain('FRED:FEDFUNDS');
    expect(result.reasoning).toContain('cut');
  });

  it('includes basis points in reasoning when present', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        observations: [
          { date: '2026-01-01', value: '5.00' },
          { date: '2025-12-01', value: '5.25' },
        ],
      }),
    });

    const model = createFedRatesModel({ apiKey: 'key', fetch: mockFetch });
    const result = await model.estimate({
      ticker: 'FED-CUT-50BP',
      title: 'Will the Fed cut rates by 50bp?',
    });

    expect(result.reasoning).toContain('50bp');
  });
});
