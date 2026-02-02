import { config as dotenvConfig } from 'dotenv';

/**
 * Load environment variables and return a frozen config object.
 * Call loadConfig() once at startup; import the returned object everywhere else.
 * @param {Record<string, string>} [env] - Optional env override (for testing)
 * @returns {Readonly<object>} Frozen configuration object
 */
export function loadConfig(env) {
  if (!env) {
    dotenvConfig();
    env = process.env;
  }

  const config = {
    // Kalshi API
    kalshiApiBase: env.KALSHI_API_BASE || 'https://api.elections.kalshi.com/trade-api/v2',

    // External data sources
    fredApiKey: env.FRED_API_KEY || '',

    // Polling intervals (ms)
    marketPollIntervalMs: parseInt(env.MARKET_POLL_INTERVAL_MS || '60000', 10),
    modelRunIntervalMs: parseInt(env.MODEL_RUN_INTERVAL_MS || '300000', 10),
    priceSnapshotIntervalMs: parseInt(env.PRICE_SNAPSHOT_INTERVAL_MS || '300000', 10),

    // Trading parameters
    paperBankroll: parseFloat(env.PAPER_BANKROLL || '500'),
    minEdgePct: parseFloat(env.MIN_EDGE_PCT || '5'),
    minConfidence: parseFloat(env.MIN_CONFIDENCE || '0.6'),
    maxPositionPct: parseFloat(env.MAX_POSITION_PCT || '5'),
    kellyFraction: parseFloat(env.KELLY_FRACTION || '0.25'),
    minLiquidity: parseInt(env.MIN_LIQUIDITY || '100', 10),

    // Telegram alerts
    telegramBotToken: env.TELEGRAM_BOT_TOKEN || '',
    telegramChatId: env.TELEGRAM_CHAT_ID || '',

    // Auth (Google OAuth)
    googleClientId: env.GOOGLE_CLIENT_ID || '',
    googleClientSecret: env.GOOGLE_CLIENT_SECRET || '',
    sessionSecret: env.SESSION_SECRET || 'dev-secret-change-me',
    allowedEmails: (env.ALLOWED_EMAILS || '').split(',').map(e => e.trim()).filter(Boolean),
    skipAuth: env.AUTH_BYPASS === 'true',

    // Web dashboard
    baseUrl: env.BASE_URL || '',
    port: parseInt(env.PORT || '3001', 10),
  };

  return Object.freeze(config);
}
