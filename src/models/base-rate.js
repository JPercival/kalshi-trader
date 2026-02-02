/**
 * Base rate probability model.
 * Uses historical resolution rates from Kalshi's own data to estimate
 * probabilities for recurring market series.
 */

/**
 * Compute the historical base rate for a given series.
 * @param {import('better-sqlite3').Database} db
 * @param {string} seriesTicker - Series ticker to analyze
 * @param {object} [opts]
 * @param {number} [opts.minSamples] - Minimum resolved markets to be confident
 * @returns {{ yesRate: number, totalResolved: number } | null}
 */
export function computeBaseRate(db, seriesTicker, { minSamples = 10 } = {}) {
  const rows = db.prepare(`
    SELECT result FROM markets
    WHERE series_ticker = ? AND result IS NOT NULL AND result != ''
  `).all(seriesTicker);

  if (rows.length < minSamples) return null;

  const yesCount = rows.filter(r => r.result === 'yes').length;
  const yesRate = yesCount / rows.length;

  return {
    yesRate: Math.round(yesRate * 1000) / 1000,
    totalResolved: rows.length,
  };
}

/**
 * Compute base rates for all series with sufficient resolved markets.
 * @param {import('better-sqlite3').Database} db
 * @param {object} [opts]
 * @param {number} [opts.minSamples]
 * @returns {Record<string, { yesRate: number, totalResolved: number }>}
 */
export function computeAllBaseRates(db, { minSamples = 10 } = {}) {
  const series = db.prepare(`
    SELECT DISTINCT series_ticker FROM markets
    WHERE series_ticker IS NOT NULL AND result IS NOT NULL AND result != ''
  `).all();

  const rates = {};

  for (const { series_ticker } of series) {
    const rate = computeBaseRate(db, series_ticker, { minSamples });
    if (rate) {
      rates[series_ticker] = rate;
    }
  }

  return rates;
}

/**
 * Create the base rate model for the model runner.
 * @param {object} [opts]
 * @param {number} [opts.minSamples] - Minimum resolved markets for a series to use base rate
 * @returns {import('../model-runner.js').Model}
 */
export function createBaseRateModel({ minSamples = 10 } = {}) {
  return {
    name: 'base_rate',
    categories: [], // applies to all categories

    async estimate(market) {
      // Need a series_ticker to compute base rate
      if (!market.series_ticker) return null;

      // Use a self-referencing db lookup — the db is accessed via a closure
      // from the model runner, but we receive it as part of the market object
      // or we can access it from the runner context
      return null; // placeholder — see createBaseRateModelWithDb
    },
  };
}

/**
 * Create the base rate model with direct database access.
 * @param {object} opts
 * @param {import('better-sqlite3').Database} opts.db
 * @param {number} [opts.minSamples]
 * @returns {import('../model-runner.js').Model}
 */
export function createBaseRateModelWithDb({ db, minSamples = 10 }) {
  // Pre-compute and cache base rates
  let cachedRates = null;
  let cacheTime = 0;
  const CACHE_TTL = 300000; // 5 minutes

  return {
    name: 'base_rate',
    categories: [], // applies to all categories

    async estimate(market) {
      if (!market.series_ticker) return null;

      // Refresh cache if stale
      const now = Date.now();
      if (!cachedRates || now - cacheTime > CACHE_TTL) {
        cachedRates = computeAllBaseRates(db, { minSamples });
        cacheTime = now;
      }

      const rate = cachedRates[market.series_ticker];
      if (!rate) return null;

      // Confidence scales with sample size
      const confidence = Math.min(0.85, 0.3 + rate.totalResolved * 0.005);

      return {
        ticker: market.ticker,
        estimatedProb: rate.yesRate,
        confidence: Math.round(confidence * 100) / 100,
        dataSources: [`kalshi:${market.series_ticker}`],
        reasoning: `Historical base rate: ${(rate.yesRate * 100).toFixed(1)}% yes from ${rate.totalResolved} resolved markets in series ${market.series_ticker}`,
      };
    },
  };
}
