/**
 * Fed rates probability model.
 * Estimates probabilities for Fed rate decision markets using FRED fed funds data
 * and CME FedWatch-style implied probability analysis.
 */

/**
 * Patterns to detect Fed rate decision markets.
 * @type {Array<[RegExp, string]>}
 */
const FED_PATTERNS = [
  [/\b(cut|reduction|decrease|lower)\s*(rate|interest)?s?\b|\brate\s*(cut|reduction|decrease|lower)/i, 'cut'],
  [/\b(hike|increase|raise|higher)\s*(rate|interest)?s?\b|\brate\s*(hike|increase|raise|higher)/i, 'hike'],
  [/hold|unchanged|maintain|pause|no\s+change/i, 'hold'],
];

/**
 * Parse a Fed rates market title to determine the expected action.
 * @param {string} title
 * @returns {{ action: string, basisPoints: number|null } | null}
 */
export function parseFedMarket(title) {
  if (!title) return null;

  // Must be about the Fed
  if (!/fed|fomc|federal\s+reserve|interest\s+rate/i.test(title)) return null;

  let action = null;
  for (const [pattern, act] of FED_PATTERNS) {
    if (pattern.test(title)) {
      action = act;
      break;
    }
  }

  if (!action) return null;

  // Try to extract basis points or percentage
  let basisPoints = null;
  const bpMatch = title.match(/(\d+)\s*(?:bp|basis\s*point)/i);
  if (bpMatch) {
    basisPoints = parseInt(bpMatch[1], 10);
  } else {
    const pctMatch = title.match(/(\d+\.?\d*)\s*%/);
    if (pctMatch) {
      basisPoints = Math.round(parseFloat(pctMatch[1]) * 100);
    }
  }

  return { action, basisPoints };
}

/**
 * Estimate Fed rate decision probability based on recent FRED fed funds data.
 * @param {object} opts
 * @param {string} opts.action - 'cut', 'hike', or 'hold'
 * @param {number|null} opts.basisPoints - Expected move size in basis points
 * @param {number} opts.currentRate - Current fed funds rate
 * @param {number[]} opts.recentRates - Recent fed funds rates (newest first)
 * @returns {{ prob: number, confidence: number }}
 */
export function estimateFedProbability({ action, basisPoints, currentRate, recentRates }) {
  if (!recentRates.length) {
    return { prob: 0.5, confidence: 0.3 };
  }

  // Analyze trend: are rates going up, down, or flat?
  const rateChanges = [];
  for (let i = 0; i < recentRates.length - 1; i++) {
    rateChanges.push(recentRates[i] - recentRates[i + 1]);
  }

  const avgChange = rateChanges.length
    ? rateChanges.reduce((s, c) => s + c, 0) / rateChanges.length
    : 0;

  let prob;

  if (action === 'cut') {
    // Higher probability if recent trend is downward
    if (avgChange < -0.01) {
      prob = 0.65 + Math.min(0.25, Math.abs(avgChange) * 10);
    } else if (avgChange < 0.01) {
      prob = 0.35;
    } else {
      prob = 0.15;
    }
  } else if (action === 'hike') {
    // Higher probability if recent trend is upward
    if (avgChange > 0.01) {
      prob = 0.65 + Math.min(0.25, avgChange * 10);
    } else if (avgChange > -0.01) {
      prob = 0.35;
    } else {
      prob = 0.15;
    }
  } else {
    // hold — higher probability when rates are stable
    const volatility = rateChanges.length
      ? Math.sqrt(rateChanges.reduce((s, c) => s + c * c, 0) / rateChanges.length)
      : 0;

    if (volatility < 0.01) {
      prob = 0.7;
    } else if (volatility < 0.05) {
      prob = 0.5;
    } else {
      prob = 0.3;
    }
  }

  // Adjust for basis points if specified
  if (basisPoints !== null && action !== 'hold') {
    // Larger moves are less likely
    const stdMove = 25; // standard 25bp move
    const ratio = basisPoints / stdMove;
    if (ratio > 1) {
      prob *= Math.max(0.3, 1 / ratio);
    }
  }

  const confidence = Math.min(0.75, 0.4 + recentRates.length * 0.03);

  return {
    prob: Math.round(Math.min(0.95, Math.max(0.05, prob)) * 1000) / 1000,
    confidence: Math.round(confidence * 100) / 100,
  };
}

/**
 * Create the Fed rates model for the model runner.
 * @param {object} opts
 * @param {string} opts.apiKey - FRED API key (for fed funds rate data)
 * @param {typeof globalThis.fetch} [opts.fetch]
 * @returns {import('../model-runner.js').Model}
 */
export function createFedRatesModel({ apiKey, fetch: fetchFn = globalThis.fetch }) {
  return {
    name: 'fed_rates',
    categories: ['fed_rates'],

    async estimate(market) {
      if (!apiKey) return null;

      const parsed = parseFedMarket(market.title);
      if (!parsed) return null;

      // Fetch recent fed funds rate from FRED
      const { fetchFREDData } = await import('./economics.js');
      const observations = await fetchFREDData('FEDFUNDS', apiKey, { limit: 12, fetch: fetchFn });

      if (!observations.length) return null;

      const currentRate = observations[0].value;
      const recentRates = observations.map(o => o.value);

      const { prob, confidence } = estimateFedProbability({
        action: parsed.action,
        basisPoints: parsed.basisPoints,
        currentRate,
        recentRates,
      });

      return {
        ticker: market.ticker,
        estimatedProb: prob,
        confidence,
        dataSources: ['FRED:FEDFUNDS'],
        reasoning: `Fed ${parsed.action}${parsed.basisPoints ? ` ${parsed.basisPoints}bp` : ''}, current rate=${currentRate}%, trend from ${observations.length} months`,
      };
    },
  };
}
