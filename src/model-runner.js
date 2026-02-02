/**
 * Model runner — orchestrates running all registered models against applicable markets.
 */

import { validateEstimate, storeEstimate } from './models/base.js';

/**
 * @typedef {object} Model
 * @property {string} name - Model identifier
 * @property {string[]} categories - Market categories this model handles
 * @property {(market: object, config: object) => Promise<import('./models/base.js').ModelEstimate|null>} estimate
 */

/**
 * Create a model runner that manages and executes probability models.
 * @param {object} opts
 * @param {import('better-sqlite3').Database} opts.db
 * @param {object} opts.config
 * @returns {{ register: Function, run: Function, getModels: Function }}
 */
export function createModelRunner({ db, config }) {
  /** @type {Model[]} */
  const models = [];

  /**
   * Register a model with the runner.
   * @param {Model} model
   */
  function register(model) {
    models.push(model);
  }

  /**
   * Get all registered models.
   * @returns {Model[]}
   */
  function getModels() {
    return [...models];
  }

  /**
   * Run all applicable models against active markets.
   * @returns {Promise<{ estimates: number, errors: number }>}
   */
  async function run() {
    const markets = db.prepare(
      "SELECT * FROM markets WHERE status = 'active'"
    ).all();

    let estimates = 0;
    let errors = 0;

    for (const market of markets) {
      for (const model of models) {
        // Skip models that don't handle this category
        if (model.categories.length > 0 && !model.categories.includes(market.category)) {
          continue;
        }

        try {
          const estimate = await model.estimate(market, config);
          if (estimate && validateEstimate(estimate)) {
            storeEstimate(db, model.name, estimate);
            estimates++;
          }
        } catch (err) {
          errors++;
          console.error(`[model-runner] Error running ${model.name} on ${market.ticker}:`, err.message);
        }
      }
    }

    return { estimates, errors };
  }

  return { register, run, getModels };
}
