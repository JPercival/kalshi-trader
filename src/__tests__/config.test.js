import { describe, it, expect } from 'vitest';
import { loadConfig } from '../config.js';

describe('loadConfig', () => {
  it('returns default values when env is empty', () => {
    const cfg = loadConfig({});

    expect(cfg.kalshiApiBase).toBe('https://api.elections.kalshi.com/trade-api/v2');
    expect(cfg.fredApiKey).toBe('');
    expect(cfg.marketPollIntervalMs).toBe(60000);
    expect(cfg.modelRunIntervalMs).toBe(300000);
    expect(cfg.priceSnapshotIntervalMs).toBe(300000);
    expect(cfg.paperBankroll).toBe(500);
    expect(cfg.minEdgePct).toBe(5);
    expect(cfg.minConfidence).toBe(0.6);
    expect(cfg.maxPositionPct).toBe(5);
    expect(cfg.kellyFraction).toBe(0.25);
    expect(cfg.minLiquidity).toBe(100);
    expect(cfg.telegramBotToken).toBe('');
    expect(cfg.telegramChatId).toBe('');
    expect(cfg.googleClientId).toBe('');
    expect(cfg.googleClientSecret).toBe('');
    expect(cfg.sessionSecret).toBe('dev-secret-change-me');
    expect(cfg.allowedEmails).toEqual([]);
    expect(cfg.skipAuth).toBe(false);
    expect(cfg.port).toBe(3001);
  });

  it('reads values from provided env object', () => {
    const env = {
      KALSHI_API_BASE: 'https://custom.api/v2',
      FRED_API_KEY: 'test-fred-key',
      MARKET_POLL_INTERVAL_MS: '30000',
      MODEL_RUN_INTERVAL_MS: '120000',
      PRICE_SNAPSHOT_INTERVAL_MS: '60000',
      PAPER_BANKROLL: '1000',
      MIN_EDGE_PCT: '10',
      MIN_CONFIDENCE: '0.8',
      MAX_POSITION_PCT: '3',
      KELLY_FRACTION: '0.5',
      MIN_LIQUIDITY: '200',
      TELEGRAM_BOT_TOKEN: 'bot-token',
      TELEGRAM_CHAT_ID: 'chat-123',
      GOOGLE_CLIENT_ID: 'goog-id',
      GOOGLE_CLIENT_SECRET: 'goog-secret',
      SESSION_SECRET: 'my-session-secret',
      ALLOWED_EMAILS: 'a@b.com,c@d.com',
      AUTH_BYPASS: 'true',
      PORT: '4000',
    };

    const cfg = loadConfig(env);

    expect(cfg.kalshiApiBase).toBe('https://custom.api/v2');
    expect(cfg.fredApiKey).toBe('test-fred-key');
    expect(cfg.marketPollIntervalMs).toBe(30000);
    expect(cfg.modelRunIntervalMs).toBe(120000);
    expect(cfg.priceSnapshotIntervalMs).toBe(60000);
    expect(cfg.paperBankroll).toBe(1000);
    expect(cfg.minEdgePct).toBe(10);
    expect(cfg.minConfidence).toBe(0.8);
    expect(cfg.maxPositionPct).toBe(3);
    expect(cfg.kellyFraction).toBe(0.5);
    expect(cfg.minLiquidity).toBe(200);
    expect(cfg.telegramBotToken).toBe('bot-token');
    expect(cfg.telegramChatId).toBe('chat-123');
    expect(cfg.googleClientId).toBe('goog-id');
    expect(cfg.googleClientSecret).toBe('goog-secret');
    expect(cfg.sessionSecret).toBe('my-session-secret');
    expect(cfg.allowedEmails).toEqual(['a@b.com', 'c@d.com']);
    expect(cfg.skipAuth).toBe(true);
    expect(cfg.port).toBe(4000);
  });

  it('returns a frozen object', () => {
    const cfg = loadConfig({});
    expect(Object.isFrozen(cfg)).toBe(true);
    expect(() => { cfg.port = 9999; }).toThrow();
  });

  it('handles partial env — missing keys fall back to defaults', () => {
    const cfg = loadConfig({ PORT: '8080', FRED_API_KEY: 'abc' });

    expect(cfg.port).toBe(8080);
    expect(cfg.fredApiKey).toBe('abc');
    // everything else defaults
    expect(cfg.paperBankroll).toBe(500);
    expect(cfg.kalshiApiBase).toBe('https://api.elections.kalshi.com/trade-api/v2');
  });
});
