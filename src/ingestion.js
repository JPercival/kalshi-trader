/**
 * Market ingestion service.
 * Polls Kalshi API and upserts market data into SQLite.
 */

/**
 * Upsert a batch of market records into the markets table.
 * @param {import('better-sqlite3').Database} db
 * @param {object[]} markets - Array of market objects from Kalshi API
 * @returns {{ upserted: number }}
 */
export function upsertMarkets(db, markets) {
  const stmt = db.prepare(`
    INSERT INTO markets (ticker, event_ticker, series_ticker, category, title, subtitle, status, close_time, expiration_time, result, last_yes_price, last_updated)
    VALUES (@ticker, @event_ticker, @series_ticker, @category, @title, @subtitle, @status, @close_time, @expiration_time, @result, @last_yes_price, @last_updated)
    ON CONFLICT(ticker) DO UPDATE SET
      event_ticker = excluded.event_ticker,
      series_ticker = excluded.series_ticker,
      category = COALESCE(excluded.category, markets.category),
      title = excluded.title,
      subtitle = excluded.subtitle,
      status = excluded.status,
      close_time = excluded.close_time,
      expiration_time = excluded.expiration_time,
      result = COALESCE(excluded.result, markets.result),
      last_yes_price = excluded.last_yes_price,
      last_updated = excluded.last_updated
  `);

  const now = Date.now();
  let upserted = 0;

  const runAll = db.transaction((items) => {
    for (const m of items) {
      stmt.run({
        ticker: m.ticker,
        event_ticker: m.event_ticker || null,
        series_ticker: m.series_ticker || null,
        category: m.category || null,
        title: m.title || null,
        subtitle: m.subtitle || null,
        status: mapStatus(m.status),
        close_time: m.close_time ? new Date(m.close_time).getTime() : null,
        expiration_time: m.expiration_time ? new Date(m.expiration_time).getTime() : null,
        result: m.result || null,
        last_yes_price: m.last_price ?? m.yes_bid ?? null,
        last_updated: now,
      });
      upserted++;
    }
  });

  runAll(markets);
  return { upserted };
}

/**
 * Map Kalshi API status string to our internal status.
 * @param {string} apiStatus
 * @returns {string}
 */
export function mapStatus(apiStatus) {
  const s = (apiStatus || '').toLowerCase();
  if (s === 'open' || s === 'active') return 'active';
  if (s === 'closed') return 'closed';
  if (s === 'settled') return 'settled';
  return s || 'active';
}

/**
 * Run one ingestion cycle: fetch markets from Kalshi API and upsert.
 * @param {object} opts
 * @param {import('better-sqlite3').Database} opts.db
 * @param {{ fetchMarkets: Function }} opts.client - Kalshi API client
 * @returns {Promise<{ upserted: number }>}
 */
export async function ingestMarkets({ db, client, logger = console }) {
  logger.log('[ingest] Fetching open markets from Kalshi...');
  const markets = await client.fetchMarkets({ status: 'open' });
  logger.log(`[ingest] Fetched ${markets.length} markets, upserting...`);
  return upsertMarkets(db, markets);
}
