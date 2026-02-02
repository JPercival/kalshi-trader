/**
 * Paper trade execution engine.
 * Opens and manages simulated positions based on mispricing signals.
 */

import { sizeFromSignal } from './position-sizer.js';

/**
 * Open a paper trade for a mispricing signal.
 * @param {import('better-sqlite3').Database} db
 * @param {import('./mispricing.js').MispricingSignal} signal
 * @param {object} opts
 * @param {number} opts.bankroll - Current bankroll
 * @param {number} [opts.kellyMultiplier]
 * @param {number} [opts.maxPositionPct]
 * @returns {{ tradeId: number, contracts: number, costBasis: number, side: string } | null}
 */
export function openTrade(db, signal, { bankroll, kellyMultiplier = 0.25, maxPositionPct = 5 }) {
  // Check if we already have an open position on this market
  const existing = db.prepare(
    "SELECT id FROM paper_trades WHERE ticker = ? AND resolution = 'open'"
  ).get(signal.ticker);

  if (existing) return null;

  const sizing = sizeFromSignal(signal, { bankroll, kellyMultiplier, maxPositionPct });

  if (sizing.contracts <= 0) return null;

  const stmt = db.prepare(`
    INSERT INTO paper_trades (ticker, opened_at, side, entry_price, contracts, cost_basis, model_edge, category, resolution)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open')
  `);

  const info = stmt.run(
    signal.ticker,
    Date.now(),
    sizing.side,
    sizing.entryPrice,
    sizing.contracts,
    sizing.costBasis,
    signal.edge,
    signal.category,
  );

  return {
    tradeId: Number(info.lastInsertRowid),
    contracts: sizing.contracts,
    costBasis: sizing.costBasis,
    side: sizing.side,
  };
}

/**
 * Close (sell) an open paper trade at a given price.
 * @param {import('better-sqlite3').Database} db
 * @param {number} tradeId
 * @param {number} exitPrice - Price per contract at exit
 * @returns {{ profit: number, profitPct: number } | null}
 */
export function closeTrade(db, tradeId, exitPrice) {
  const trade = db.prepare("SELECT * FROM paper_trades WHERE id = ? AND resolution = 'open'").get(tradeId);
  if (!trade) return null;

  const revenue = trade.contracts * exitPrice;
  const profit = revenue - trade.cost_basis;
  const profitPct = trade.cost_basis > 0 ? (profit / trade.cost_basis) * 100 : 0;

  db.prepare(`
    UPDATE paper_trades
    SET closed_at = ?, exit_price = ?, revenue = ?, profit = ?, profit_pct = ?, resolution = 'sold'
    WHERE id = ?
  `).run(Date.now(), exitPrice, revenue, profit, profitPct, tradeId);

  return {
    profit: Math.round(profit * 100) / 100,
    profitPct: Math.round(profitPct * 100) / 100,
  };
}

/**
 * Get all open paper trades.
 * @param {import('better-sqlite3').Database} db
 * @returns {object[]}
 */
export function getOpenTrades(db) {
  return db.prepare("SELECT * FROM paper_trades WHERE resolution = 'open' ORDER BY opened_at DESC").all();
}

/**
 * Get all paper trades (open and closed/resolved).
 * @param {import('better-sqlite3').Database} db
 * @param {object} [opts]
 * @param {number} [opts.limit]
 * @returns {object[]}
 */
export function getAllTrades(db, { limit = 100 } = {}) {
  return db.prepare("SELECT * FROM paper_trades ORDER BY opened_at DESC LIMIT ?").all(limit);
}

/**
 * Calculate current bankroll (starting bankroll minus open positions plus realized P&L).
 * @param {import('better-sqlite3').Database} db
 * @param {number} startingBankroll
 * @returns {{ available: number, invested: number, realizedPnl: number, totalValue: number }}
 */
export function calculateBankroll(db, startingBankroll) {
  const openCost = db.prepare(
    "SELECT COALESCE(SUM(cost_basis), 0) as total FROM paper_trades WHERE resolution = 'open'"
  ).get().total;

  const realizedPnl = db.prepare(
    "SELECT COALESCE(SUM(profit), 0) as total FROM paper_trades WHERE resolution IN ('win', 'loss', 'sold')"
  ).get().total;

  const available = startingBankroll - openCost + realizedPnl;
  const totalValue = available + openCost;

  return {
    available: Math.round(available * 100) / 100,
    invested: Math.round(openCost * 100) / 100,
    realizedPnl: Math.round(realizedPnl * 100) / 100,
    totalValue: Math.round(totalValue * 100) / 100,
  };
}

/**
 * Execute paper trades for all qualifying mispricing signals.
 * @param {import('better-sqlite3').Database} db
 * @param {import('./mispricing.js').MispricingSignal[]} signals
 * @param {object} opts
 * @param {number} opts.startingBankroll
 * @param {number} [opts.kellyMultiplier]
 * @param {number} [opts.maxPositionPct]
 * @returns {{ opened: number, skipped: number }}
 */
export function executePaperTrades(db, signals, { startingBankroll, kellyMultiplier = 0.25, maxPositionPct = 5 }) {
  let opened = 0;
  let skipped = 0;

  for (const signal of signals) {
    const { available } = calculateBankroll(db, startingBankroll);

    if (available <= 0) {
      skipped += signals.length - opened - skipped;
      break;
    }

    const result = openTrade(db, signal, {
      bankroll: available,
      kellyMultiplier,
      maxPositionPct,
    });

    if (result) {
      opened++;
    } else {
      skipped++;
    }
  }

  return { opened, skipped };
}
