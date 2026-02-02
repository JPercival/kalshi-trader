import { loadConfig } from './config.js';
import { createDatabase } from './db.js';
import { createKalshiClient } from './kalshi-client.js';
import { ingestMarkets } from './ingestion.js';
import { snapshotAllActive } from './snapshots.js';
import { createModelRunner } from './model-runner.js';
import { createWeatherModel } from './models/weather.js';
import { createEconomicsModel } from './models/economics.js';
import { createFedRatesModel } from './models/fed-rates.js';
import { createBaseRateModel } from './models/base-rate.js';
import { detectMispricings } from './mispricing.js';
import { executePaperTrades, calculateBankroll } from './paper-trader.js';
import { resolveSettledTrades, updateDailyStats } from './resolution.js';
import { createApp } from './server.js';

/** @type {{ fn: (ms: number) => Promise<void> }} */
export const timing = { delay: (ms) => new Promise(r => setTimeout(r, ms)) };

/**
 * Main entry point for the Kalshi Paper Trader.
 * Wires up all services and starts polling + web server.
 */
export async function main() {
  const config = loadConfig();
  const dbPath = process.env.DB_PATH || './data/kalshi.db';
  const { db, close } = createDatabase(dbPath);
  const client = createKalshiClient({ baseUrl: config.kalshiApiBase });

  console.log(`[kalshi-trader] Starting with bankroll: $${config.paperBankroll}`);
  console.log(`[kalshi-trader] API base: ${config.kalshiApiBase}`);
  console.log(`[kalshi-trader] DB: ${dbPath}`);
  console.log(`[kalshi-trader] Dashboard port: ${config.port}`);

  // --- Web server ---
  const app = createApp({ db, config });
  const server = app.listen(config.port, () => {
    console.log(`[kalshi-trader] Dashboard listening on http://localhost:${config.port}`);
  });

  // --- Model runner ---
  const modelRunner = createModelRunner({ db, config });
  modelRunner.register(createWeatherModel());
  modelRunner.register(createEconomicsModel({ apiKey: config.fredApiKey }));
  modelRunner.register(createFedRatesModel({ apiKey: config.fredApiKey }));
  modelRunner.register(createBaseRateModel());
  console.log(`[kalshi-trader] Registered ${modelRunner.getModels().length} probability models`);

  // --- Polling loop ---
  let running = true;

  async function pollCycle() {
    try {
      // 1. Ingest markets from Kalshi
      const { upserted, total } = await ingestMarkets({ db, client, maxCloseDays: config.maxCloseDays });
      console.log(`[poll] Ingested ${upserted} new/updated markets (${total} total)`);

      // 2. Snapshot prices for active markets
      const snapCount = snapshotAllActive(db);
      console.log(`[poll] Recorded ${snapCount} price snapshots`);

      // 3. Resolve any settled trades
      const resolved = resolveSettledTrades(db);
      if (resolved.length > 0) {
        console.log(`[poll] Resolved ${resolved.length} trades`);
      }

      // 4. Update daily stats
      const today = new Date().toISOString().slice(0, 10);
      updateDailyStats(db, today);
    } catch (err) {
      console.error('[poll] Cycle error:', err.message);
    }
  }

  async function modelCycle() {
    try {
      // 1. Run probability models
      const estimates = await modelRunner.run();
      console.log(`[models] Generated ${estimates.length} estimates`);

      // 2. Detect mispricings
      const signals = detectMispricings(db, {
        minEdgePct: config.minEdgePct,
        minConfidence: config.minConfidence,
        minLiquidity: config.minLiquidity,
      });
      console.log(`[models] Found ${signals.length} mispricings`);

      // 3. Execute paper trades on signals
      if (signals.length > 0) {
        const bankroll = calculateBankroll(db, config.paperBankroll);
        const trades = executePaperTrades(db, signals, {
          startingBankroll: config.paperBankroll,
          kellyMultiplier: config.kellyFraction,
          maxPositionPct: config.maxPositionPct,
        });
        console.log(`[models] Opened ${trades.length} paper trades (bankroll: $${bankroll.toFixed(2)})`);
      }
    } catch (err) {
      console.error('[models] Cycle error:', err.message);
    }
  }

  // Run first poll, then brief pause before models to avoid rate limiting
  await pollCycle();
  await timing.delay(5000);
  await modelCycle();

  // Set up intervals
  const pollInterval = setInterval(pollCycle, config.marketPollIntervalMs);
  const modelInterval = setInterval(modelCycle, config.modelRunIntervalMs);

  // --- Graceful shutdown ---
  function shutdown() {
    console.log('[kalshi-trader] Shutting down...');
    running = false;
    clearInterval(pollInterval);
    clearInterval(modelInterval);
    server.close();
    close();
    process.exit(0);
  }

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  return { config, db, server };
}
