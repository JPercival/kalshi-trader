import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase } from '../db.js';
import { openTrade, closeTrade, getOpenTrades, getAllTrades, calculateBankroll, executePaperTrades } from '../paper-trader.js';

describe('openTrade', () => {
  let handle;

  beforeEach(() => {
    handle = createDatabase();
    handle.db.prepare("INSERT INTO markets (ticker, title, category, status, last_yes_price) VALUES (?, ?, ?, ?, ?)").run(
      'MKT-1', 'Test Market', 'weather', 'active', 0.40
    );
  });

  afterEach(() => {
    if (handle) handle.close();
  });

  it('opens a yes-side trade', () => {
    const signal = {
      ticker: 'MKT-1',
      marketPrice: 0.40,
      modelProb: 0.70,
      confidence: 0.85,
      edge: 0.30,
      side: 'yes',
      category: 'weather',
    };

    const result = openTrade(handle.db, signal, { bankroll: 500 });

    expect(result).not.toBeNull();
    expect(result.tradeId).toBeGreaterThan(0);
    expect(result.side).toBe('yes');
    expect(result.contracts).toBeGreaterThan(0);
    expect(result.costBasis).toBeGreaterThan(0);
  });

  it('opens a no-side trade', () => {
    const signal = {
      ticker: 'MKT-1',
      marketPrice: 0.80,
      modelProb: 0.40,
      confidence: 0.85,
      edge: -0.40,
      side: 'no',
      category: 'weather',
    };

    const result = openTrade(handle.db, signal, { bankroll: 500 });

    expect(result).not.toBeNull();
    expect(result.side).toBe('no');
  });

  it('returns null for duplicate position', () => {
    const signal = {
      ticker: 'MKT-1',
      marketPrice: 0.40,
      modelProb: 0.70,
      confidence: 0.85,
      edge: 0.30,
      side: 'yes',
      category: 'weather',
    };

    openTrade(handle.db, signal, { bankroll: 500 });
    const second = openTrade(handle.db, signal, { bankroll: 500 });

    expect(second).toBeNull();
  });

  it('returns null when position sizing gives 0 contracts', () => {
    const signal = {
      ticker: 'MKT-1',
      marketPrice: 0.40,
      modelProb: 0.42, // Tiny edge
      confidence: 0.5,
      edge: 0.02,
      side: 'yes',
      category: 'weather',
    };

    const result = openTrade(handle.db, signal, { bankroll: 5 });
    expect(result).toBeNull();
  });

  it('stores correct data in database', () => {
    const signal = {
      ticker: 'MKT-1',
      marketPrice: 0.40,
      modelProb: 0.70,
      confidence: 0.85,
      edge: 0.30,
      side: 'yes',
      category: 'weather',
    };

    const result = openTrade(handle.db, signal, { bankroll: 500 });
    const row = handle.db.prepare('SELECT * FROM paper_trades WHERE id = ?').get(result.tradeId);

    expect(row.ticker).toBe('MKT-1');
    expect(row.side).toBe('yes');
    expect(row.resolution).toBe('open');
    expect(row.category).toBe('weather');
    expect(row.model_edge).toBe(0.30);
  });
});

describe('closeTrade', () => {
  let handle;

  beforeEach(() => {
    handle = createDatabase();
    handle.db.prepare("INSERT INTO markets (ticker) VALUES (?)").run('MKT-1');
    handle.db.prepare(`
      INSERT INTO paper_trades (ticker, opened_at, side, entry_price, contracts, cost_basis, resolution)
      VALUES (?, ?, ?, ?, ?, ?, 'open')
    `).run('MKT-1', Date.now(), 'yes', 0.40, 10, 4.00);
  });

  afterEach(() => {
    if (handle) handle.close();
  });

  it('closes a trade with profit', () => {
    const result = closeTrade(handle.db, 1, 0.60);

    expect(result).not.toBeNull();
    expect(result.profit).toBe(2.00); // 10 * 0.60 - 4.00
    expect(result.profitPct).toBe(50.00);

    const row = handle.db.prepare('SELECT * FROM paper_trades WHERE id = 1').get();
    expect(row.resolution).toBe('sold');
    expect(row.exit_price).toBe(0.60);
  });

  it('closes a trade with loss', () => {
    const result = closeTrade(handle.db, 1, 0.30);

    expect(result.profit).toBe(-1.00); // 10 * 0.30 - 4.00
    expect(result.profitPct).toBe(-25.00);
  });

  it('returns null for non-existent trade', () => {
    expect(closeTrade(handle.db, 999, 0.50)).toBeNull();
  });

  it('handles trade with zero cost basis', () => {
    const { db } = handle;

    db.prepare(`UPDATE paper_trades SET cost_basis = 0 WHERE id = 1`).run();
    const result = closeTrade(db, 1, 0.50);

    expect(result).not.toBeNull();
    expect(result.profitPct).toBe(0);
  });

  it('returns null for already closed trade', () => {
    closeTrade(handle.db, 1, 0.50);
    expect(closeTrade(handle.db, 1, 0.60)).toBeNull();
  });
});

