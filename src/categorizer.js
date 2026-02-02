/**
 * Market categorization engine.
 * Assigns a category to each market based on series_ticker, event_ticker, and title keywords.
 */

/** @type {Array<[RegExp, string]>} Patterns matched against series_ticker or event_ticker */
const TICKER_PATTERNS = [
  [/weather|temp|rain|snow|hurricane|storm|heat|cold|wind|frost/i, 'weather'],
  [/cpi|gdp|unemployment|jobs|nonfarm|payroll|pce|retail.?sales|housing/i, 'economics'],
  [/fed|fomc|rate.?cut|rate.?hike|interest.?rate/i, 'fed_rates'],
  [/elect|president|senate|house|governor|congress|vote|ballot|primary/i, 'politics'],
  [/nfl|nba|mlb|nhl|soccer|football|baseball|basketball|hockey|sport|ncaa|ufc|fight/i, 'sports'],
  [/crypto|bitcoin|btc|eth|ethereum/i, 'crypto'],
  [/stock|sp500|s&p|nasdaq|dow|market.?cap|ipo/i, 'finance'],
];

/** @type {Array<[RegExp, string]>} Patterns matched against market title */
const TITLE_PATTERNS = [
  [/temperature|degrees|°[FC]|rain|snow|weather|precipitation|hurricane|tornado|heat\s?wave/i, 'weather'],
  [/cpi|inflation|gdp|unemployment|jobs?\s(report|number)|payroll|economic/i, 'economics'],
  [/federal\s?reserve|fed\sfunds|rate\s(cut|hike|decision)|fomc|interest\srate/i, 'fed_rates'],
  [/election|president|senat|congress|governor|ballot|vote|polling|democrat|republican/i, 'politics'],
  [/nfl|nba|mlb|nhl|super\sbowl|world\sseries|playoff|game\s\d|score|touchdown/i, 'sports'],
  [/bitcoin|crypto|ethereum|btc|eth/i, 'crypto'],
  [/stock|s&p|nasdaq|dow\sjones|ipo|market\scap|share\sprice/i, 'finance'],
];

/**
 * Categorize a market based on its ticker info and title.
 * @param {object} market
 * @param {string} [market.series_ticker]
 * @param {string} [market.event_ticker]
 * @param {string} [market.title]
 * @returns {string} Category string (e.g., 'weather', 'economics', 'other')
 */
export function categorizeMarket(market) {
  const seriesTicker = market.series_ticker || '';
  const eventTicker = market.event_ticker || '';
  const title = market.title || '';

  // First, try matching on tickers (most reliable signal)
  const tickerText = `${seriesTicker} ${eventTicker}`;
  for (const [pattern, category] of TICKER_PATTERNS) {
    if (pattern.test(tickerText)) {
      return category;
    }
  }

  // Then, try matching on title
  for (const [pattern, category] of TITLE_PATTERNS) {
    if (pattern.test(title)) {
      return category;
    }
  }

  return 'other';
}

/**
 * Update category for all un-categorized markets in the database.
 * @param {import('better-sqlite3').Database} db
 * @returns {{ updated: number }}
 */
export function categorizeAllMarkets(db) {
  const rows = db.prepare(
    "SELECT ticker, series_ticker, event_ticker, title FROM markets WHERE category IS NULL OR category = ''"
  ).all();

  const stmt = db.prepare('UPDATE markets SET category = ? WHERE ticker = ?');
  let updated = 0;

  const runAll = db.transaction((items) => {
    for (const row of items) {
      const category = categorizeMarket(row);
      stmt.run(category, row.ticker);
      updated++;
    }
  });

  runAll(rows);
  return { updated };
}
