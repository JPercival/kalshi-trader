import Database from 'better-sqlite3';

/**
 * SQL to create all tables and indexes.
 * Matches the data model in VISION.md exactly.
 */
const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS markets (
    ticker TEXT PRIMARY KEY,
    event_ticker TEXT,
    series_ticker TEXT,
    category TEXT,
    title TEXT,
    subtitle TEXT,
    status TEXT DEFAULT 'active',
    close_time INTEGER,
    expiration_time INTEGER,
    result TEXT,
    last_yes_price REAL,
    last_updated INTEGER
  );

  CREATE TABLE IF NOT EXISTS price_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticker TEXT NOT NULL REFERENCES markets(ticker),
    timestamp INTEGER NOT NULL,
    yes_bid REAL,
    yes_ask REAL,
    last_price REAL,
    volume INTEGER,
    open_interest INTEGER
  );

  CREATE TABLE IF NOT EXISTS model_estimates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticker TEXT NOT NULL REFERENCES markets(ticker),
    timestamp INTEGER NOT NULL,
    model_name TEXT NOT NULL,
    estimated_prob REAL NOT NULL,
    confidence REAL NOT NULL,
    data_sources TEXT,
    reasoning TEXT
  );

  CREATE TABLE IF NOT EXISTS paper_trades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticker TEXT NOT NULL REFERENCES markets(ticker),
    opened_at INTEGER NOT NULL,
    closed_at INTEGER,
    side TEXT NOT NULL CHECK(side IN ('yes', 'no')),
    entry_price REAL NOT NULL,
    exit_price REAL,
    contracts INTEGER NOT NULL,
    cost_basis REAL NOT NULL,
    revenue REAL,
    profit REAL,
    profit_pct REAL,
    model_edge REAL,
    category TEXT,
    resolution TEXT DEFAULT 'open' CHECK(resolution IN ('win', 'loss', 'open', 'sold'))
  );

  CREATE TABLE IF NOT EXISTS daily_stats (
    date TEXT PRIMARY KEY,
    markets_tracked INTEGER DEFAULT 0,
    signals_generated INTEGER DEFAULT 0,
    trades_opened INTEGER DEFAULT 0,
    trades_resolved INTEGER DEFAULT 0,
    daily_pnl REAL DEFAULT 0,
    cumulative_pnl REAL DEFAULT 0,
    win_rate REAL DEFAULT 0,
    avg_edge REAL DEFAULT 0,
    best_category TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_price_snapshots_ticker_ts
    ON price_snapshots(ticker, timestamp);

  CREATE INDEX IF NOT EXISTS idx_model_estimates_ticker_ts
    ON model_estimates(ticker, timestamp);

  CREATE INDEX IF NOT EXISTS idx_markets_category_status
    ON markets(category, status);

  CREATE INDEX IF NOT EXISTS idx_paper_trades_ticker
    ON paper_trades(ticker);

  CREATE INDEX IF NOT EXISTS idx_paper_trades_resolution
    ON paper_trades(resolution);
`;

/**
 * Open (or create) a SQLite database and apply the schema.
 * @param {string} [dbPath=':memory:'] - Path to the database file, or ':memory:' for in-memory
 * @returns {{ db: import('better-sqlite3').Database, close: () => void }}
 */
export function createDatabase(dbPath = ':memory:') {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA_SQL);

  return {
    db,
    close() {
      db.close();
    },
  };
}

/**
 * Prune old price snapshots and model estimates beyond a retention period.
 * @param {import('better-sqlite3').Database} db
 * @param {number} retentionMs - Keep data newer than now - retentionMs
 * @returns {{ snapshotsDeleted: number, estimatesDeleted: number }}
 */
export function pruneOldData(db, retentionMs) {
  const cutoff = Date.now() - retentionMs;

  const snapResult = db.prepare('DELETE FROM price_snapshots WHERE timestamp < ?').run(cutoff);
  const estResult = db.prepare('DELETE FROM model_estimates WHERE timestamp < ?').run(cutoff);

  return {
    snapshotsDeleted: snapResult.changes,
    estimatesDeleted: estResult.changes,
  };
}
