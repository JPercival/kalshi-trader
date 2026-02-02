import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createDatabase } from '../db.js';
import { createModelRunner } from '../model-runner.js';

describe('createModelRunner', () => {
  let handle;
  const config = { minConfidence: 0.6 };

  beforeEach(() => {
    handle = createDatabase();
  });

  afterEach(() => {
    if (handle) handle.close();
  });

  it('registers and returns models', () => {
    const runner = createModelRunner({ db: handle.db, config });

    const model = {
      name: 'test-model',
      categories: ['weather'],
      estimate: async () => null,
    };

    runner.register(model);
    expect(runner.getModels()).toHaveLength(1);
    expect(runner.getModels()[0].name).toBe('test-model');
  });

  it('getModels returns a copy', () => {
    const runner = createModelRunner({ db: handle.db, config });
    runner.register({ name: 'm1', categories: [], estimate: async () => null });

    const models = runner.getModels();
    models.push({ name: 'injected' });
    expect(runner.getModels()).toHaveLength(1);
  });

  it('runs models against matching markets', async () => {
    const { db } = handle;
    db.prepare("INSERT INTO markets (ticker, status, category) VALUES (?, ?, ?)").run('W-1', 'active', 'weather');

    const runner = createModelRunner({ db, config });
    runner.register({
      name: 'weather',
      categories: ['weather'],
      estimate: async (market) => ({
        ticker: market.ticker,
        estimatedProb: 0.75,
        confidence: 0.9,
        dataSources: ['NOAA'],
        reasoning: 'Forecast data',
      }),
    });

    const result = await runner.run();
    expect(result.estimates).toBe(1);
    expect(result.errors).toBe(0);

    const est = db.prepare('SELECT * FROM model_estimates WHERE ticker = ?').get('W-1');
    expect(est.estimated_prob).toBe(0.75);
    expect(est.model_name).toBe('weather');
  });

  it('skips models that dont match market category', async () => {
    const { db } = handle;
    db.prepare("INSERT INTO markets (ticker, status, category) VALUES (?, ?, ?)").run('P-1', 'active', 'politics');

    const estimateFn = vi.fn(async () => null);
    const runner = createModelRunner({ db, config });
    runner.register({
      name: 'weather',
      categories: ['weather'],
      estimate: estimateFn,
    });

    const result = await runner.run();
    expect(result.estimates).toBe(0);
    expect(estimateFn).not.toHaveBeenCalled();
  });

  it('runs models with empty categories against all markets', async () => {
    const { db } = handle;
    db.prepare("INSERT INTO markets (ticker, status, category) VALUES (?, ?, ?)").run('X-1', 'active', 'politics');

    const runner = createModelRunner({ db, config });
    runner.register({
      name: 'universal',
      categories: [],
      estimate: async (market) => ({
        ticker: market.ticker,
        estimatedProb: 0.5,
        confidence: 0.5,
        dataSources: [],
        reasoning: 'Base rate',
      }),
    });

    const result = await runner.run();
    expect(result.estimates).toBe(1);
  });

  it('skips null estimates from models', async () => {
    const { db } = handle;
    db.prepare("INSERT INTO markets (ticker, status, category) VALUES (?, ?, ?)").run('N-1', 'active', 'weather');

    const runner = createModelRunner({ db, config });
    runner.register({
      name: 'weather',
      categories: ['weather'],
      estimate: async () => null,
    });

    const result = await runner.run();
    expect(result.estimates).toBe(0);
    expect(result.errors).toBe(0);
  });

  it('skips invalid estimates', async () => {
    const { db } = handle;
    db.prepare("INSERT INTO markets (ticker, status, category) VALUES (?, ?, ?)").run('B-1', 'active', 'weather');

    const runner = createModelRunner({ db, config });
    runner.register({
      name: 'bad-model',
      categories: ['weather'],
      estimate: async () => ({
        ticker: 'B-1',
        estimatedProb: 2.0, // invalid
        confidence: 0.5,
        dataSources: [],
        reasoning: 'Bad',
      }),
    });

    const result = await runner.run();
    expect(result.estimates).toBe(0);
    expect(result.errors).toBe(0);
  });

  it('counts errors from throwing models', async () => {
    const { db } = handle;
    db.prepare("INSERT INTO markets (ticker, status, category) VALUES (?, ?, ?)").run('E-1', 'active', 'weather');

    vi.spyOn(console, 'error').mockImplementation(() => {});

    const runner = createModelRunner({ db, config });
    runner.register({
      name: 'crasher',
      categories: ['weather'],
      estimate: async () => { throw new Error('API down'); },
    });

    const result = await runner.run();
    expect(result.errors).toBe(1);
    expect(result.estimates).toBe(0);

    vi.restoreAllMocks();
  });

  it('skips non-active markets', async () => {
    const { db } = handle;
    db.prepare("INSERT INTO markets (ticker, status, category) VALUES (?, ?, ?)").run('CL-1', 'closed', 'weather');

    const estimateFn = vi.fn(async () => null);
    const runner = createModelRunner({ db, config });
    runner.register({ name: 'weather', categories: ['weather'], estimate: estimateFn });

    const result = await runner.run();
    expect(result.estimates).toBe(0);
    expect(estimateFn).not.toHaveBeenCalled();
  });

  it('returns zeros when no markets exist', async () => {
    const runner = createModelRunner({ db: handle.db, config });
    runner.register({ name: 'test', categories: [], estimate: async () => null });

    const result = await runner.run();
    expect(result.estimates).toBe(0);
    expect(result.errors).toBe(0);
  });
});
