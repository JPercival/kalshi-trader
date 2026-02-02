import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase } from '../db.js';
import { resolveSettledTrades, getPerformanceStats, updateDailyStats, findBestCategory } from '../resolution.js';

describe('resolveSettledTrades', () => {
  let handle;

  beforeEach(() => {
    handle = createDatabase();
  });

  afterEach(() => {
    if (handle) handle.close();
  });

  it('resolves winning yes-side trade', () => {
    const { db } = handle;

    db.prepare("INSERT INTO markets (ticker, result) VALUES (?, ?)").run('MKT-W', 'yes');
    db.prepare(`INSERT INTO paper_trades (ticker, opened_at, side, entry_price, contracts, cost_basis, resolution) VALUES (?, ?, ?, ?, ?, ?, 'open')`)
      .run('MKT-W', 1000, 'yes', 0.40, 10, 4.0);

    const result = resolveSettledTrades(db);

    expect(result.resolved).toBe(1);
    expect(result.wins).toBe(1);
    expect(result.losses).toBe(0);
    expect(result.totalProfit).toBe(6.0); // 10 * 1.0 - 4.0

    const trade = db.prepare('SELECT * FROM paper_trades WHERE id = 1').get();
    expect(trade.resolution).toBe('win');
    expect(trade.exit_price).toBe(1.0);
  });

  it('resolves losing yes-side trade', () => {
    const { db } = handle;

    db.prepare("INSERT INTO markets (ticker, result) VALUES (?, ?)").run('MKT-L', 'no');
    db.prepare(`INSERT INTO paper_trades (ticker, opened_at, side, entry_price, contracts, cost_basis, resolution) VALUES (?, ?, ?, ?, ?, ?, 'open')`)
      .run('MKT-L', 1000, 'yes', 0.40, 10, 4.0);

    const result = resolveSettledTrades(db);

    expect(result.resolved).toBe(1);
    expect(result.wins).toBe(0);
    expect(result.losses).toBe(1);
    expect(result.totalProfit).toBe(-4.0);
  });

  it('resolves winning no-side trade', () => {
    const { db } = handle;

    db.prepare("INSERT INTO markets (ticker, result) VALUES (?, ?)").run('MKT-N', 'no');
    db.prepare(`INSERT INTO paper_trades (ticker, opened_at, side, entry_price, contracts, cost_basis, resolution) VALUES (?, ?, ?, ?, ?, ?, 'open')`)
      .run('MKT-N', 1000, 'no', 0.30, 10, 3.0);

    const result = resolveSettledTrades(db);

    expect(result.wins).toBe(1);
    expect(result.totalProfit).toBe(7.0); // 10 * 1.0 - 3.0
  });

  it('handles trades with zero cost basis', () => {
    const { db } = handle;

    db.prepare("INSERT INTO markets (ticker, result) VALUES (?, ?)").run('MKT-Z', 'yes');
    db.prepare(`INSERT INTO paper_trades (ticker, opened_at, side, entry_price, contracts, cost_basis, resolution) VALUES (?, ?, ?, ?, ?, ?, 'open')`)
      .run('MKT-Z', 1000, 'yes', 0.0, 10, 0.0);

    const result = resolveSettledTrades(db);

    expect(result.resolved).toBe(1);
    const trade = db.prepare('SELECT * FROM paper_trades WHERE id = 1').get();
    expect(trade.profit_pct).toBe(0);
  });

  it('resolves multiple trades', () => {
    const { db } = handle;

    db.prepare("INSERT INTO markets (ticker, result) VALUES (?, ?)").run('MKT-A', 'yes');
    db.prepare("INSERT INTO markets (ticker, result) VALUES (?, ?)").run('MKT-B', 'no');

    db.prepare(`INSERT INTO paper_trades (ticker, opened_at, side, entry_price, contracts, cost_basis, resolution) VALUES (?, ?, ?, ?, ?, ?, 'open')`)
      .run('MKT-A', 1000, 'yes', 0.50, 10, 5.0);
    db.prepare(`INSERT INTO paper_trades (ticker, opened_at, side, entry_price, contracts, cost_basis, resolution) VALUES (?, ?, ?, ?, ?, ?, 'open')`)
      .run('MKT-B', 1000, 'yes', 0.60, 5, 3.0);

    const result = resolveSettledTrades(db);

    expect(result.resolved).toBe(2);
    expect(result.wins).toBe(1);
    expect(result.losses).toBe(1);
  });

  it('ignores already resolved trades', () => {
    const { db } = handle;

    db.prepare("INSERT INTO markets (ticker, result) VALUES (?, ?)").run('MKT-R', 'yes');
    db.prepare(`INSERT INTO paper_trades (ticker, opened_at, side, entry_price, contracts, cost_basis, resolution) VALUES (?, ?, ?, ?, ?, ?, 'win')`)
      .run('MKT-R', 1000, 'yes', 0.40, 10, 4.0);

    const result = resolveSettledTrades(db);
    expect(result.resolved).toBe(0);
  });

  it('ignores trades for unsettled markets', () => {
    const { db } = handle;

    db.prepare("INSERT INTO markets (ticker, result) VALUES (?, ?)").run('MKT-U', null);
    db.prepare(`INSERT INTO paper_trades (ticker, opened_at, side, entry_price, contracts, cost_basis, resolution) VALUES (?, ?, ?, ?, ?, ?, 'open')`)
      .run('MKT-U', 1000, 'yes', 0.40, 10, 4.0);

    const result = resolveSettledTrades(db);
    expect(result.resolved).toBe(0);
  });

  it('returns zeros when no trades exist', () => {
    const result = resolveSettledTrades(handle.db);
    expect(result).toEqual({ resolved: 0, wins: 0, losses: 0, totalProfit: 0 });
  });
});

