import { describe, it, expect, vi } from 'vitest';
import { parseEconMarket, fetchFREDData, estimateEconProbability, createEconomicsModel } from '../models/economics.js';

describe('parseEconMarket', () => {
  it('parses CPI market', () => {
    const result = parseEconMarket('Will CPI be above 3%?');
    expect(result).not.toBeNull();
    expect(result.indicator).toBe('cpi');
    expect(result.series).toBe('CPIAUCSL');
    expect(result.threshold).toBe(3);
    expect(result.direction).toBe('above');
  });

  it('parses inflation title', () => {
    const result = parseEconMarket('Will inflation exceed 5.5% in 2026?');
    expect(result.indicator).toBe('cpi');
    expect(result.threshold).toBe(5.5);
    expect(result.direction).toBe('above');
  });

  it('parses GDP market', () => {
    const result = parseEconMarket('Will GDP growth be below 2%?');
    expect(result.indicator).toBe('gdp');
    expect(result.threshold).toBe(2);
    expect(result.direction).toBe('below');
  });

  it('parses gross domestic product title', () => {
    const result = parseEconMarket('Gross domestic product under 1.5%?');
    expect(result.indicator).toBe('gdp');
    expect(result.direction).toBe('below');
  });

  it('parses unemployment market', () => {
    const result = parseEconMarket('Will the unemployment rate exceed 4%?');
    expect(result.indicator).toBe('unemployment');
    expect(result.series).toBe('UNRATE');
    expect(result.threshold).toBe(4);
  });

  it('parses unemployment without "rate"', () => {
    const result = parseEconMarket('Will unemployment be above 5%?');
    expect(result.indicator).toBe('unemployment');
  });

  it('parses nonfarm payrolls market', () => {
    const result = parseEconMarket('Nonfarm payroll above 200000?');
    expect(result.indicator).toBe('nonfarm');
  });

  it('parses jobs report', () => {
    const result = parseEconMarket('Will the jobs report show less than 3%?');
    expect(result.indicator).toBe('nonfarm');
    expect(result.direction).toBe('below');
  });

  it('parses jobs added', () => {
    const result = parseEconMarket('Will jobs added exceed 2%?');
    expect(result.indicator).toBe('nonfarm');
  });

  it('parses PCE market', () => {
    const result = parseEconMarket('Will PCE be above 2.5%?');
    expect(result.indicator).toBe('pce');
    expect(result.series).toBe('PCEPI');
  });

  it('parses personal consumption title', () => {
    const result = parseEconMarket('Personal consumption greater than 3%?');
    expect(result.indicator).toBe('pce');
    expect(result.direction).toBe('above');
  });

  it('parses "less than" direction', () => {
    const result = parseEconMarket('Will CPI be less than 2%?');
    expect(result.direction).toBe('below');
  });

  it('parses "under" direction', () => {
    const result = parseEconMarket('Will CPI be under 2%?');
    expect(result.direction).toBe('below');
  });

  it('parses "more than" direction', () => {
    const result = parseEconMarket('Will CPI be more than 4%?');
    expect(result.direction).toBe('above');
  });

  it('defaults direction to above when no keyword', () => {
    const result = parseEconMarket('CPI at 3%?');
    expect(result.direction).toBe('above');
  });

  it('returns null for non-economic market', () => {
    expect(parseEconMarket('Will it rain tomorrow?')).toBeNull();
  });

  it('returns null for null/empty title', () => {
    expect(parseEconMarket(null)).toBeNull();
    expect(parseEconMarket('')).toBeNull();
  });

  it('returns null threshold when no percentage found', () => {
    const result = parseEconMarket('Will CPI report surprise?');
    expect(result.indicator).toBe('cpi');
    expect(result.threshold).toBeNull();
  });
});

describe('fetchFREDData', () => {
  it('fetches and parses FRED observations', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        observations: [
          { date: '2026-01-01', value: '3.2' },
          { date: '2025-12-01', value: '3.1' },
        ],
      }),
    });

    const data = await fetchFREDData('CPIAUCSL', 'test-key', { fetch: mockFetch });

    expect(data).toEqual([
      { date: '2026-01-01', value: 3.2 },
      { date: '2025-12-01', value: 3.1 },
    ]);

    expect(mockFetch.mock.calls[0][0]).toContain('series_id=CPIAUCSL');
    expect(mockFetch.mock.calls[0][0]).toContain('api_key=test-key');
  });

  it('filters out missing values (.)', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        observations: [
          { date: '2026-01-01', value: '3.2' },
          { date: '2025-12-01', value: '.' },
          { date: '2025-11-01', value: '3.0' },
        ],
      }),
    });

    const data = await fetchFREDData('CPI', 'key', { fetch: mockFetch });
    expect(data).toHaveLength(2);
  });

  it('throws on API error', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 401,
    });

    await expect(fetchFREDData('CPI', 'bad-key', { fetch: mockFetch })).rejects.toThrow('FRED API error 401');
  });

  it('handles empty observations', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ observations: [] }),
    });

    const data = await fetchFREDData('CPI', 'key', { fetch: mockFetch });
    expect(data).toEqual([]);
  });

  it('handles missing observations key', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    const data = await fetchFREDData('CPI', 'key', { fetch: mockFetch });
    expect(data).toEqual([]);
  });

  it('passes limit parameter', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ observations: [] }),
    });

    await fetchFREDData('CPI', 'key', { limit: 10, fetch: mockFetch });
    expect(mockFetch.mock.calls[0][0]).toContain('limit=10');
  });
});

