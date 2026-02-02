/**
 * Lightweight Kalshi API client for read-only market data.
 * No authentication needed for public endpoints.
 */

/**
 * @typedef {object} KalshiEvent
 * @property {string} event_ticker
 * @property {string} series_ticker
 * @property {string} title
 * @property {string} [subtitle]
 * @property {string} category
 * @property {object[]} [markets]
 */

/**
 * @typedef {object} KalshiMarket
 * @property {string} ticker
 * @property {string} event_ticker
 * @property {string} [series_ticker]
 * @property {string} title
 * @property {string} [subtitle]
 * @property {string} status - open, closed, settled
 * @property {string} [close_time]
 * @property {string} [expiration_time]
 * @property {string} [result] - yes, no, or empty
 * @property {number} [yes_bid]
 * @property {number} [yes_ask]
 * @property {number} [last_price]
 * @property {number} [volume]
 * @property {number} [open_interest]
 */

/**
 * Create a Kalshi API client.
 * @param {object} opts
 * @param {string} opts.baseUrl - API base URL
 * @param {typeof globalThis.fetch} [opts.fetch] - Fetch implementation (for testing)
 * @returns {{ fetchEvents: Function, fetchMarkets: Function, fetchMarket: Function }}
 */
export function createKalshiClient({ baseUrl, fetch: fetchFn = globalThis.fetch, maxRetries = 3, retryDelayMs = 2000, pageDelayMs = 1000 }) {
  /**
   * Fetch with retry + exponential backoff on 429.
   */
  async function fetchWithRetry(url) {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const res = await fetchFn(url);
      if (res.status === 429 && attempt < maxRetries) {
        const delay = retryDelayMs * Math.pow(2, attempt);
        console.warn(`[kalshi] 429 rate limited, retrying in ${delay / 1000}s (attempt ${attempt + 1}/${maxRetries})`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      return res;
    }
  }

  /**
   * Fetch events from Kalshi API with cursor-based pagination.
   * @param {object} [params]
   * @param {string} [params.status] - Filter by status (e.g., 'open')
   * @param {number} [params.limit] - Results per page (max 200)
   * @returns {Promise<KalshiEvent[]>}
   */
  async function fetchEvents({ status = 'open', limit = 200 } = {}) {
    const allEvents = [];
    let cursor = '';

    do {
      const url = new URL(`${baseUrl}/events`);
      url.searchParams.set('status', status);
      url.searchParams.set('limit', String(limit));
      if (cursor) url.searchParams.set('cursor', cursor);

      const res = await fetchWithRetry(url.toString());
      if (!res.ok) {
        throw new Error(`Kalshi API error ${res.status}: ${await res.text()}`);
      }

      const data = await res.json();
      const events = data.events || [];
      allEvents.push(...events);
      cursor = data.cursor || '';
      if (cursor && pageDelayMs > 0) await new Promise(r => setTimeout(r, pageDelayMs));
    } while (cursor);

    return allEvents;
  }

  /**
   * Fetch markets, optionally filtered by event_ticker.
   * Handles cursor-based pagination.
   * @param {object} [params]
   * @param {string} [params.eventTicker] - Filter by event ticker
   * @param {string} [params.status] - Filter by status
   * @param {number} [params.limit] - Results per page (max 200)
   * @returns {Promise<KalshiMarket[]>}
   */
  async function fetchMarkets({ eventTicker, status, limit = 200 } = {}) {
    const allMarkets = [];
    let cursor = '';

    do {
      const url = new URL(`${baseUrl}/markets`);
      url.searchParams.set('limit', String(limit));
      if (eventTicker) url.searchParams.set('event_ticker', eventTicker);
      if (status) url.searchParams.set('status', status);
      if (cursor) url.searchParams.set('cursor', cursor);

      const res = await fetchWithRetry(url.toString());
      if (!res.ok) {
        throw new Error(`Kalshi API error ${res.status}: ${await res.text()}`);
      }

      const data = await res.json();
      const markets = data.markets || [];
      allMarkets.push(...markets);
      cursor = data.cursor || '';
      if (cursor && pageDelayMs > 0) await new Promise(r => setTimeout(r, pageDelayMs));
    } while (cursor);

    return allMarkets;
  }

  /**
   * Fetch a single market by ticker.
   * @param {string} ticker
   * @returns {Promise<KalshiMarket>}
   */
  async function fetchMarket(ticker) {
    const url = `${baseUrl}/markets/${encodeURIComponent(ticker)}`;
    const res = await fetchWithRetry(url);
    if (!res.ok) {
      throw new Error(`Kalshi API error ${res.status}: ${await res.text()}`);
    }
    const data = await res.json();
    return data.market;
  }

  return { fetchEvents, fetchMarkets, fetchMarket };
}
