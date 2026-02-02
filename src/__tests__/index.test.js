import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  close: vi.fn(),
  serverClose: vi.fn(),
  db: { prepare: vi.fn(() => ({ run: vi.fn(), get: vi.fn(), all: vi.fn(() => []) })) },
  listen: vi.fn(),
  ingest: vi.fn(),
  snapshot: vi.fn(),
  runAll: vi.fn(),
  detect: vi.fn(),
  execute: vi.fn(),
  bankroll: vi.fn(),
  resolve: vi.fn(),
  updateDaily: vi.fn(),
}));

const mockServer = { close: mocks.serverClose };
// Set defaults
mocks.listen.mockImplementation((port, cb) => { if (cb) cb(); return mockServer; });
mocks.ingest.mockResolvedValue({ upserted: 5, total: 100 });
mocks.snapshot.mockReturnValue(42);
mocks.runAll.mockResolvedValue([{ ticker: 'T1' }]);
mocks.detect.mockReturnValue([]);
mocks.execute.mockReturnValue([]);
mocks.bankroll.mockReturnValue(480);
mocks.resolve.mockReturnValue([]);

vi.mock('../db.js', () => ({
  createDatabase: vi.fn(() => ({ db: mocks.db, close: mocks.close })),
}));

vi.mock('../kalshi-client.js', () => ({
  createKalshiClient: vi.fn(() => ({})),
}));

vi.mock('../ingestion.js', () => ({ ingestMarkets: mocks.ingest }));
vi.mock('../snapshots.js', () => ({ snapshotAllActive: mocks.snapshot }));
vi.mock('../model-runner.js', () => ({ createModelRunner: vi.fn(() => ({ runAll: mocks.runAll })) }));
vi.mock('../mispricing.js', () => ({ detectMispricings: mocks.detect }));
vi.mock('../paper-trader.js', () => ({ executePaperTrades: mocks.execute, calculateBankroll: mocks.bankroll }));
vi.mock('../resolution.js', () => ({ resolveSettledTrades: mocks.resolve, updateDailyStats: mocks.updateDaily }));
vi.mock('../server.js', () => ({ createApp: vi.fn(() => ({ listen: mocks.listen })) }));

import { main } from '../index.js';

describe('main', () => {
  let origOn;

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    origOn = process.on;
    process.on = vi.fn();
    // Re-apply mock implementations after clearAllMocks
    mocks.listen.mockImplementation((port, cb) => { if (cb) cb(); return mockServer; });
    mocks.ingest.mockResolvedValue({ upserted: 5, total: 100 });
    mocks.snapshot.mockReturnValue(42);
    mocks.runAll.mockResolvedValue([{ ticker: 'T1' }]);
    mocks.detect.mockReturnValue([]);
    mocks.resolve.mockReturnValue([]);
    mocks.execute.mockReturnValue([]);
    mocks.bankroll.mockReturnValue(480);
  });

  afterEach(() => {
    process.on = origOn;
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('starts all services and returns config, db, and server', async () => {
    const result = await main();
    expect(result.config.kalshiApiBase).toBe('https://api.elections.kalshi.com/trade-api/v2');
    expect(result.config.paperBankroll).toBeGreaterThan(0);
    expect(result.db).toBe(mocks.db);
    expect(result.server).toBeDefined();
    expect(mocks.listen).toHaveBeenCalled();
  });

  it('logs startup information', async () => {
    await main();
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('[kalshi-trader] Starting'));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('API base:'));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Dashboard port:'));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('DB:'));
  });

  it('runs poll cycle: ingests, snapshots, resolves, updates daily stats', async () => {
    await main();
    expect(mocks.ingest).toHaveBeenCalled();
    expect(mocks.snapshot).toHaveBeenCalled();
    expect(mocks.resolve).toHaveBeenCalled();
    expect(mocks.updateDaily).toHaveBeenCalled();
  });

  it('runs model cycle: models and mispricings', async () => {
    await main();
    expect(mocks.runAll).toHaveBeenCalled();
    expect(mocks.detect).toHaveBeenCalled();
  });

  it('executes paper trades when signals found', async () => {
    mocks.detect.mockReturnValueOnce([{ ticker: 'T1', edge: 10 }]);
    await main();
    expect(mocks.execute).toHaveBeenCalled();
    expect(mocks.bankroll).toHaveBeenCalled();
  });

  it('logs when trades are resolved', async () => {
    mocks.resolve.mockReturnValueOnce([{ id: 1 }, { id: 2 }]);
    await main();
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Resolved 2 trades'));
  });

  it('handles poll cycle errors gracefully', async () => {
    mocks.ingest.mockRejectedValueOnce(new Error('API down'));
    await main();
    expect(console.error).toHaveBeenCalledWith('[poll] Cycle error:', 'API down');
  });

  it('handles model cycle errors gracefully', async () => {
    mocks.runAll.mockRejectedValueOnce(new Error('Model failed'));
    await main();
    expect(console.error).toHaveBeenCalledWith('[models] Cycle error:', 'Model failed');
  });

  it('registers SIGINT and SIGTERM handlers', async () => {
    await main();
    expect(process.on).toHaveBeenCalledWith('SIGINT', expect.any(Function));
    expect(process.on).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
  });

  it('shutdown closes server and database', async () => {
    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {});
    await main();
    const handler = process.on.mock.calls.find(c => c[0] === 'SIGINT')[1];
    handler();
    expect(mocks.serverClose).toHaveBeenCalled();
    expect(mocks.close).toHaveBeenCalled();
    expect(mockExit).toHaveBeenCalledWith(0);
    mockExit.mockRestore();
  });
});
