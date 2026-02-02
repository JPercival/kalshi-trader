/**
 * Economics probability model using FRED (Federal Reserve Economic Data) API.
 * Estimates probabilities for CPI, GDP, unemployment, and related markets.
 */

/**
 * FRED series IDs for key economic indicators.
 */
const FRED_SERIES = {
  cpi: 'CPIAUCSL',          // CPI for all urban consumers
  core_cpi: 'CPILFESL',     // Core CPI (less food and energy)
  gdp: 'GDP',               // Gross domestic product
  unemployment: 'UNRATE',   // Unemployment rate
  nonfarm: 'PAYEMS',        // Nonfarm payrolls
  pce: 'PCEPI',             // PCE price index
  fed_funds: 'FEDFUNDS',    // Federal funds rate
};

/**
 * Patterns to detect economic indicator type from market title.
 * @type {Array<[RegExp, string]>}
 */
const INDICATOR_PATTERNS = [
  [/\bcpi\b|consumer\s+price|inflation/i, 'cpi'],
  [/\bgdp\b|gross\s+domestic/i, 'gdp'],
  [/unemployment\s*(rate)?/i, 'unemployment'],
  [/nonfarm|payroll|jobs?\s+(report|number|added)/i, 'nonfarm'],
  [/\bpce\b|personal\s+consumption/i, 'pce'],
];

/**
 * Parse an economics market to identify the indicator and threshold.
 * @param {string} title
 * @returns {{ indicator: string, series: string, threshold: number|null, direction: string } | null}
 */
export function parseEconMarket(title) {
  if (!title) return null;

  let indicator = null;
  for (const [pattern, ind] of INDICATOR_PATTERNS) {
    if (pattern.test(title)) {
      indicator = ind;
      break;
    }
  }

  if (!indicator) return null;

  const series = FRED_SERIES[indicator];

  // Try to extract a threshold number (e.g., "above 3%", "below 4.5%")
  const thresholdMatch = title.match(/(above|below|over|under|exceed|less\s+than|greater\s+than|more\s+than)?\s*(\d+\.?\d*)\s*%/i);
  let threshold = null;
  let direction = 'above';

  if (thresholdMatch) {
    threshold = parseFloat(thresholdMatch[2]);
    const dirWord = (thresholdMatch[1] || '').toLowerCase();
    if (/below|under|less/.test(dirWord)) {
      direction = 'below';
    }
  }

  return { indicator, series, threshold, direction };
}

/**
 * Fetch the latest observations from FRED API.
 * @param {string} seriesId - FRED series ID
 * @param {string} apiKey - FRED API key
 * @param {object} [opts]
 * @param {number} [opts.limit] - Number of observations to fetch
 * @param {typeof globalThis.fetch} [opts.fetch] - Fetch implementation
 * @returns {Promise<Array<{date: string, value: number}>>}
 */
export async function fetchFREDData(seriesId, apiKey, { limit = 24, fetch: fetchFn = globalThis.fetch } = {}) {
  const url = new URL('https://api.stlouisfed.org/fred/series/observations');
  url.searchParams.set('series_id', seriesId);
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('file_type', 'json');
  url.searchParams.set('sort_order', 'desc');
  url.searchParams.set('limit', String(limit));

  const res = await fetchFn(url.toString());
  if (!res.ok) {
    throw new Error(`FRED API error ${res.status}`);
  }

  const data = await res.json();
  const observations = data.observations || [];

  return observations
    .filter(o => o.value !== '.')
    .map(o => ({
      date: o.date,
      value: parseFloat(o.value),
    }));
}

/**
 * Estimate the probability that an economic indicator will be above/below a threshold.
 * Uses recent trend and historical variance.
 * @param {Array<{value: number}>} observations - Recent values (newest first)
 * @param {number} threshold
 * @param {string} direction - 'above' or 'below'
 * @returns {{ prob: number, confidence: number }}
 */
export function estimateEconProbability(observations, threshold, direction) {
  if (!observations.length) {
    return { prob: 0.5, confidence: 0.3 };
  }

  const values = observations.map(o => o.value);
  const latest = values[0];

  // Calculate mean and standard deviation
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  const stdDev = Math.sqrt(variance);

  // Use z-score based probability
  const effectiveStd = stdDev || 0.5; // avoid division by zero
  const z = (threshold - latest) / effectiveStd;

  // Approximate normal CDF using logistic function
  let prob;
  if (direction === 'above') {
    // P(X > threshold)
    prob = 1 / (1 + Math.exp(z * 1.7));
  } else {
    // P(X < threshold)
    prob = 1 / (1 + Math.exp(-z * 1.7));
  }

  // Confidence based on data quantity and recency
  const confidence = Math.min(0.85, 0.4 + observations.length * 0.02);

  return {
    prob: Math.round(prob * 1000) / 1000,
    confidence: Math.round(confidence * 100) / 100,
  };
}

/**
 * Create the economics model for the model runner.
 * @param {object} opts
 * @param {string} opts.apiKey - FRED API key
 * @param {typeof globalThis.fetch} [opts.fetch] - Fetch implementation
 * @returns {import('../model-runner.js').Model}
 */
export function createEconomicsModel({ apiKey, fetch: fetchFn = globalThis.fetch }) {
  return {
    name: 'economics',
    categories: ['economics'],

    async estimate(market) {
      if (!apiKey) return null;

      const parsed = parseEconMarket(market.title);
      if (!parsed) return null;
      if (parsed.threshold === null) return null;

      const observations = await fetchFREDData(parsed.series, apiKey, { fetch: fetchFn });
      if (!observations.length) return null;

      const { prob, confidence } = estimateEconProbability(observations, parsed.threshold, parsed.direction);

      return {
        ticker: market.ticker,
        estimatedProb: prob,
        confidence,
        dataSources: [`FRED:${parsed.series}`],
        reasoning: `${parsed.indicator} latest=${observations[0].value}, threshold=${parsed.threshold}% ${parsed.direction}, based on ${observations.length} observations`,
      };
    },
  };
}
