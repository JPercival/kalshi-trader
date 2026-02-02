import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase } from '../db.js';
import { upsertMarkets, mapStatus, ingestMarkets } from '../ingestion.js';

describe('mapStatus', () => {
  it('maps "open" to "active"', () => {
    expect(mapStatus('open')).toBe('active');
  });

  it('maps "active" to "active"', () => {
    expect(mapStatus('active')).toBe('active');
  });

  it('maps "closed" to "closed"', () => {
    expect(mapStatus('closed')).toBe('closed');
  });

  it('maps "settled" to "settled"', () => {
    expect(mapStatus('settled')).toBe('settled');
  });

  it('maps case-insensitively', () => {
    expect(mapStatus('OPEN')).toBe('active');
    expect(mapStatus('Closed')).toBe('closed');
    expect(mapStatus('SETTLED')).toBe('settled');
  });

  it('returns lowercased unknown status as-is', () => {
    expect(mapStatus('pending')).toBe('pending');
  });

  it('returns "active" for empty or null input', () => {
    expect(mapStatus('')).toBe('active');
    expect(mapStatus(null)).toBe('active');
    expect(mapStatus(undefined)).toBe('active');
  });
});

describe('upsertMarkets', () => {
  let handle;

  beforeEach(() => {
    handle = createDatabase();
  });

  afterEach(() => {
    if (handle) handle.close();
  });

  it('inserts new markets', () => {
    const { db } = handle;
    const result = upsertMarkets(db, [
      {
        ticker: 'MKT-1',
        event_ticker: 'EVT-1',
        series_ticker: 'SER-1',
        category: 'weather',
        title: 'Will it rain?',
        subtitle: 'NYC',
        status: 'open',
        close_time: '2026-02-03T00:00:00Z',
        expiration_time: '2026-02-04T00:00:00Z',
        result: null,
        last_price: 0.65,
      },
    ]);

    expect(result.upserted).toBe(1);
    const row = db.prepare('SELECT * FROM markets WHERE ticker = ?').get('MKT-1');
    expect(row.title).toBe('Will it rain?');
    expect(row.status).toBe('active');
    expect(row.last_yes_price).toBe(0.65);
  });

  it('updates existing market on conflict', () => {
    const { db } = handle;

    upsertMarkets(db, [
      { ticker: 'MKT-2', title: 'Original', status: 'open', last_price: 0.5 },
    ]);

    upsertMarkets(db, [
      { ticker: 'MKT-2', title: 'Updated', status: 'closed', last_price: 0.75 },
    ]);

    const row = db.prepare('SELECT * FROM markets WHERE ticker = ?').get('MKT-2');
    expect(row.title).toBe('Updated');
    expect(row.status).toBe('closed');
    expect(row.last_yes_price).toBe(0.75);
  });

  it('preserves category on update when new category is null', () => {
    const { db } = handle;

    upsertMarkets(db, [
      { ticker: 'MKT-3', category: 'economics', status: 'open', last_price: 0.5 },
    ]);

    upsertMarkets(db, [
      { ticker: 'MKT-3', category: null, status: 'open', last_price: 0.5 },
    ]);

    const row = db.prepare('SELECT * FROM markets WHERE ticker = ?').get('MKT-3');
    expect(row.category).toBe('economics');
  });

  it('preserves result on update when new result is null', () => {
    const { db } = handle;

    upsertMarkets(db, [
      { ticker: 'MKT-4', status: 'settled', result: 'yes', last_price: 1.0 },
    ]);

    upsertMarkets(db, [
      { ticker: 'MKT-4', status: 'settled', result: null, last_price: 1.0 },
    ]);

    const row = db.prepare('SELECT * FROM markets WHERE ticker = ?').get('MKT-4');
    expect(row.result).toBe('yes');
  });

  it('handles batch of multiple markets', () => {
    const { db } = handle;
    const markets = Array.from({ length: 10 }, (_, i) => ({
      ticker: `BATCH-${i}`,
      title: `Market ${i}`,
      status: 'open',
      last_price: 0.5,
    }));

    const result = upsertMarkets(db, markets);
    expect(result.upserted).toBe(10);

    const count = db.prepare('SELECT COUNT(*) as cnt FROM markets').get();
    expect(count.cnt).toBe(10);
  });

  it('uses yes_bid as fallback when last_price is missing', () => {
    const { db } = handle;

    upsertMarkets(db, [
      { ticker: 'MKT-5', status: 'open', yes_bid: 0.42 },
    ]);

    const row = db.prepare('SELECT * FROM markets WHERE ticker = ?').get('MKT-5');
    expect(row.last_yes_price).toBe(0.42);
  });

  it('handles markets with minimal fields', () => {
    const { db } = handle;

    upsertMarkets(db, [
      { ticker: 'MKT-MIN', status: 'open' },
    ]);

    const row = db.prepare('SELECT * FROM markets WHERE ticker = ?').get('MKT-MIN');
    expect(row.ticker).toBe('MKT-MIN');
    expect(row.status).toBe('active');
  });
});

describe('ingestMarkets', () => {
  let handle;

  beforeEach(() => {
    handle = createDatabase();
  });

  afterEach(() => {
    if (handle) handle.close();
  });

  it('fetches markets from client and upserts them', async () => {
    const { db } = handle;
    const mockClient = {
      fetchMarkets: async () => [
        { ticker: 'ING-1', title: 'Test Market', status: 'open', last_price: 0.55, volume: 100, open_interest: 50 },
        { ticker: 'ING-2', title: 'Another Market', status: 'open', last_price: 0.30, volume: 10, open_interest: 5 },
      ],
    };

    const result = await ingestMarkets({ db, client: mockClient });

    expect(result.upserted).toBe(2);
    const count = db.prepare('SELECT COUNT(*) as cnt FROM markets').get();
    expect(count.cnt).toBe(2);
  });

  it('passes status=open to fetchMarkets', async () => {
    const { db } = handle;
    let calledWith;
    const mockClient = {
      fetchMarkets: async (params) => {
        calledWith = params;
        return [];
      },
    };

    await ingestMarkets({ db, client: mockClient });
    expect(calledWith).toEqual({ status: 'open' });
  });
});
