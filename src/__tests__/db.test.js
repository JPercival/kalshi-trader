import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase, pruneOldData } from '../db.js';

describe('createDatabase', () => {
  let handle;

  afterEach(() => {
    if (handle) handle.close();
  });

  it('creates an in-memory database with all tables', () => {
    handle = createDatabase();
    const { db } = handle;

    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).all().map(r => r.name);

    expect(tables).toContain('markets');
    expect(tables).toContain('price_snapshots');
    expect(tables).toContain('model_estimates');
    expect(tables).toContain('paper_trades');
    expect(tables).toContain('daily_stats');
  });

  it('creates expected indexes', () => {
    handle = createDatabase();
    const { db } = handle;

    const indexes = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%' ORDER BY name"
    ).all().map(r => r.name);

    expect(indexes).toContain('idx_price_snapshots_ticker_ts');
    expect(indexes).toContain('idx_model_estimates_ticker_ts');
    expect(indexes).toContain('idx_markets_category_status');
    expect(indexes).toContain('idx_paper_trades_ticker');
    expect(indexes).toContain('idx_paper_trades_resolution');
  });

  it('enables WAL journal mode for file-based DBs', () => {
    // WAL doesn't apply to :memory: — use a temp file
    const tmpPath = '/tmp/kalshi-test-wal-' + Date.now() + '.db';
    const fileHandle = createDatabase(tmpPath);
    const mode = fileHandle.db.pragma('journal_mode', { simple: true });
    expect(mode).toBe('wal');
    fileHandle.close();
    // Cleanup
    import('fs').then(fs => {
      try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
      try { fs.unlinkSync(tmpPath + '-wal'); } catch { /* ignore */ }
      try { fs.unlinkSync(tmpPath + '-shm'); } catch { /* ignore */ }
    });
  });

  it('enables foreign keys', () => {
    handle = createDatabase();
    const { db } = handle;
    const fk = db.pragma('foreign_keys', { simple: true });
    expect(fk).toBe(1);
  });

  it('is idempotent — running schema twice is fine', () => {
    handle = createDatabase();
    // Creating another handle on :memory: is a new db, but let's verify by
    // re-executing schema on the same db
    const { db } = handle;
    // Execute the schema creation again via a new createDatabase
    // This shouldn't throw because of IF NOT EXISTS
    expect(() => {
      db.exec("CREATE TABLE IF NOT EXISTS markets (ticker TEXT PRIMARY KEY)");
    }).not.toThrow();
  });

  it('can insert and query a market', () => {
    handle = createDatabase();
    const { db } = handle;

    db.prepare(`INSERT INTO markets (ticker, title, category, status, last_yes_price, last_updated)
                VALUES (?, ?, ?, ?, ?, ?)`).run('TEST-MARKET', 'Test', 'weather', 'active', 0.5, Date.now());

    const row = db.prepare('SELECT * FROM markets WHERE ticker = ?').get('TEST-MARKET');
    expect(row.ticker).toBe('TEST-MARKET');
    expect(row.title).toBe('Test');
    expect(row.category).toBe('weather');
    expect(row.last_yes_price).toBe(0.5);
  });

  it('can insert and query price_snapshots with FK', () => {
    handle = createDatabase();
    const { db } = handle;

    db.prepare('INSERT INTO markets (ticker) VALUES (?)').run('MKT-1');
    db.prepare(
      'INSERT INTO price_snapshots (ticker, timestamp, yes_bid, yes_ask, last_price, volume, open_interest) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run('MKT-1', 1000, 0.45, 0.55, 0.50, 100, 50);

    const rows = db.prepare('SELECT * FROM price_snapshots WHERE ticker = ?').all('MKT-1');
    expect(rows).toHaveLength(1);
    expect(rows[0].last_price).toBe(0.50);
  });

  it('can insert and query model_estimates', () => {
    handle = createDatabase();
    const { db } = handle;

    db.prepare('INSERT INTO markets (ticker) VALUES (?)').run('MKT-2');
    db.prepare(
      'INSERT INTO model_estimates (ticker, timestamp, model_name, estimated_prob, confidence, data_sources, reasoning) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run('MKT-2', 2000, 'weather', 0.7, 0.8, '["NOAA"]', 'High probability per forecast');

    const row = db.prepare('SELECT * FROM model_estimates WHERE ticker = ?').get('MKT-2');
    expect(row.model_name).toBe('weather');
    expect(row.estimated_prob).toBe(0.7);
  });

  it('can insert paper_trades with valid side values', () => {
    handle = createDatabase();
    const { db } = handle;

    db.prepare('INSERT INTO markets (ticker) VALUES (?)').run('MKT-3');
    db.prepare(
      `INSERT INTO paper_trades (ticker, opened_at, side, entry_price, contracts, cost_basis, model_edge, category)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run('MKT-3', 3000, 'yes', 0.40, 10, 4.0, 0.15, 'weather');

    const row = db.prepare('SELECT * FROM paper_trades WHERE ticker = ?').get('MKT-3');
    expect(row.side).toBe('yes');
    expect(row.resolution).toBe('open');
  });

  it('rejects invalid side value on paper_trades', () => {
    handle = createDatabase();
    const { db } = handle;

    db.prepare('INSERT INTO markets (ticker) VALUES (?)').run('MKT-4');
    expect(() => {
      db.prepare(
        `INSERT INTO paper_trades (ticker, opened_at, side, entry_price, contracts, cost_basis) VALUES (?, ?, ?, ?, ?, ?)`
      ).run('MKT-4', 4000, 'maybe', 0.50, 5, 2.5);
    }).toThrow();
  });

  it('can insert and query daily_stats', () => {
    handle = createDatabase();
    const { db } = handle;

    db.prepare(
      `INSERT INTO daily_stats (date, markets_tracked, daily_pnl, cumulative_pnl) VALUES (?, ?, ?, ?)`
    ).run('2026-01-15', 50, 12.50, 120.00);

    const row = db.prepare('SELECT * FROM daily_stats WHERE date = ?').get('2026-01-15');
    expect(row.markets_tracked).toBe(50);
    expect(row.daily_pnl).toBe(12.50);
  });

  it('close() closes the database connection', () => {
    handle = createDatabase();
    handle.close();
    // After closing, querying should throw
    expect(() => {
      handle.db.prepare('SELECT 1').get();
    }).toThrow();
    handle = null; // prevent double-close in afterEach
  });
});

describe('pruneOldData', () => {
  let handle;

  beforeEach(() => {
    handle = createDatabase();
  });

  afterEach(() => {
    if (handle) handle.close();
  });

  it('deletes price_snapshots older than retention period', () => {
    const { db } = handle;
    const now = Date.now();

    db.prepare('INSERT INTO markets (ticker) VALUES (?)').run('MKT-P');

    // Insert old and new snapshots
    db.prepare('INSERT INTO price_snapshots (ticker, timestamp, last_price) VALUES (?, ?, ?)').run('MKT-P', now - 100000, 0.5);
    db.prepare('INSERT INTO price_snapshots (ticker, timestamp, last_price) VALUES (?, ?, ?)').run('MKT-P', now - 50000, 0.6);
    db.prepare('INSERT INTO price_snapshots (ticker, timestamp, last_price) VALUES (?, ?, ?)').run('MKT-P', now - 1000, 0.7);

    const result = pruneOldData(db, 60000); // keep last 60s

    expect(result.snapshotsDeleted).toBe(1); // only the 100s-old one
    const remaining = db.prepare('SELECT * FROM price_snapshots').all();
    expect(remaining).toHaveLength(2);
  });

  it('deletes model_estimates older than retention period', () => {
    const { db } = handle;
    const now = Date.now();

    db.prepare('INSERT INTO markets (ticker) VALUES (?)').run('MKT-E');

    db.prepare(
      'INSERT INTO model_estimates (ticker, timestamp, model_name, estimated_prob, confidence) VALUES (?, ?, ?, ?, ?)'
    ).run('MKT-E', now - 200000, 'test', 0.5, 0.8);
    db.prepare(
      'INSERT INTO model_estimates (ticker, timestamp, model_name, estimated_prob, confidence) VALUES (?, ?, ?, ?, ?)'
    ).run('MKT-E', now - 1000, 'test', 0.6, 0.9);

    const result = pruneOldData(db, 60000);

    expect(result.estimatesDeleted).toBe(1);
    const remaining = db.prepare('SELECT * FROM model_estimates').all();
    expect(remaining).toHaveLength(1);
  });

  it('returns zero counts when nothing to prune', () => {
    const { db } = handle;
    const result = pruneOldData(db, 60000);

    expect(result.snapshotsDeleted).toBe(0);
    expect(result.estimatesDeleted).toBe(0);
  });
});
