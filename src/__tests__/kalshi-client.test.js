import { describe, it, expect, vi } from 'vitest';
import { createKalshiClient } from '../kalshi-client.js';

/**
 * Helper: create a mock fetch that returns JSON responses.
 */
function mockFetch(responses) {
  const calls = [];
  let callIndex = 0;
  const fn = async (url) => {
    calls.push(url);
    const resp = responses[callIndex] || responses[responses.length - 1];
    // Only advance index if this isn't the last response (for retry reuse)
    if (callIndex < responses.length - 1) callIndex++;
    else if (responses.length > 1 && callIndex < responses.length) callIndex++;
    return {
      ok: resp.ok !== false,
      status: resp.status || (resp.ok === false ? 500 : 200),
      json: async () => resp.json,
      text: async () => resp.text || JSON.stringify(resp.json),
    };
  };
  fn.calls = calls;
  return fn;
}

function mockFetchSequential(responses) {
  const calls = [];
  let callIndex = 0;
  const fn = async (url) => {
    calls.push(url);
    const resp = responses[callIndex++];
    return {
      ok: resp.ok !== false,
      status: resp.status || (resp.ok === false ? 500 : 200),
      json: async () => resp.json,
      text: async () => resp.text || JSON.stringify(resp.json),
    };
  };
  fn.calls = calls;
  return fn;
}

describe('createKalshiClient', () => {
  const baseUrl = 'https://api.test.kalshi.com/trade-api/v2';

  describe('fetchEvents', () => {
    it('fetches events with default params', async () => {
      const fetch = mockFetch([
        { json: { events: [{ event_ticker: 'E1' }], cursor: '' } },
      ]);
      const client = createKalshiClient({ baseUrl, fetch, maxRetries: 0 });

      const events = await client.fetchEvents();

      expect(events).toEqual([{ event_ticker: 'E1' }]);
      expect(fetch.calls[0]).toContain('status=open');
      expect(fetch.calls[0]).toContain('limit=200');
    });

    it('paginates through multiple pages', async () => {
      const fetch = mockFetch([
        { json: { events: [{ event_ticker: 'E1' }], cursor: 'page2' } },
        { json: { events: [{ event_ticker: 'E2' }], cursor: '' } },
      ]);
      const client = createKalshiClient({ baseUrl, fetch, maxRetries: 0 });

      const events = await client.fetchEvents();

      expect(events).toHaveLength(2);
      expect(events[0].event_ticker).toBe('E1');
      expect(events[1].event_ticker).toBe('E2');
      expect(fetch.calls).toHaveLength(2);
      expect(fetch.calls[1]).toContain('cursor=page2');
    });

    it('throws on API error', async () => {
      const fetch = mockFetch([
        { ok: false, status: 500, text: 'Internal Server Error' },
      ]);
      const client = createKalshiClient({ baseUrl, fetch, maxRetries: 0 });

      await expect(client.fetchEvents()).rejects.toThrow('Kalshi API error 500');
    });

    it('handles response with no events key', async () => {
      const fetch = mockFetch([
        { json: { cursor: '' } },
      ]);
      const client = createKalshiClient({ baseUrl, fetch, maxRetries: 0 });

      const events = await client.fetchEvents();
      expect(events).toEqual([]);
    });

    it('passes custom status and limit', async () => {
      const fetch = mockFetch([
        { json: { events: [], cursor: '' } },
      ]);
      const client = createKalshiClient({ baseUrl, fetch, maxRetries: 0 });

      await client.fetchEvents({ status: 'closed', limit: 50 });

      expect(fetch.calls[0]).toContain('status=closed');
      expect(fetch.calls[0]).toContain('limit=50');
    });
  });

  describe('fetchMarkets', () => {
    it('fetches markets with pagination', async () => {
      const fetch = mockFetch([
        { json: { markets: [{ ticker: 'M1' }], cursor: 'next' } },
        { json: { markets: [{ ticker: 'M2' }], cursor: '' } },
      ]);
      const client = createKalshiClient({ baseUrl, fetch, maxRetries: 0 });

      const markets = await client.fetchMarkets();

      expect(markets).toHaveLength(2);
      expect(fetch.calls).toHaveLength(2);
    });

    it('passes event_ticker and status filters', async () => {
      const fetch = mockFetch([
        { json: { markets: [], cursor: '' } },
      ]);
      const client = createKalshiClient({ baseUrl, fetch, maxRetries: 0 });

      await client.fetchMarkets({ eventTicker: 'EV-1', status: 'open' });

      expect(fetch.calls[0]).toContain('event_ticker=EV-1');
      expect(fetch.calls[0]).toContain('status=open');
    });

    it('throws on API error', async () => {
      const fetch = mockFetch([
        { ok: false, status: 403, text: 'Forbidden' },
      ]);
      const client = createKalshiClient({ baseUrl, fetch, maxRetries: 0 });

      await expect(client.fetchMarkets()).rejects.toThrow('Kalshi API error 403');
    });

    it('handles empty response', async () => {
      const fetch = mockFetch([
        { json: { markets: [], cursor: '' } },
      ]);
      const client = createKalshiClient({ baseUrl, fetch, maxRetries: 0 });

      const markets = await client.fetchMarkets();
      expect(markets).toEqual([]);
    });

    it('handles response with no markets key', async () => {
      const fetch = mockFetch([
        { json: { cursor: '' } },
      ]);
      const client = createKalshiClient({ baseUrl, fetch, maxRetries: 0 });

      const markets = await client.fetchMarkets();
      expect(markets).toEqual([]);
    });
  });

  describe('fetchMarket', () => {
    it('fetches a single market by ticker', async () => {
      const fetch = mockFetch([
        { json: { market: { ticker: 'MKT-RAIN', title: 'Will it rain?' } } },
      ]);
      const client = createKalshiClient({ baseUrl, fetch, maxRetries: 0 });

      const market = await client.fetchMarket('MKT-RAIN');

      expect(market.ticker).toBe('MKT-RAIN');
      expect(fetch.calls[0]).toContain('/markets/MKT-RAIN');
    });

    it('throws on API error', async () => {
      const fetch = mockFetch([
        { ok: false, status: 404, text: 'Not Found' },
      ]);
      const client = createKalshiClient({ baseUrl, fetch, maxRetries: 0 });

      await expect(client.fetchMarket('NONEXIST')).rejects.toThrow('Kalshi API error 404');
    });
  });

  describe('retry on 429', () => {
    it('retries on 429 and succeeds', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const fetch = mockFetchSequential([
        { ok: false, status: 429, text: '{"error":{"message":"too many requests"}}' },
        { json: { market: { ticker: 'M1' } } },
      ]);
      const client = createKalshiClient({ baseUrl, fetch, maxRetries: 1, retryDelayMs: 0 });

      const market = await client.fetchMarket('M1');

      expect(market.ticker).toBe('M1');
      expect(fetch.calls).toHaveLength(2);
      vi.restoreAllMocks();
    });

    it('throws after exhausting retries on 429', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const fetch = mockFetchSequential([
        { ok: false, status: 429, text: 'rate limited' },
        { ok: false, status: 429, text: 'rate limited' },
      ]);
      const client = createKalshiClient({ baseUrl, fetch, maxRetries: 1, retryDelayMs: 0 });

      await expect(client.fetchMarket('M1')).rejects.toThrow('Kalshi API error 429');
      vi.restoreAllMocks();
    });
  });
});
