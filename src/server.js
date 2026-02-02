/**
 * Express web dashboard server.
 * Serves the web UI for monitoring markets, signals, and portfolio.
 */

import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { getTopSignals } from './mispricing.js';
import { getOpenTrades, getAllTrades, calculateBankroll } from './paper-trader.js';
import { getPerformanceStats } from './resolution.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Create the Express app with all routes.
 * @param {object} opts
 * @param {import('better-sqlite3').Database} opts.db
 * @param {object} opts.config
 * @returns {import('express').Express}
 */
export function createApp({ db, config }) {
  const app = express();

  // View engine setup
  app.set('view engine', 'ejs');
  app.set('views', join(__dirname, '..', 'views'));

  // Static files
  app.use(express.static(join(__dirname, '..', 'public')));

  // --- Pages ---

  /** Dashboard home */
  app.get('/', (req, res) => {
    const stats = getPerformanceStats(db);
    const signals = getTopSignals(db, {
      limit: 10,
      minEdgePct: config.minEdgePct,
      minConfidence: config.minConfidence,
    });
    const bankroll = calculateBankroll(db, config.paperBankroll);

    res.render('index', { stats, signals, bankroll, config });
  });

  /** Markets list */
  app.get('/markets', (req, res) => {
    const category = req.query.category || null;
    const status = req.query.status || 'active';

    let query = "SELECT * FROM markets WHERE status = ?";
    const params = [status];

    if (category) {
      query += " AND category = ?";
      params.push(category);
    }

    query += " ORDER BY last_updated DESC LIMIT 200";

    const markets = db.prepare(query).all(...params);
    const categories = db.prepare(
      "SELECT DISTINCT category FROM markets WHERE category IS NOT NULL ORDER BY category"
    ).all().map(r => r.category);

    res.render('markets', { markets, categories, filters: { category, status } });
  });

  /** Portfolio view */
  app.get('/portfolio', (req, res) => {
    const openTrades = getOpenTrades(db);
    const allTrades = getAllTrades(db, { limit: 50 });
    const bankroll = calculateBankroll(db, config.paperBankroll);
    const stats = getPerformanceStats(db);

    res.render('portfolio', { openTrades, allTrades, bankroll, stats });
  });

  /** Analytics view */
  app.get('/analytics', (req, res) => {
    const stats = getPerformanceStats(db);
    const dailyStats = db.prepare(
      "SELECT * FROM daily_stats ORDER BY date DESC LIMIT 30"
    ).all();

    res.render('analytics', { stats, dailyStats });
  });

  // --- API Routes ---

  app.get('/api/stats', (req, res) => {
    res.json(getPerformanceStats(db));
  });

  app.get('/api/signals', (req, res) => {
    const signals = getTopSignals(db, {
      limit: parseInt(req.query.limit || '20', 10),
      minEdgePct: parseFloat(req.query.minEdge || String(config.minEdgePct)),
      minConfidence: parseFloat(req.query.minConfidence || String(config.minConfidence)),
    });
    res.json(signals);
  });

  app.get('/api/bankroll', (req, res) => {
    res.json(calculateBankroll(db, config.paperBankroll));
  });

  app.get('/api/trades', (req, res) => {
    const limit = parseInt(req.query.limit || '50', 10);
    res.json(getAllTrades(db, { limit }));
  });

  app.get('/api/markets', (req, res) => {
    const status = req.query.status || 'active';
    const category = req.query.category || null;
    let query = "SELECT * FROM markets WHERE status = ?";
    const params = [status];
    if (category) {
      query += " AND category = ?";
      params.push(category);
    }
    query += " ORDER BY last_updated DESC LIMIT 200";
    res.json(db.prepare(query).all(...params));
  });

  return app;
}