describe('getPerformanceStats', () => {
  let handle;

  beforeEach(() => {
    handle = createDatabase();
  });

  afterEach(() => {
    if (handle) handle.close();
  });

  it('returns zeros when no trades', () => {
    const stats = getPerformanceStats(handle.db);

    expect(stats.totalTrades).toBe(0);
    expect(stats.winRate).toBe(0);
    expect(stats.totalPnl).toBe(0);
    expect(stats.byCategory).toEqual({});
  });

  it('calculates stats from resolved trades', () => {
    const { db } = handle;

    db.prepare("INSERT INTO markets (ticker) VALUES (?)").run('MKT-1');
    db.prepare("INSERT INTO markets (ticker) VALUES (?)").run('MKT-2');
    db.prepare("INSERT INTO markets (ticker) VALUES (?)").run('MKT-3');

    db.prepare(`INSERT INTO paper_trades (ticker, opened_at, side, entry_price, contracts, cost_basis, profit, model_edge, category, resolution) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run('MKT-1', 1000, 'yes', 0.40, 10, 4.0, 6.0, 0.30, 'weather', 'win');
    db.prepare(`INSERT INTO paper_trades (ticker, opened_at, side, entry_price, contracts, cost_basis, profit, model_edge, category, resolution) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run('MKT-2', 2000, 'yes', 0.60, 5, 3.0, -3.0, 0.10, 'weather', 'loss');
    db.prepare(`INSERT INTO paper_trades (ticker, opened_at, side, entry_price, contracts, cost_basis, model_edge, category, resolution) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run('MKT-3', 3000, 'no', 0.30, 8, 2.4, 0.20, 'economics', 'open');

    const stats = getPerformanceStats(db);

    expect(stats.totalTrades).toBe(3);
    expect(stats.openTrades).toBe(1);
    expect(stats.resolvedTrades).toBe(2);
    expect(stats.wins).toBe(1);
    expect(stats.losses).toBe(1);
    expect(stats.winRate).toBe(50);
    expect(stats.totalPnl).toBe(3.0);
    expect(stats.byCategory.weather).toBeDefined();
    expect(stats.byCategory.weather.total).toBe(2);
    expect(stats.byCategory.economics).toBeDefined();
  });

  it('computes per-category win rate', () => {
    const { db } = handle;

    db.prepare("INSERT INTO markets (ticker) VALUES (?)").run('W1');
    db.prepare("INSERT INTO markets (ticker) VALUES (?)").run('W2');

    db.prepare(`INSERT INTO paper_trades (ticker, opened_at, side, entry_price, contracts, cost_basis, profit, model_edge, category, resolution) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run('W1', 1000, 'yes', 0.40, 10, 4.0, 6.0, 0.3, 'weather', 'win');
    db.prepare(`INSERT INTO paper_trades (ticker, opened_at, side, entry_price, contracts, cost_basis, profit, model_edge, category, resolution) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run('W2', 2000, 'yes', 0.40, 10, 4.0, 6.0, 0.2, 'weather', 'win');

    const stats = getPerformanceStats(db);
    expect(stats.byCategory.weather.winRate).toBe(100);
  });
});

describe('findBestCategory', () => {
  it('returns category with highest PnL', () => {
    const result = findBestCategory({
      weather: { pnl: 10 },
      economics: { pnl: 25 },
      politics: { pnl: -5 },
    });
    expect(result).toBe('economics');
  });

  it('returns null for empty categories', () => {
    expect(findBestCategory({})).toBeNull();
  });
});

describe('updateDailyStats', () => {
  let handle;

  beforeEach(() => {
    handle = createDatabase();
  });

  afterEach(() => {
    if (handle) handle.close();
  });

  it('creates daily stats record', () => {
    const { db } = handle;

    db.prepare("INSERT INTO markets (ticker, status) VALUES (?, ?)").run('MKT-1', 'active');
    db.prepare("INSERT INTO markets (ticker, status) VALUES (?, ?)").run('MKT-2', 'active');

    const result = updateDailyStats(db, '2026-02-01');

    expect(result.date).toBe('2026-02-01');
    expect(result.marketsTracked).toBe(2);

    const row = db.prepare("SELECT * FROM daily_stats WHERE date = '2026-02-01'").get();
    expect(row).toBeDefined();
    expect(row.markets_tracked).toBe(2);
  });

  it('updates existing daily stats on conflict', () => {
    const { db } = handle;

    db.prepare("INSERT INTO markets (ticker, status) VALUES (?, ?)").run('MKT-1', 'active');

    updateDailyStats(db, '2026-02-01');
    db.prepare("INSERT INTO markets (ticker, status) VALUES (?, ?)").run('MKT-2', 'active');
    updateDailyStats(db, '2026-02-01');

    const rows = db.prepare("SELECT * FROM daily_stats WHERE date = '2026-02-01'").all();
    expect(rows).toHaveLength(1);
    expect(rows[0].markets_tracked).toBe(2);
  });

  it('defaults to today when no date provided', () => {
    const result = updateDailyStats(handle.db);
    const today = new Date().toISOString().split('T')[0];
    expect(result.date).toBe(today);
  });
});
