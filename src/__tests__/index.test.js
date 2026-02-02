import { describe, it, expect, vi } from 'vitest';
import { main } from '../index.js';

describe('main', () => {
  it('returns a config object with expected properties', async () => {
    // Suppress console output during test
    vi.spyOn(console, 'log').mockImplementation(() => {});

    const config = await main();

    expect(config).toBeDefined();
    expect(config.kalshiApiBase).toBe('https://api.elections.kalshi.com/trade-api/v2');
    expect(config.paperBankroll).toBeGreaterThan(0);
    expect(config.port).toBeGreaterThan(0);

    vi.restoreAllMocks();
  });

  it('logs startup information', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await main();

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('[kalshi-trader] Starting'));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('API base:'));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Dashboard port:'));

    vi.restoreAllMocks();
  });
});
