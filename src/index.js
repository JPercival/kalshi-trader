import { loadConfig } from './config.js';

/**
 * Main entry point for the Kalshi Paper Trader.
 * Loads config and starts all services.
 */
export async function main() {
  const config = loadConfig();

  console.log(`[kalshi-trader] Starting with bankroll: $${config.paperBankroll}`);
  console.log(`[kalshi-trader] API base: ${config.kalshiApiBase}`);
  console.log(`[kalshi-trader] Dashboard port: ${config.port}`);
  console.log(`[kalshi-trader] Market poll interval: ${config.marketPollIntervalMs}ms`);
  console.log(`[kalshi-trader] Model run interval: ${config.modelRunIntervalMs}ms`);

  // Services will be wired in here as they are built:
  // 1. Database initialization
  // 2. Market ingestion service
  // 3. Price snapshot tracker
  // 4. Model runner
  // 5. Mispricing detector
  // 6. Paper trade executor
  // 7. Resolution tracker
  // 8. Express web dashboard

  return config;
}
