import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase } from '../db.js';
import { recordSnapshot, snapshotAllActive, getSnapshots } from '../snapshots.js';

describe('recordSnapshot', () => {
  let handle;

  beforeEach(() => {
    handle = createDatabase();
    handle.db.prepare('INSERT INTO markets (ticker) VALUES (?)').run('MKT-1');
  });

  afterEach(() => {
    if (handle) handle.close();
  });

  it('records a full snapshot', () => {
    const result = recordSnapshot(handle.db, {
      ticker: 'MKT-1',
      yes_bid: 0.45,
      yes_ask: 0.55,
      last_price: 0.50,
      volume: 1000,
      open_interest: 500,
      timestamp: 12345,
    });

    expect(result.id).toBeGreaterThan(0);

    const row = handle.db.prepare('SELECT * FROM price_snapshots WHERE id = ?').get(result.id);
    expect(row.ticker).toBe('MKT-1');
    expect(row.yes_bid).toBe(0.45);
    expect(row.yes_ask).toBe(0.55);
    expect(row.last_price).toBe(0.50);
    expect(row.volume).toBe(1000);
    expect(row.open_interest).toBe(500);
    expect(row.timestamp).toBe(12345);
  });

  it('defaults timestamp to Date.now()', () => {
    const before = Date.now();
    const result = recordSnapshot(handle.db, {
      ticker: 'MKT-1',
      last_price: 0.60,
    });
    const after = Date.now();

    const row = handle.db.prepare('SELECT * FROM price_snapshots WHERE id = ?').get(result.id);
    expect(row.timestamp).toBeGreaterThanOrEqual(before);
    expect(row.timestamp).toBeLessThanOrEqual(after);
  });

  it('handles null optional fields', () => {
    const result = recordSnapshot(handle.db, {
      ticker: 'MKT-1',
      timestamp: 99999,
    });

    const row = handle.db.prepare('SELECT * FROM price_snapshots WHERE id = ?').get(result.id);
    expect(row.yes_bid).toBeNull();
    expect(row.yes_ask).toBeNull();
    expect(row.last_price).toBeNull();
    expect(row.volume).toBeNull();
    expect(row.open_interest).toBeNull();
  });
});

describe('snapshotAllActive', () => {
  let handle;

  beforeEach(() => {
    handle = createDatabase();
  });

  afterEach(() => {
    if (handle) handle.close();
  });

  it('creates snapshots for all active markets with prices', () => {
    const { db } = handle;

    db.prepare("INSERT INTO markets (ticker, status, last_yes_price) VALUES (?, ?, ?)").run('ACT-1', 'active', 0.5);
    db.prepare("INSERT INTO markets (ticker, status, last_yes_price) VALUES (?, ?, ?)").run('ACT-2', 'active', 0.7);
    db.prepare("INSERT INTO markets (ticker, status, last_yes_price) VALUES (?, ?, ?)").run('CLS-1', 'closed', 0.9);

    const result = snapshotAllActive(db);
    expect(result.recorded).toBe(2);

    const count = db.prepare('SELECT COUNT(*) as cnt FROM price_snapshots').get();
    expect(count.cnt).toBe(2);
  });

  it('skips markets with null price', () => {
    const { db } = handle;

    db.prepare("INSERT INTO markets (ticker, status, last_yes_price) VALUES (?, ?, ?)").run('NO-PRICE', 'active', null);

    const result = snapshotAllActive(db);
    expect(result.recorded).toBe(0);
  });

  it('returns zero when no active markets exist', () => {
    const result = snapshotAllActive(handle.db);
    expect(result.recorded).toBe(0);
  });
});

describe('getSnapshots', () => {
  let handle;

  beforeEach(() => {
    handle = createDatabase();
    handle.db.prepare('INSERT INTO markets (ticker) VALUES (?)').run('MKT-S');
  });

  afterEach(() => {
    if (handle) handle.close();
  });

  it('returns snapshots ordered by timestamp DESC', () => {
    const { db } = handle;

    recordSnapshot(db, { ticker: 'MKT-S', last_price: 0.3, timestamp: 1000 });
    recordSnapshot(db, { ticker: 'MKT-S', last_price: 0.5, timestamp: 3000 });
    recordSnapshot(db, { ticker: 'MKT-S', last_price: 0.4, timestamp: 2000 });

    const snaps = getSnapshots(db, 'MKT-S');
    expect(snaps).toHaveLength(3);
    expect(snaps[0].timestamp).toBe(3000);
    expect(snaps[1].timestamp).toBe(2000);
    expect(snaps[2].timestamp).toBe(1000);
  });

  it('respects limit parameter', () => {
    const { db } = handle;

    for (let i = 0; i < 10; i++) {
      recordSnapshot(db, { ticker: 'MKT-S', last_price: 0.5, timestamp: i * 1000 });
    }

    const snaps = getSnapshots(db, 'MKT-S', { limit: 3 });
    expect(snaps).toHaveLength(3);
  });

  it('respects since parameter', () => {
    const { db } = handle;

    recordSnapshot(db, { ticker: 'MKT-S', last_price: 0.3, timestamp: 1000 });
    recordSnapshot(db, { ticker: 'MKT-S', last_price: 0.5, timestamp: 3000 });
    recordSnapshot(db, { ticker: 'MKT-S', last_price: 0.4, timestamp: 5000 });

    const snaps = getSnapshots(db, 'MKT-S', { since: 2000 });
    expect(snaps).toHaveLength(2);
    expect(snaps[0].timestamp).toBe(5000);
    expect(snaps[1].timestamp).toBe(3000);
  });

  it('returns empty array for unknown ticker', () => {
    const snaps = getSnapshots(handle.db, 'NONEXIST');
    expect(snaps).toEqual([]);
  });

  it('uses default options when none provided', () => {
    const { db } = handle;
    recordSnapshot(db, { ticker: 'MKT-S', last_price: 0.5, timestamp: 1000 });

    const snaps = getSnapshots(db, 'MKT-S');
    expect(snaps).toHaveLength(1);
  });
});
