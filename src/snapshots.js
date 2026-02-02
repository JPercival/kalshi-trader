/**
 * Price snapshot tracker.
 * Captures periodic price snapshots for all active markets.
 */

/**
 * Record a price snapshot for a single market.
 * @param {import('better-sqlite3').Database} db
 * @param {object} snapshot
 * @param {string} snapshot.ticker
 * @param {number} [snapshot.yes_bid]
 * @param {number} [snapshot.yes_ask]
 * @param {number} [snapshot.last_price]
 * @param {number} [snapshot.volume]
 * @param {number} [snapshot.open_interest]
 * @param {number} [snapshot.timestamp] - Defaults to Date.now()
 * @returns {{ id: number }}
 */
export function recordSnapshot(db, snapshot) {
  const stmt = db.prepare(`
    INSERT INTO price_snapshots (ticker, timestamp, yes_bid, yes_ask, last_price, volume, open_interest)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const info = stmt.run(
    snapshot.ticker,
    snapshot.timestamp || Date.now(),
    snapshot.yes_bid ?? null,
    snapshot.yes_ask ?? null,
    snapshot.last_price ?? null,
    snapshot.volume ?? null,
    snapshot.open_interest ?? null,
  );

  return { id: Number(info.lastInsertRowid) };
}

/**
 * Record price snapshots for all active markets in the database.
 * Reads current market data from the markets table and creates snapshots.
 * @param {import('better-sqlite3').Database} db
 * @returns {{ recorded: number }}
 */
export function snapshotAllActive(db) {
  const markets = db.prepare(
    "SELECT ticker, last_yes_price FROM markets WHERE status = 'active'"
  ).all();

  const stmt = db.prepare(`
    INSERT INTO price_snapshots (ticker, timestamp, last_price)
    VALUES (?, ?, ?)
  `);

  const now = Date.now();
  let recorded = 0;

  const runAll = db.transaction((items) => {
    for (const m of items) {
      if (m.last_yes_price != null) {
        stmt.run(m.ticker, now, m.last_yes_price);
        recorded++;
      }
    }
  });

  runAll(markets);
  return { recorded };
}

/**
 * Get price history for a market, ordered by timestamp.
 * @param {import('better-sqlite3').Database} db
 * @param {string} ticker
 * @param {object} [opts]
 * @param {number} [opts.limit] - Max records to return
 * @param {number} [opts.since] - Only snapshots after this timestamp
 * @returns {object[]}
 */
export function getSnapshots(db, ticker, { limit = 100, since = 0 } = {}) {
  return db.prepare(`
    SELECT * FROM price_snapshots
    WHERE ticker = ? AND timestamp >= ?
    ORDER BY timestamp DESC
    LIMIT ?
  `).all(ticker, since, limit);
}
