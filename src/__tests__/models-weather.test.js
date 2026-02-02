import { describe, it, expect, vi } from 'vitest';
import { parseWeatherMarket, fetchNOAAForecast, estimateTempProbability, createWeatherModel } from '../models/weather.js';

describe('parseWeatherMarket', () => {
  it('parses NYC temperature above market', () => {
    const result = parseWeatherMarket('Will NYC hit 90°F this week?');
    expect(result).not.toBeNull();
    expect(result.city).toBe('nyc');
    expect(result.threshold).toBe(90);
    expect(result.direction).toBe('above');
    expect(result.coords.lat).toBeCloseTo(40.7128);
  });

  it('parses Chicago below-threshold market', () => {
    const result = parseWeatherMarket('Will Chicago drop below 10°F?');
    expect(result).not.toBeNull();
    expect(result.city).toBe('chicago');
    expect(result.threshold).toBe(10);
    expect(result.direction).toBe('below');
  });

  it('parses temperature without degree symbol', () => {
    const result = parseWeatherMarket('Will Denver exceed 100 F this summer?');
    expect(result).not.toBeNull();
    expect(result.threshold).toBe(100);
    expect(result.direction).toBe('above');
  });

  it('prefers longer city name match', () => {
    const result = parseWeatherMarket('Will New York reach 85°F?');
    expect(result.city).toBe('new york');
  });

  it('recognizes San Francisco as sf alias', () => {
    const result = parseWeatherMarket('Will SF reach 75°F?');
    expect(result).not.toBeNull();
    expect(result.coords.lat).toBeCloseTo(37.7749);
  });

  it('replaces shorter city match with a longer one (dc → washington)', () => {
    // "dc" appears before "washington" in CITY_COORDS,
    // so "washington dc" matches "dc" first, then "washington" replaces it
    const result = parseWeatherMarket('Will Washington DC exceed 95°F?');
    expect(result.city).toBe('washington');
  });

  it('does not replace a longer city match with a shorter one', () => {
    // "san francisco" contains "sf" but "san francisco" is longer, so should win
    const result = parseWeatherMarket('Will San Francisco reach 75°F?');
    expect(result.city).toBe('san francisco');
  });

  it('returns null for unknown city', () => {
    expect(parseWeatherMarket('Will Timbuktu hit 120°F?')).toBeNull();
  });

  it('returns null for missing temperature', () => {
    expect(parseWeatherMarket('Will it rain in NYC this week?')).toBeNull();
  });

  it('returns null for null/empty title', () => {
    expect(parseWeatherMarket(null)).toBeNull();
    expect(parseWeatherMarket('')).toBeNull();
  });

  it('parses various above keywords', () => {
    expect(parseWeatherMarket('Will NYC exceed 90°F?').direction).toBe('above');
    expect(parseWeatherMarket('Will NYC go over 90°F?').direction).toBe('above');
    expect(parseWeatherMarket('Will NYC reach 90°F?').direction).toBe('above');
    expect(parseWeatherMarket('Will NYC top 90°F?').direction).toBe('above');
    expect(parseWeatherMarket('Will 90°F be higher in NYC?').direction).toBe('above');
  });
});

describe('fetchNOAAForecast', () => {
  it('fetches and parses NOAA forecast data', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          properties: {
            forecast: 'https://api.weather.gov/gridpoints/OKX/33,37/forecast',
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          properties: {
            periods: [
              { isDaytime: true, temperature: 85 },
              { isDaytime: false, temperature: 65 },
              { isDaytime: true, temperature: 88 },
              { isDaytime: false, temperature: 68 },
            ],
          },
        }),
      });

    const result = await fetchNOAAForecast(40.7128, -74.006, mockFetch);

    expect(result.maxTemps).toEqual([85, 88]);
    expect(result.minTemps).toEqual([65, 68]);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('throws on points API error', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    await expect(fetchNOAAForecast(0, 0, mockFetch)).rejects.toThrow('NOAA points API error 500');
  });

  it('throws on forecast API error', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          properties: { forecast: 'https://api.weather.gov/forecast' },
        }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
      });

    await expect(fetchNOAAForecast(0, 0, mockFetch)).rejects.toThrow('NOAA forecast API error 503');
  });

  it('handles empty periods', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          properties: { forecast: 'https://api.weather.gov/forecast' },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          properties: { periods: [] },
        }),
      });

    const result = await fetchNOAAForecast(0, 0, mockFetch);
    expect(result.maxTemps).toEqual([]);
    expect(result.minTemps).toEqual([]);
  });

  it('handles missing periods key', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          properties: { forecast: 'https://api.weather.gov/forecast' },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          properties: {},
        }),
      });

    const result = await fetchNOAAForecast(0, 0, mockFetch);
    expect(result.maxTemps).toEqual([]);
    expect(result.minTemps).toEqual([]);
  });
});

