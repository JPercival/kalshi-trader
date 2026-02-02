/**
 * Resolution tracker.
 * Monitors settled markets and resolves open paper trades accordingly.
 * Updates daily stats with performance metrics.
 */

/**
 * Resolve open paper trades for markets that have settled.
 * @param {import('better-sqlite3').Database} db
 * @returns {{ resolved: number, wins: number, losses: number, totalProfit: number }}
 */
export function resolveSettledTrades(db) {
  // Find open trades where the market has settled
  const openTrades = db.prepare(`
    SELECT pt.*, m.result
    FROM paper_trades pt
    JOIN markets m ON pt.ticker = m.ticker
    WHERE pt.resolution = 'open' AND m.result IS NOT NULL AND m.result != ''
  `).all();

  let resolved = 0;
  let wins = 0;
  let losses = 0;
  let totalProfit = 0;

  const updateStmt = db.prepare(`
    UPDATE paper_trades
    SET closed_at = ?, exit_price = ?, revenue = ?, profit = ?, profit_pct = ?, resolution = ?
    WHERE id = ?
  `);

  const runAll = db.transaction((trades) => {
    for (const trade of trades) {
      const marketResult = trade.result; // 'yes' or 'no'
      const tradeSide = trade.side;

      // Determine payout: $1 if you bought the winning side, $0 otherwise
      const won = (tradeSide === marketResult);
      const exitPrice = won ? 1.0 : 0.0;
      const revenue = trade.contracts * exitPrice;
      const profit = revenue - trade.cost_basis;
      const profitPct = trade.cost_basis > 0 ? (profit / trade.cost_basis) * 100 : 0;
      const resolution = won ? 'win' : 'loss';

      updateStmt.run(
        Date.now(),
        exitPrice,
        revenue,
        profit,
        profitPct,
        resolution,
        trade.id,
      );

      resolved++;
      if (won) wins++;
      else losses++;
      totalProfit += profit;
    }
  });

  runAll(openTrades);

  return {
    resolved,
    wins,
    losses,
    totalProfit: Math.round(totalProfit * 100) / 100,
  };
}

/**
 * Calculate performance statistics.
 * @param {import('better-sqlite3').Database} db
 * @returns {{ totalTrades: number, openTrades: number, resolvedTrades: number, wins: number, losses: number, winRate: number, totalPnl: number, avgEdge: number, byCategory: Record<string, object> }}
 */
export function getPerformanceStats(db) {
  const total = db.prepare('SELECT COUNT(*) as cnt FROM paper_trades').get().cnt;
  const open = db.prepare("SELECT COUNT(*) as cnt FROM paper_trades WHERE resolution = 'open'").get().cnt;
  const resolved = db.prepare("SELECT COUNT(*) as cnt FROM paper_trades WHERE resolution IN ('win', 'loss')").get().cnt;
  const winsCount = db.prepare("SELECT COUNT(*) as cnt FROM paper_trades WHERE resolution = 'win'").get().cnt;
  const lossesCount = db.prepare("SELECT COUNT(*) as cnt FROM paper_trades WHERE resolution = 'loss'").get().cnt;

  const pnlRow = db.prepare(
    "SELECT COALESCE(SUM(profit), 0) as total FROM paper_trades WHERE resolution IN ('win', 'loss', 'sold')"
  ).get();

  const edgeRow = db.prepare(
    "SELECT COALESCE(AVG(model_edge), 0) as avg FROM paper_trades"
  ).get();

  const winRate = resolved > 0 ? (winsCount / resolved) * 100 : 0;

  // Per-category breakdown
  const categories = db.prepare(`
    SELECT category,
      COUNT(*) as total,
      SUM(CASE WHEN resolution = 'win' THEN 1 ELSE 0 END) as wins,
      SUM(CASE WHEN resolution = 'loss' THEN 1 ELSE 0 END) as losses,
      COALESCE(SUM(profit), 0) as pnl,
      COALESCE(AVG(model_edge), 0) as avg_edge
    FROM paper_trades
    WHERE category IS NOT NULL
    GROUP BY category
  `).all();

  const byCategory = {};
  for (const cat of categories) {
    const catResolved = cat.wins + cat.losses;
    byCategory[cat.category] = {
      total: cat.total,
      wins: cat.wins,
      losses: cat.losses,
      pnl: Math.round(cat.pnl * 100) / 100,
      winRate: catResolved > 0 ? Math.round((cat.wins / catResolved) * 10000) / 100 : 0,
      avgEdge: Math.round(cat.avg_edge * 1000) / 1000,
    };
  }

  return {
    totalTrades: total,
    openTrades: open,
    resolvedTrades: resolved,
    wins: winsCount,
    losses: lossesCount,
    winRate: Math.round(winRate * 100) / 100,
    totalPnl: Math.round(pnlRow.total * 100) / 100,
    avgEdge: Math.round(edgeRow.avg * 1000) / 1000,
    byCategory,
  };
}