describe('estimateEconProbability', () => {
  it('returns high probability when values are well above threshold', () => {
    const obs = [{ value: 5.0 }, { value: 4.8 }, { value: 4.9 }];
    const { prob } = estimateEconProbability(obs, 3.0, 'above');
    expect(prob).toBeGreaterThan(0.8);
  });

  it('returns low probability when values are well below threshold', () => {
    const obs = [{ value: 2.0 }, { value: 2.1 }, { value: 1.9 }];
    const { prob } = estimateEconProbability(obs, 4.0, 'above');
    expect(prob).toBeLessThan(0.2);
  });

  it('handles below direction', () => {
    const obs = [{ value: 2.0 }, { value: 2.1 }];
    const { prob } = estimateEconProbability(obs, 4.0, 'below');
    expect(prob).toBeGreaterThan(0.8);
  });

  it('returns 0.5 with low confidence for empty observations', () => {
    const { prob, confidence } = estimateEconProbability([], 3.0, 'above');
    expect(prob).toBe(0.5);
    expect(confidence).toBe(0.3);
  });

  it('increases confidence with more observations', () => {
    const few = [{ value: 3.0 }];
    const many = Array.from({ length: 20 }, () => ({ value: 3.0 }));

    const { confidence: confFew } = estimateEconProbability(few, 3.0, 'above');
    const { confidence: confMany } = estimateEconProbability(many, 3.0, 'above');

    expect(confMany).toBeGreaterThan(confFew);
  });

  it('caps confidence at 0.85', () => {
    const many = Array.from({ length: 50 }, () => ({ value: 3.0 }));
    const { confidence } = estimateEconProbability(many, 3.0, 'above');
    expect(confidence).toBeLessThanOrEqual(0.85);
  });

  it('handles zero variance (all same values)', () => {
    const obs = [{ value: 3.0 }, { value: 3.0 }, { value: 3.0 }];
    const { prob } = estimateEconProbability(obs, 3.0, 'above');
    // With zero variance, uses fallback stdDev of 0.5
    expect(prob).toBeGreaterThan(0);
    expect(prob).toBeLessThan(1);
  });
});

describe('createEconomicsModel', () => {
  it('has correct name and categories', () => {
    const model = createEconomicsModel({ apiKey: 'key' });
    expect(model.name).toBe('economics');
    expect(model.categories).toEqual(['economics']);
  });

  it('returns null when no API key', async () => {
    const model = createEconomicsModel({ apiKey: '' });
    const result = await model.estimate({ ticker: 'M1', title: 'CPI above 3%?' });
    expect(result).toBeNull();
  });

  it('returns null for non-parseable market', async () => {
    const model = createEconomicsModel({ apiKey: 'key' });
    const result = await model.estimate({ ticker: 'M1', title: 'Something random' });
    expect(result).toBeNull();
  });

  it('returns null when threshold is missing', async () => {
    const model = createEconomicsModel({ apiKey: 'key' });
    const result = await model.estimate({ ticker: 'M1', title: 'Will CPI report surprise?' });
    expect(result).toBeNull();
  });

  it('returns null when FRED returns no observations', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ observations: [] }),
    });

    const model = createEconomicsModel({ apiKey: 'key', fetch: mockFetch });
    const result = await model.estimate({ ticker: 'M1', title: 'Will CPI be above 3%?' });
    expect(result).toBeNull();
  });

  it('returns a valid estimate for a CPI market', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        observations: [
          { date: '2026-01-01', value: '3.5' },
          { date: '2025-12-01', value: '3.3' },
          { date: '2025-11-01', value: '3.4' },
        ],
      }),
    });

    const model = createEconomicsModel({ apiKey: 'test-key', fetch: mockFetch });
    const result = await model.estimate({
      ticker: 'CPI-ABOVE-3',
      title: 'Will CPI be above 3%?',
    });

    expect(result).not.toBeNull();
    expect(result.ticker).toBe('CPI-ABOVE-3');
    expect(result.estimatedProb).toBeGreaterThan(0);
    expect(result.estimatedProb).toBeLessThanOrEqual(1);
    expect(result.dataSources).toContain('FRED:CPIAUCSL');
    expect(result.reasoning).toContain('cpi');
    expect(result.reasoning).toContain('3');
  });
});
