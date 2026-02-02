/**
 * Weather probability model using NOAA Weather API.
 * Parses market titles to extract location + threshold, then queries NOAA forecast.
 */

/**
 * Known city → lat/lon mappings for NOAA grid lookups.
 * @type {Record<string, {lat: number, lon: number}>}
 */
const CITY_COORDS = {
  'nyc': { lat: 40.7128, lon: -74.006 },
  'new york': { lat: 40.7128, lon: -74.006 },
  'chicago': { lat: 41.8781, lon: -87.6298 },
  'los angeles': { lat: 34.0522, lon: -118.2437 },
  'la': { lat: 34.0522, lon: -118.2437 },
  'miami': { lat: 25.7617, lon: -80.1918 },
  'houston': { lat: 29.7604, lon: -95.3698 },
  'phoenix': { lat: 33.4484, lon: -112.074 },
  'philadelphia': { lat: 39.9526, lon: -75.1652 },
  'san antonio': { lat: 29.4241, lon: -98.4936 },
  'san diego': { lat: 32.7157, lon: -117.1611 },
  'dallas': { lat: 32.7767, lon: -96.797 },
  'austin': { lat: 30.2672, lon: -97.7431 },
  'denver': { lat: 39.7392, lon: -104.9903 },
  'seattle': { lat: 47.6062, lon: -122.3321 },
  'boston': { lat: 42.3601, lon: -71.0589 },
  'atlanta': { lat: 33.749, lon: -84.388 },
  'dc': { lat: 38.9072, lon: -77.0369 },
  'washington': { lat: 38.9072, lon: -77.0369 },
  'san francisco': { lat: 37.7749, lon: -122.4194 },
  'sf': { lat: 37.7749, lon: -122.4194 },
};

/**
 * Parse temperature threshold from a market title.
 * E.g., "Will NYC hit 90°F this week?" → { city: 'nyc', threshold: 90, direction: 'above' }
 * @param {string} title
 * @returns {{ city: string, coords: {lat: number, lon: number}, threshold: number, direction: string } | null}
 */
export function parseWeatherMarket(title) {
  if (!title) return null;

  const lower = title.toLowerCase();

  // Find city
  let matchedCity = null;
  let coords = null;
  for (const [name, c] of Object.entries(CITY_COORDS)) {
    if (lower.includes(name)) {
      // prefer longer matches
      if (!matchedCity || name.length > matchedCity.length) {
        matchedCity = name;
        coords = c;
      }
    }
  }

  if (!coords) return null;

  // Find temperature threshold
  const tempMatch = lower.match(/(\d+)\s*°?\s*[fF]/);
  if (!tempMatch) return null;

  const threshold = parseInt(tempMatch[1], 10);

  // Determine direction
  const direction = /above|exceed|hit|over|higher|reach|top/i.test(title) ? 'above' : 'below';

  return { city: matchedCity, coords, threshold, direction };
}

/**
 * Fetch NOAA forecast for a lat/lon.
 * @param {number} lat
 * @param {number} lon
 * @param {typeof globalThis.fetch} [fetchFn]
 * @returns {Promise<{maxTemps: number[], minTemps: number[]}>}
 */
export async function fetchNOAAForecast(lat, lon, fetchFn = globalThis.fetch) {
  // Step 1: Get the grid point
  const pointUrl = `https://api.weather.gov/points/${lat},${lon}`;
  const pointRes = await fetchFn(pointUrl, {
    headers: { 'User-Agent': 'kalshi-trader/1.0 (paper trading research)' },
  });

  if (!pointRes.ok) {
    throw new Error(`NOAA points API error ${pointRes.status}`);
  }

  const pointData = await pointRes.json();
  const forecastUrl = pointData.properties.forecast;

  // Step 2: Get the forecast
  const forecastRes = await fetchFn(forecastUrl, {
    headers: { 'User-Agent': 'kalshi-trader/1.0 (paper trading research)' },
  });

  if (!forecastRes.ok) {
    throw new Error(`NOAA forecast API error ${forecastRes.status}`);
  }

  const forecastData = await forecastRes.json();
  const periods = forecastData.properties.periods || [];

  const maxTemps = [];
  const minTemps = [];

  for (const p of periods) {
    if (p.isDaytime) {
      maxTemps.push(p.temperature);
    } else {
      minTemps.push(p.temperature);
    }
  }

  return { maxTemps, minTemps };
}

/**
 * Estimate probability of temperature exceeding/falling below threshold.
 * Uses NOAA forecast + simple probabilistic model.
 * @param {number[]} temps - Array of forecast temperatures
 * @param {number} threshold
 * @param {string} direction - 'above' or 'below'
 * @returns {number} Probability estimate between 0 and 1
 */
export function estimateTempProbability(temps, threshold, direction) {
  if (!temps.length) return 0.5;

  // Simple model: what fraction of forecast periods exceed the threshold?
  // Add uncertainty: NOAA forecasts have ~3°F RMSE for days 1-3, ~5°F for 4-7
  const UNCERTAINTY = 4; // average forecast uncertainty in °F

  let probSum = 0;
  for (const temp of temps) {
    // Use a logistic function centered on the threshold
    const diff = direction === 'above' ? temp - threshold : threshold - temp;
    const prob = 1 / (1 + Math.exp(-diff / UNCERTAINTY));
    probSum += prob;
  }

  return probSum / temps.length;
}

/**
 * Create the weather model for the model runner.
 * @param {object} [opts]
 * @param {typeof globalThis.fetch} [opts.fetch] - Fetch implementation (for testing)
 * @returns {import('../model-runner.js').Model}
 */
export function createWeatherModel({ fetch: fetchFn = globalThis.fetch } = {}) {
  return {
    name: 'weather',
    categories: ['weather'],

    /**
     * @param {object} market
     * @returns {Promise<import('./base.js').ModelEstimate|null>}
     */
    async estimate(market) {
      const parsed = parseWeatherMarket(market.title);
      if (!parsed) return null;

      const forecast = await fetchNOAAForecast(parsed.coords.lat, parsed.coords.lon, fetchFn);
      const temps = parsed.direction === 'above' ? forecast.maxTemps : forecast.minTemps;

      if (!temps.length) return null;

      const prob = estimateTempProbability(temps, parsed.threshold, parsed.direction);

      // Confidence decreases with longer forecast periods
      const confidence = Math.max(0.4, 0.9 - (temps.length - 1) * 0.05);

      return {
        ticker: market.ticker,
        estimatedProb: Math.round(prob * 1000) / 1000,
        confidence: Math.round(confidence * 100) / 100,
        dataSources: ['NOAA Weather API'],
        reasoning: `NOAA forecast for ${parsed.city}: ${temps.length} periods, threshold ${parsed.threshold}°F ${parsed.direction}`,
      };
    },
  };
}