/**
 * Update daily stats for today.
 * @param {import('better-sqlite3').Database} db
 * @param {string} [date] - YYYY-MM-DD, defaults to today
 * @returns {object}
 */
export function updateDailyStats(db, date) {
  if (!date) {
    date = new Date().toISOString().split('T')[0];
  }

  const markets = db.prepare("SELECT COUNT(*) as cnt FROM markets WHERE status = 'active'").get().cnt;
  const todaySignals = 0; // Would be tracked in real-time
  const todayOpened = db.prepare(
    "SELECT COUNT(*) as cnt FROM paper_trades WHERE date(opened_at / 1000, 'unixepoch') = ?"
  ).get(date).cnt;
  const todayResolved = db.prepare(
    "SELECT COUNT(*) as cnt FROM paper_trades WHERE date(closed_at / 1000, 'unixepoch') = ? AND resolution IN ('win', 'loss')"
  ).get(date).cnt;
  const todayPnl = db.prepare(
    "SELECT COALESCE(SUM(profit), 0) as total FROM paper_trades WHERE date(closed_at / 1000, 'unixepoch') = ? AND resolution IN ('win', 'loss', 'sold')"
  ).get(date).total;
  const cumPnl = db.prepare(
    "SELECT COALESCE(SUM(profit), 0) as total FROM paper_trades WHERE resolution IN ('win', 'loss', 'sold')"
  ).get().total;

  const stats = getPerformanceStats(db);

  db.prepare(`
    INSERT INTO daily_stats (date, markets_tracked, signals_generated, trades_opened, trades_resolved, daily_pnl, cumulative_pnl, win_rate, avg_edge, best_category)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(date) DO UPDATE SET
      markets_tracked = excluded.markets_tracked,
      signals_generated = excluded.signals_generated,
      trades_opened = excluded.trades_opened,
      trades_resolved = excluded.trades_resolved,
      daily_pnl = excluded.daily_pnl,
      cumulative_pnl = excluded.cumulative_pnl,
      win_rate = excluded.win_rate,
      avg_edge = excluded.avg_edge,
      best_category = excluded.best_category
  `).run(
    date,
    markets,
    todaySignals,
    todayOpened,
    todayResolved,
    todayPnl,
    cumPnl,
    stats.winRate,
    stats.avgEdge,
    findBestCategory(stats.byCategory),
  );

  return { date, marketsTracked: markets, dailyPnl: todayPnl, cumulativePnl: cumPnl };
}

/**
 * Find the best performing category by P&L.
 * @param {Record<string, object>} byCategory
 * @returns {string|null}
 */
export function findBestCategory(byCategory) {
  let best = null;
  let bestPnl = -Infinity;

  for (const [name, data] of Object.entries(byCategory)) {
    if (data.pnl > bestPnl) {
      bestPnl = data.pnl;
      best = name;
    }
  }

  return best;
}
