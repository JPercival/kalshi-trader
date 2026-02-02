/**
 * Mispricing detection engine.
 * Compares model probability estimates to market prices and identifies potential edges.
 */

/**
 * @typedef {object} MispricingSignal
 * @property {string} ticker
 * @property {string} title
 * @property {string} category
 * @property {number} marketPrice - Current market yes price
 * @property {number} modelProb - Model's estimated P(yes)
 * @property {number} confidence - Model's confidence
 * @property {string} modelName - Which model produced this
 * @property {number} edge - modelProb - marketPrice (positive = underpriced yes)
 * @property {number} absEdge - Absolute edge
 * @property {string} side - 'yes' if model says underpriced, 'no' if overpriced
 * @property {number} score - Composite signal score (edge × confidence)
 */

/**
 * Detect mispricings for all active markets with model estimates.
 * @param {import('better-sqlite3').Database} db
 * @param {object} opts
 * @param {number} opts.minEdgePct - Minimum |edge| in percentage points
 * @param {number} opts.minConfidence - Minimum model confidence
 * @param {number} opts.minLiquidity - Minimum open interest (if data available)
 * @param {number} [opts.coinFlipMin] - Min price for coin-flip zone (default 0.30)
 * @param {number} [opts.coinFlipMax] - Max price for coin-flip zone (default 0.70)
 * @returns {MispricingSignal[]}
 */
export function detectMispricings(db, { minEdgePct = 5, minConfidence = 0.6, minLiquidity = 0, coinFlipMin = 0.30, coinFlipMax = 0.70 }) {
  // Get active markets in the "coin flip" zone — where the market is genuinely uncertain
  const markets = db.prepare(`
    SELECT m.ticker, m.event_ticker, m.title, m.category, m.last_yes_price, m.status
    FROM markets m
    WHERE m.status = 'active' AND m.last_yes_price IS NOT NULL
      AND m.last_yes_price >= ? AND m.last_yes_price <= ?
  `).all(coinFlipMin, coinFlipMax);

  const signals = [];

  for (const market of markets) {
    // Get all latest estimates for this market (one per model)
    const estimates = db.prepare(`
      SELECT me1.*
      FROM model_estimates me1
      INNER JOIN (
        SELECT ticker, model_name, MAX(timestamp) as max_ts
        FROM model_estimates
        WHERE ticker = ?
        GROUP BY ticker, model_name
      ) me2 ON me1.ticker = me2.ticker AND me1.model_name = me2.model_name AND me1.timestamp = me2.max_ts
    `).all(market.ticker);

    for (const est of estimates) {
      if (est.confidence < minConfidence) continue;

      const edge = est.estimated_prob - market.last_yes_price;
      const absEdge = Math.abs(edge);
      const edgePct = absEdge * 100;

      if (edgePct < minEdgePct) continue;

      const side = edge > 0 ? 'yes' : 'no';
      const score = absEdge * est.confidence;

      signals.push({
        ticker: market.ticker,
        eventTicker: market.event_ticker,
        title: market.title,
        category: market.category,
        marketPrice: market.last_yes_price,
        modelProb: est.estimated_prob,
        confidence: est.confidence,
        modelName: est.model_name,
        edge: Math.round(edge * 1000) / 1000,
        absEdge: Math.round(absEdge * 1000) / 1000,
        side,
        score: Math.round(score * 1000) / 1000,
      });
    }
  }

  // Sort by score descending (best signals first)
  signals.sort((a, b) => b.score - a.score);

  return signals;
}

/**
 * Get top N mispricing signals.
 * @param {import('better-sqlite3').Database} db
 * @param {object} opts
 * @param {number} [opts.limit] - Max signals to return
 * @param {number} [opts.minEdgePct]
 * @param {number} [opts.minConfidence]
 * @param {number} [opts.minLiquidity]
 * @param {number} [opts.coinFlipMin]
 * @param {number} [opts.coinFlipMax]
 * @returns {MispricingSignal[]}
 */
export function getTopSignals(db, { limit = 10, minEdgePct = 5, minConfidence = 0.6, minLiquidity = 0, coinFlipMin = 0.30, coinFlipMax = 0.70 } = {}) {
  const all = detectMispricings(db, { minEdgePct, minConfidence, minLiquidity, coinFlipMin, coinFlipMax });
  return all.slice(0, limit);
}
