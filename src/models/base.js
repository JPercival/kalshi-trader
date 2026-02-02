/**
 * Base model interface.
 * All probability models must implement this interface.
 */

/**
 * @typedef {object} ModelEstimate
 * @property {string} ticker - Market ticker
 * @property {number} estimatedProb - Model's P(yes) between 0 and 1
 * @property {number} confidence - Confidence in estimate between 0 and 1
 * @property {string[]} dataSources - Sources used for this estimate
 * @property {string} reasoning - Brief explanation
 */

/**
 * Validate a model estimate object.
 * @param {ModelEstimate} estimate
 * @returns {boolean}
 */
export function validateEstimate(estimate) {
  if (!estimate || typeof estimate !== 'object') return false;
  if (typeof estimate.ticker !== 'string' || !estimate.ticker) return false;
  if (typeof estimate.estimatedProb !== 'number' || estimate.estimatedProb < 0 || estimate.estimatedProb > 1) return false;
  if (typeof estimate.confidence !== 'number' || estimate.confidence < 0 || estimate.confidence > 1) return false;
  if (!Array.isArray(estimate.dataSources)) return false;
  if (typeof estimate.reasoning !== 'string') return false;
  return true;
}

/**
 * Store a model estimate in the database.
 * @param {import('better-sqlite3').Database} db
 * @param {string} modelName
 * @param {ModelEstimate} estimate
 * @returns {{ id: number }}
 */
export function storeEstimate(db, modelName, estimate) {
  const stmt = db.prepare(`
    INSERT INTO model_estimates (ticker, timestamp, model_name, estimated_prob, confidence, data_sources, reasoning)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const info = stmt.run(
    estimate.ticker,
    Date.now(),
    modelName,
    estimate.estimatedProb,
    estimate.confidence,
    JSON.stringify(estimate.dataSources),
    estimate.reasoning,
  );

  return { id: Number(info.lastInsertRowid) };
}

/**
 * Get the latest model estimate for a market.
 * @param {import('better-sqlite3').Database} db
 * @param {string} ticker
 * @param {string} [modelName] - Filter by model name
 * @returns {object|null}
 */
export function getLatestEstimate(db, ticker, modelName) {
  if (modelName) {
    return db.prepare(`
      SELECT * FROM model_estimates
      WHERE ticker = ? AND model_name = ?
      ORDER BY timestamp DESC LIMIT 1
    `).get(ticker, modelName) || null;
  }

  return db.prepare(`
    SELECT * FROM model_estimates
    WHERE ticker = ?
    ORDER BY timestamp DESC LIMIT 1
  `).get(ticker) || null;
}