describe('estimateTempProbability', () => {
  it('returns high probability when temps are well above threshold', () => {
    const prob = estimateTempProbability([95, 92, 90], 80, 'above');
    expect(prob).toBeGreaterThan(0.9);
  });

  it('returns low probability when temps are well below threshold', () => {
    const prob = estimateTempProbability([70, 72, 68], 90, 'above');
    expect(prob).toBeLessThan(0.1);
  });

  it('returns ~0.5 when temps are at threshold', () => {
    const prob = estimateTempProbability([90], 90, 'above');
    expect(prob).toBeCloseTo(0.5, 1);
  });

  it('handles below direction', () => {
    const prob = estimateTempProbability([10, 12, 8], 20, 'below');
    expect(prob).toBeGreaterThan(0.8);
  });

  it('returns 0.5 for empty temps array', () => {
    expect(estimateTempProbability([], 90, 'above')).toBe(0.5);
  });
});

describe('createWeatherModel', () => {
  it('has correct name and categories', () => {
    const model = createWeatherModel();
    expect(model.name).toBe('weather');
    expect(model.categories).toEqual(['weather']);
  });

  it('returns null for non-parseable market', async () => {
    const model = createWeatherModel();
    const result = await model.estimate({ ticker: 'MKT-1', title: 'Something unrelated' });
    expect(result).toBeNull();
  });

  it('returns an estimate for a valid weather market', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          properties: { forecast: 'https://api.weather.gov/forecast' },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          properties: {
            periods: [
              { isDaytime: true, temperature: 92 },
              { isDaytime: false, temperature: 72 },
              { isDaytime: true, temperature: 88 },
            ],
          },
        }),
      });

    const model = createWeatherModel({ fetch: mockFetch });
    const result = await model.estimate({
      ticker: 'WEATHER-NYC-90F',
      title: 'Will NYC hit 90°F this week?',
    });

    expect(result).not.toBeNull();
    expect(result.ticker).toBe('WEATHER-NYC-90F');
    expect(result.estimatedProb).toBeGreaterThan(0);
    expect(result.estimatedProb).toBeLessThanOrEqual(1);
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.dataSources).toContain('NOAA Weather API');
    expect(result.reasoning).toContain('nyc');
  });

  it('returns an estimate for a below-threshold weather market', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          properties: { forecast: 'https://api.weather.gov/forecast' },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          properties: {
            periods: [
              { isDaytime: true, temperature: 25 },
              { isDaytime: false, temperature: 8 },
              { isDaytime: true, temperature: 30 },
              { isDaytime: false, temperature: 12 },
            ],
          },
        }),
      });

    const model = createWeatherModel({ fetch: mockFetch });
    const result = await model.estimate({
      ticker: 'WEATHER-CHI-10F',
      title: 'Will Chicago drop below 10°F this week?',
    });

    expect(result).not.toBeNull();
    expect(result.ticker).toBe('WEATHER-CHI-10F');
    expect(result.estimatedProb).toBeGreaterThan(0);
    expect(result.estimatedProb).toBeLessThanOrEqual(1);
  });

  it('returns null when no forecast temps available', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          properties: { forecast: 'https://api.weather.gov/forecast' },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          properties: { periods: [] },
        }),
      });

    const model = createWeatherModel({ fetch: mockFetch });
    const result = await model.estimate({
      ticker: 'W-1',
      title: 'Will NYC hit 90°F this week?',
    });

    expect(result).toBeNull();
  });

  it('calculates confidence based on forecast period count', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          properties: { forecast: 'https://api.weather.gov/forecast' },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          properties: {
            periods: [
              { isDaytime: true, temperature: 92 },
              { isDaytime: false, temperature: 72 },
              { isDaytime: true, temperature: 88 },
              { isDaytime: false, temperature: 70 },
              { isDaytime: true, temperature: 85 },
              { isDaytime: false, temperature: 68 },
              { isDaytime: true, temperature: 90 },
              { isDaytime: false, temperature: 71 },
              { isDaytime: true, temperature: 87 },
              { isDaytime: false, temperature: 69 },
              { isDaytime: true, temperature: 91 },
              { isDaytime: false, temperature: 73 },
              { isDaytime: true, temperature: 89 },
              { isDaytime: false, temperature: 70 },
            ],
          },
        }),
      });

    const model = createWeatherModel({ fetch: mockFetch });
    const result = await model.estimate({
      ticker: 'W-2',
      title: 'Will NYC hit 90°F this week?',
    });

    // With 7 daytime periods, confidence = max(0.4, 0.9 - 6*0.05) = 0.6
    expect(result.confidence).toBe(0.6);
  });
});