describe('getOpenTrades', () => {
  let handle;

  beforeEach(() => {
    handle = createDatabase();
    handle.db.prepare("INSERT INTO markets (ticker) VALUES (?)").run('MKT-1');
    handle.db.prepare("INSERT INTO markets (ticker) VALUES (?)").run('MKT-2');
  });

  afterEach(() => {
    if (handle) handle.close();
  });

  it('returns only open trades', () => {
    const { db } = handle;

    db.prepare(`INSERT INTO paper_trades (ticker, opened_at, side, entry_price, contracts, cost_basis, resolution) VALUES (?, ?, ?, ?, ?, ?, ?)`).run('MKT-1', 1000, 'yes', 0.40, 10, 4.0, 'open');
    db.prepare(`INSERT INTO paper_trades (ticker, opened_at, side, entry_price, contracts, cost_basis, resolution) VALUES (?, ?, ?, ?, ?, ?, ?)`).run('MKT-2', 2000, 'no', 0.60, 5, 3.0, 'win');

    const open = getOpenTrades(db);
    expect(open).toHaveLength(1);
    expect(open[0].ticker).toBe('MKT-1');
  });

  it('returns empty array when no open trades', () => {
    expect(getOpenTrades(handle.db)).toEqual([]);
  });
});

describe('getAllTrades', () => {
  let handle;

  beforeEach(() => {
    handle = createDatabase();
    handle.db.prepare("INSERT INTO markets (ticker) VALUES (?)").run('MKT-1');
  });

  afterEach(() => {
    if (handle) handle.close();
  });

  it('returns all trades with limit', () => {
    const { db } = handle;

    for (let i = 0; i < 5; i++) {
      db.prepare(`INSERT INTO paper_trades (ticker, opened_at, side, entry_price, contracts, cost_basis, resolution) VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run('MKT-1', i * 1000, 'yes', 0.40, 10, 4.0, i < 3 ? 'open' : 'win');
    }

    const all = getAllTrades(db, { limit: 3 });
    expect(all).toHaveLength(3);
  });

  it('uses default limit', () => {
    const trades = getAllTrades(handle.db);
    expect(trades).toEqual([]);
  });
});

describe('calculateBankroll', () => {
  let handle;

  beforeEach(() => {
    handle = createDatabase();
    handle.db.prepare("INSERT INTO markets (ticker) VALUES (?)").run('MKT-1');
    handle.db.prepare("INSERT INTO markets (ticker) VALUES (?)").run('MKT-2');
  });

  afterEach(() => {
    if (handle) handle.close();
  });

  it('returns full bankroll when no trades', () => {
    const result = calculateBankroll(handle.db, 500);
    expect(result.available).toBe(500);
    expect(result.invested).toBe(0);
    expect(result.realizedPnl).toBe(0);
    expect(result.totalValue).toBe(500);
  });

  it('subtracts open positions from available', () => {
    const { db } = handle;

    db.prepare(`INSERT INTO paper_trades (ticker, opened_at, side, entry_price, contracts, cost_basis, resolution) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run('MKT-1', 1000, 'yes', 0.40, 25, 10.0, 'open');

    const result = calculateBankroll(db, 500);
    expect(result.available).toBe(490);
    expect(result.invested).toBe(10);
    expect(result.totalValue).toBe(500);
  });

  it('adds realized P&L to available', () => {
    const { db } = handle;

    db.prepare(`INSERT INTO paper_trades (ticker, opened_at, side, entry_price, contracts, cost_basis, profit, resolution) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run('MKT-1', 1000, 'yes', 0.40, 25, 10.0, 5.0, 'win');
    db.prepare(`INSERT INTO paper_trades (ticker, opened_at, side, entry_price, contracts, cost_basis, profit, resolution) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run('MKT-2', 2000, 'no', 0.30, 10, 3.0, -2.0, 'loss');

    const result = calculateBankroll(db, 500);
    expect(result.available).toBe(503); // 500 + 5 - 2
    expect(result.realizedPnl).toBe(3);
  });
});

describe('executePaperTrades', () => {
  let handle;

  beforeEach(() => {
    handle = createDatabase();
    for (let i = 0; i < 5; i++) {
      handle.db.prepare("INSERT INTO markets (ticker, title, category, status, last_yes_price) VALUES (?, ?, ?, ?, ?)")
        .run(`SIG-${i}`, `Market ${i}`, 'weather', 'active', 0.40);
    }
  });

  afterEach(() => {
    if (handle) handle.close();
  });

  it('opens trades for multiple signals', () => {
    const signals = [
      { ticker: 'SIG-0', marketPrice: 0.40, modelProb: 0.70, confidence: 0.85, edge: 0.30, side: 'yes', category: 'weather', score: 0.255 },
      { ticker: 'SIG-1', marketPrice: 0.40, modelProb: 0.65, confidence: 0.8, edge: 0.25, side: 'yes', category: 'weather', score: 0.2 },
    ];

    const result = executePaperTrades(handle.db, signals, { startingBankroll: 500 });
    expect(result.opened).toBe(2);
    expect(result.skipped).toBe(0);
  });

  it('skips signals when bankroll runs out', () => {
    const signals = Array.from({ length: 5 }, (_, i) => ({
      ticker: `SIG-${i}`,
      marketPrice: 0.40,
      modelProb: 0.70,
      confidence: 0.85,
      edge: 0.30,
      side: 'yes',
      category: 'weather',
      score: 0.255,
    }));

    // Very small bankroll — will run out
    const result = executePaperTrades(handle.db, signals, { startingBankroll: 5 });
    expect(result.opened + result.skipped).toBe(5);
  });

  it('skips duplicate tickers', () => {
    const signals = [
      { ticker: 'SIG-0', marketPrice: 0.40, modelProb: 0.70, confidence: 0.85, edge: 0.30, side: 'yes', category: 'weather', score: 0.255 },
      { ticker: 'SIG-0', marketPrice: 0.40, modelProb: 0.70, confidence: 0.85, edge: 0.30, side: 'yes', category: 'weather', score: 0.255 },
    ];

    const result = executePaperTrades(handle.db, signals, { startingBankroll: 500 });
    expect(result.opened).toBe(1);
    expect(result.skipped).toBe(1);
  });

  it('stops when bankroll is depleted', () => {
    const { db } = handle;

    // Pre-invest nearly all bankroll
    db.prepare("INSERT INTO markets (ticker) VALUES (?)").run('INVESTED');
    db.prepare(`INSERT INTO paper_trades (ticker, opened_at, side, entry_price, contracts, cost_basis, resolution) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run('INVESTED', 1000, 'yes', 0.40, 1000, 400.0, 'open');

    // Only $0.01 available (bankroll $400.01 minus $400 invested)
    const signals = [
      { ticker: 'SIG-0', marketPrice: 0.40, modelProb: 0.70, confidence: 0.85, edge: 0.30, side: 'yes', category: 'weather', score: 0.255 },
      { ticker: 'SIG-1', marketPrice: 0.40, modelProb: 0.70, confidence: 0.85, edge: 0.30, side: 'yes', category: 'weather', score: 0.255 },
    ];

    const result = executePaperTrades(db, signals, { startingBankroll: 400 });
    // All signals should be skipped because available is ≈ 0 or negative
    expect(result.skipped).toBe(2);
    expect(result.opened).toBe(0);
  });

  it('handles empty signals array', () => {
    const result = executePaperTrades(handle.db, [], { startingBankroll: 500 });
    expect(result.opened).toBe(0);
    expect(result.skipped).toBe(0);
  });
});
