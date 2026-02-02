/**
 * Position sizing using Kelly Criterion (Quarter-Kelly).
 *
 * Full Kelly: f* = (p * b - q) / b
 * Quarter Kelly: f = f* / 4
 *
 * Where:
 *   p = model's estimated probability
 *   q = 1 - p
 *   b = net odds (payout/cost - 1)
 */

/**
 * Calculate full Kelly fraction for a binary contract.
 * @param {number} modelProb - Model's estimated P(yes) or P(winning side)
 * @param {number} entryPrice - Cost per contract (0-1)
 * @returns {number} Full Kelly fraction (can be negative if no edge)
 */
export function kellyFraction(modelProb, entryPrice) {
  if (entryPrice <= 0 || entryPrice >= 1) return 0;
  if (modelProb <= 0 || modelProb >= 1) return 0;

  const payout = 1.0;
  const cost = entryPrice;
  const b = (payout - cost) / cost; // net odds
  const p = modelProb;
  const q = 1 - p;

  const f = (p * b - q) / b;
  return f;
}

/**
 * Calculate position size for a mispricing signal.
 * Uses Quarter-Kelly with bankroll and position caps.
 * @param {object} opts
 * @param {number} opts.modelProb - Model's P(winning side)
 * @param {number} opts.entryPrice - Market price for the side we're buying
 * @param {number} opts.bankroll - Current paper bankroll
 * @param {number} [opts.kellyMultiplier] - Kelly fraction (default 0.25 = quarter-Kelly)
 * @param {number} [opts.maxPositionPct] - Max % of bankroll per trade (default 5)
 * @returns {{ contracts: number, costBasis: number, kellyFull: number, kellyAdjusted: number, fraction: number }}
 */
export function sizePosition({ modelProb, entryPrice, bankroll, kellyMultiplier = 0.25, maxPositionPct = 5 }) {
  const kellyFull = kellyFraction(modelProb, entryPrice);

  // No bet if Kelly says no edge
  if (kellyFull <= 0) {
    return { contracts: 0, costBasis: 0, kellyFull, kellyAdjusted: 0, fraction: 0 };
  }

  const kellyAdjusted = kellyFull * kellyMultiplier;
  const maxFraction = maxPositionPct / 100;

  // Apply position cap
  const fraction = Math.min(kellyAdjusted, maxFraction);

  // Calculate dollar amount and contracts
  const dollarAmount = bankroll * fraction;
  const contracts = Math.floor(dollarAmount / entryPrice);

  // No trade if we can't afford at least 1 contract
  if (contracts <= 0) {
    return { contracts: 0, costBasis: 0, kellyFull, kellyAdjusted, fraction };
  }

  const costBasis = contracts * entryPrice;

  return {
    contracts,
    costBasis: Math.round(costBasis * 100) / 100,
    kellyFull: Math.round(kellyFull * 10000) / 10000,
    kellyAdjusted: Math.round(kellyAdjusted * 10000) / 10000,
    fraction: Math.round(fraction * 10000) / 10000,
  };
}

/**
 * Size a position from a mispricing signal.
 * Determines the correct entry price based on the signal's side.
 * @param {import('./mispricing.js').MispricingSignal} signal
 * @param {object} opts
 * @param {number} opts.bankroll
 * @param {number} [opts.kellyMultiplier]
 * @param {number} [opts.maxPositionPct]
 * @returns {ReturnType<typeof sizePosition> & { side: string, entryPrice: number }}
 */
export function sizeFromSignal(signal, { bankroll, kellyMultiplier = 0.25, maxPositionPct = 5 }) {
  let entryPrice;
  let modelProb;

  if (signal.side === 'yes') {
    entryPrice = signal.marketPrice;
    modelProb = signal.modelProb;
  } else {
    // Buying "no" means paying (1 - yesPrice) and model says P(no) = 1 - modelProb
    entryPrice = 1 - signal.marketPrice;
    modelProb = 1 - signal.modelProb;
  }

  const sizing = sizePosition({ modelProb, entryPrice, bankroll, kellyMultiplier, maxPositionPct });

  return {
    ...sizing,
    side: signal.side,
    entryPrice: Math.round(entryPrice * 100) / 100,
  };
}
