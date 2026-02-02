import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../server.js';
import { createDatabase } from '../db.js';

// We need supertest for HTTP testing
// Check if available, if not we'll mock
let supertest;
try {
  supertest = (await import('supertest')).default;
} catch {
  supertest = null;
}

describe('createApp', () => {
  let handle;
  let app;
  const config = {
    paperBankroll: 500,
    minEdgePct: 5,
    minConfidence: 0.6,
    port: 3001,
  };

  beforeEach(() => {
    handle = createDatabase();
    app = createApp({ db: handle.db, config });
  });

  afterEach(() => {
    if (handle) handle.close();
  });

  it('creates an express app', () => {
    expect(app).toBeDefined();
    expect(typeof app.get).toBe('function');
  });

  if (supertest) {
    describe('page routes', () => {
      it('GET / returns dashboard', async () => {
        const res = await supertest(app).get('/');
        expect(res.status).toBe(200);
        expect(res.text).toContain('Dashboard');
      });

      it('GET /markets returns markets page', async () => {
        const res = await supertest(app).get('/markets');
        expect(res.status).toBe(200);
        expect(res.text).toContain('Markets');
      });

      it('GET /markets with category filter', async () => {
        const { db } = handle;
        db.prepare("INSERT INTO markets (ticker, title, category, status, last_yes_price) VALUES (?, ?, ?, ?, ?)").run(
          'W-1', 'Weather Market', 'weather', 'active', 0.5
        );

        const res = await supertest(app).get('/markets?category=weather');
        expect(res.status).toBe(200);
        expect(res.text).toContain('Weather Market');
      });

      it('GET /portfolio returns portfolio page', async () => {
        const res = await supertest(app).get('/portfolio');
        expect(res.status).toBe(200);
        expect(res.text).toContain('Portfolio');
      });

      it('GET /analytics returns analytics page', async () => {
        const res = await supertest(app).get('/analytics');
        expect(res.status).toBe(200);
        expect(res.text).toContain('Analytics');
      });
    });

    describe('API routes', () => {
      it('GET /api/stats returns JSON stats', async () => {
        const res = await supertest(app).get('/api/stats');
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('totalTrades');
        expect(res.body).toHaveProperty('winRate');
      });

      it('GET /api/signals returns JSON signals', async () => {
        const res = await supertest(app).get('/api/signals');
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
      });

      it('GET /api/signals with custom params', async () => {
        const res = await supertest(app).get('/api/signals?limit=5&minEdge=3&minConfidence=0.5');
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
      });

      it('GET /api/bankroll returns bankroll info', async () => {
        const res = await supertest(app).get('/api/bankroll');
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('available');
        expect(res.body.available).toBe(500);
      });

      it('GET /api/trades returns trade list', async () => {
        const res = await supertest(app).get('/api/trades');
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
      });

      it('GET /api/trades with limit', async () => {
        const res = await supertest(app).get('/api/trades?limit=10');
        expect(res.status).toBe(200);
      });

      it('GET /api/markets returns market list', async () => {
        const res = await supertest(app).get('/api/markets');
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
      });

      it('GET /api/markets with category filter', async () => {
        const { db } = handle;
        db.prepare("INSERT INTO markets (ticker, category, status) VALUES (?, ?, ?)").run('M1', 'weather', 'active');
        db.prepare("INSERT INTO markets (ticker, category, status) VALUES (?, ?, ?)").run('M2', 'economics', 'active');

        const res = await supertest(app).get('/api/markets?category=weather');
        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(1);
        expect(res.body[0].category).toBe('weather');
      });
    });

    describe('with data', () => {
      it('dashboard shows signals when available', async () => {
        const { db } = handle;

        db.prepare("INSERT INTO markets (ticker, title, category, status, last_yes_price) VALUES (?, ?, ?, ?, ?)").run(
          'SIG-1', 'Signal Market', 'weather', 'active', 0.40
        );
        db.prepare("INSERT INTO model_estimates (ticker, timestamp, model_name, estimated_prob, confidence) VALUES (?, ?, ?, ?, ?)").run(
          'SIG-1', Date.now(), 'weather', 0.75, 0.85
        );

        const res = await supertest(app).get('/');
        expect(res.status).toBe(200);
        expect(res.text).toContain('SIG-1');
      });

      it('portfolio shows trades', async () => {
        const { db } = handle;

        db.prepare("INSERT INTO markets (ticker) VALUES (?)").run('T-1');
        db.prepare(`INSERT INTO paper_trades (ticker, opened_at, side, entry_price, contracts, cost_basis, resolution) VALUES (?, ?, ?, ?, ?, ?, 'open')`)
          .run('T-1', Date.now(), 'yes', 0.40, 10, 4.0);

        const res = await supertest(app).get('/portfolio');
        expect(res.status).toBe(200);
        expect(res.text).toContain('T-1');
      });
    });
  }
});
