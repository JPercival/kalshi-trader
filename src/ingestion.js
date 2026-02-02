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
        last_yes_price: m.last_price != null ? m.last_price / 100 : m.yes_bid != null ? m.yes_bid / 100 : null,
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
/**
 * Default categories to ingest. These are the ones our models can work with.
 * Sports included — models may find edges in thin markets with less competition.
 */
const DEFAULT_CATEGORIES = [
  'Climate and Weather',
  'Economics',
  'Financials',
  'Politics',
  'Science and Technology',
  'World',
  'Health',
  'Elections',
  'Companies',
  'Sports',
  'Entertainment',
  'Social',
  'Transportation',
];

/**
 * Ingest markets from Kalshi API using an event-first strategy.
 * 1. Fetch all open events (3-4K, much smaller than 60K+ markets)
 * 2. Filter events by category
 * 3. Fetch markets only for matching events (with_nested_markets)
 * 4. Filter out zero-activity markets
 *
 * @param {object} opts
 * @param {import('better-sqlite3').Database} opts.db
 * @param {object} opts.client - Kalshi API client
 * @param {string[]} [opts.categories] - Event categories to include
 * @param {number} [opts.minVolume] - Min volume OR open_interest to include (default 1)
 * @param {object} [opts.logger]
 */
/**
 * Check if a market closes within the given horizon.
 * @param {object} market
 * @param {number} maxCloseMs - Maximum close time in ms from now
 * @returns {boolean}
 */
export function closesWithin(market, maxCloseMs) {
  const closeTime = market.close_time || market.expected_expiration_time || market.expiration_time;
  if (!closeTime) return false;
  const closeMs = new Date(closeTime).getTime();
  return closeMs > Date.now() && closeMs <= Date.now() + maxCloseMs;
}

const MS_PER_DAY = 86400000;

export async function ingestMarkets({ db, client, categories = DEFAULT_CATEGORIES, minVolume = 1, maxCloseDays = 7, logger = console }) {
  logger.log('[ingest] Fetching open events with nested markets...');
  const allEvents = await client.fetchEvents({ status: 'open', withNestedMarkets: true });

  // Filter to categories we care about
  const catSet = new Set(categories.map(c => c.toLowerCase()));
  const events = allEvents.filter(e => catSet.has((e.category || '').toLowerCase()));
  logger.log(`[ingest] ${allEvents.length} events total, ${events.length} in target categories`);

  // Extract markets from nested event data
  const maxCloseMs = maxCloseDays * MS_PER_DAY;
  let allMarkets = [];
  for (const event of events) {
    const eventMarkets = event.markets || [];
    for (const m of eventMarkets) {
      m.category = m.category || event.category;
      m.event_ticker = m.event_ticker || event.event_ticker;
      m.series_ticker = m.series_ticker || event.series_ticker;
    }
    allMarkets.push(...eventMarkets);
  }

  // Filter: must have activity AND close within horizon
  const markets = allMarkets.filter(m =>
    ((m.volume || 0) >= minVolume || (m.open_interest || 0) >= minVolume) &&
    closesWithin(m, maxCloseMs)
  );
  logger.log(`[ingest] ${allMarkets.length} markets from events, ${markets.length} closing within ${maxCloseDays}d with activity, upserting...`);

  const result = upsertMarkets(db, markets);
  return { ...result, total: markets.length };
}
