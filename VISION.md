# Kalshi Prediction Market Paper Trader

## What Is This?

A paper-trading system that monitors Kalshi prediction markets, builds probabilistic models to identify mispriced contracts, simulates a trading strategy, and tracks P&L — all without risking real money.

The goal: **validate whether systematic prediction market trading is a viable income stream before deploying real capital.**

---

## The Thesis

Kalshi is a CFTC-regulated prediction market exchange where binary contracts trade between $0.01 and $0.99, paying $1.00 if the event occurs. The price roughly equals the market's implied probability.

Markets span weather, economics, politics, sports, and world events. Many of these have **verifiable base rates or consensus forecasts** that the crowd doesn't fully price in. Examples:

- **Weather:** "Will NYC hit 90°F this week?" → NOAA forecast data gives a probability the crowd often over/under-shoots
- **Economics:** "Will CPI come in above 3%?" → Bloomberg consensus, Cleveland Fed nowcast, bond market implied inflation all provide reference probabilities
- **Fed decisions:** "Will the Fed cut rates in March?" → Fed funds futures give precise implied probabilities that may diverge from Kalshi pricing
- **Recurring events:** "Will GDP growth exceed 2%?" → Historical base rates + leading indicators

The edge isn't speed (like crypto arb) — it's **informational**. Build models that estimate probabilities more accurately than the crowd, bet when your model diverges from market price, and compound over hundreds of bets.

### Why Kalshi?

- **Legal in the US.** CFTC-regulated, no geoblock workarounds needed.
- **Section 1256 tax treatment.** 60% long-term / 40% short-term capital gains regardless of holding period. Way better than crypto's 100% short-term.
- **Public API.** Full REST API, no auth needed for market data. Auth for trading.
- **Binary = simple.** Every contract is yes/no, $0-$1. No complex option Greeks.
- **Low capital requirement.** Contracts are $0.01-$0.99 each. Can validate with $500.
- **Verifiable edge.** Unlike poker or sports, many markets have objectively knowable base rates.
- **No account limiting.** Exchange model — you're trading against other users, not against the house.

---

## How It Works

### The Real Strategy (Phase 2 — future, after validation)

1. Monitor all active Kalshi markets continuously
2. For each market category, apply the appropriate model (weather → NOAA, econ → consensus, etc.)
3. When model probability diverges from market price by >X%, take a position
4. Manage portfolio: position sizing via Kelly criterion, diversification across categories
5. Track resolution P&L and refine models

### This Project: The Paper Trader (Phase 1)

Read-only monitoring and simulation. No real money.

1. **Ingest** all active Kalshi markets via API
2. **Categorize** markets by type (weather, economics, politics, sports, etc.)
3. **Model** probability estimates using external data sources where available
4. **Detect** mispricings where model probability ≠ market price beyond a threshold
5. **Simulate** paper trades with position sizing
6. **Track** resolution outcomes and cumulative P&L
7. **Dashboard** showing live markets, model vs market, portfolio, and analytics

---

## Architecture

```
┌──────────────────────────────────────────────┐
│          Market Ingestion Service              │
│  Polls Kalshi API every 60 seconds             │
│  Tracks: all active markets, prices, volume    │
│  Stores snapshots for price history            │
│  Categorizes markets by series/event type      │
└──────────────────┬───────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────┐
│           Probability Models                   │
│  Weather: NOAA API forecasts                   │
│  Economics: FRED data, consensus estimates      │
│  Fed rates: CME FedWatch / fed funds futures   │
│  Base rate: historical resolution rates         │
│  Sentiment: news/social signals (future)        │
│  Each model outputs P(yes) with confidence     │
└──────────────────┬───────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────┐
│        Mispricing Detection Engine             │
│  Compare model P(yes) vs market price          │
│  Filter: |model - market| > threshold          │
│  Score by: edge size × confidence × liquidity  │
│  Kelly criterion position sizing               │
└──────────────┬───────────┬───────────────────┘
               │           │
               ▼           ▼
        ┌──────────┐ ┌──────────────┐
        │ SQLite   │ │ Telegram Bot │
        │ Database │ │ Alerts       │
        └────┬─────┘ └──────────────┘
             │
             ▼
┌──────────────────────────────────────────────┐
│          Express Web Dashboard                 │
│  All active markets with model estimates       │
│  Mispricing alerts / trade signals             │
│  Paper portfolio: positions & P&L              │
│  Resolution tracker: model accuracy by cat     │
│  Cumulative profit chart                       │
│  Category breakdown: which domains are edge    │
└──────────────────────────────────────────────┘
```

---

## Tech Stack

| Component | Choice | Rationale |
|---|---|---|
| Runtime | Node.js | Consistent with other projects |
| Market Data | Kalshi REST API (free, no auth) | Official, reliable, well-structured |
| Weather Models | NOAA Weather API (free) | Authoritative US weather forecasts |
| Econ Data | FRED API (free with key) | Federal Reserve economic data |
| Database | SQLite (better-sqlite3) | Simple, portable, proven |
| Web UI | Express + EJS | Fast to build, same pattern as deal tracker |
| Charts | Chart.js | Lightweight, no build step |
| Alerts | Telegram Bot API | Direct HTTP |
| Hosting | Railway | Free tier sufficient |

---

## Data Model

### markets
Snapshot of all tracked Kalshi markets.

| Column | Type | Description |
|---|---|---|
| ticker | TEXT PK | Kalshi market ticker |
| event_ticker | TEXT | Parent event |
| series_ticker | TEXT | Series (e.g., KXWEATHER) |
| category | TEXT | Weather, Economics, Politics, etc. |
| title | TEXT | Human-readable market title |
| subtitle | TEXT | Additional context |
| status | TEXT | active, closed, settled |
| close_time | INTEGER | When trading ends (unix ms) |
| expiration_time | INTEGER | When market resolves |
| result | TEXT | yes, no, or NULL if unresolved |
| last_yes_price | REAL | Last traded yes price (0-1) |
| last_updated | INTEGER | When we last polled this |

### price_snapshots
Price history for tracked markets (for movement analysis).

| Column | Type | Description |
|---|---|---|
| id | INTEGER PK | Auto-increment |
| ticker | TEXT FK | Market ticker |
| timestamp | INTEGER | Unix timestamp ms |
| yes_bid | REAL | Best yes bid |
| yes_ask | REAL | Best yes ask |
| last_price | REAL | Last trade price |
| volume | INTEGER | Total contracts traded |
| open_interest | INTEGER | Open contracts |

### model_estimates
Probability estimates from our models.

| Column | Type | Description |
|---|---|---|
| id | INTEGER PK | Auto-increment |
| ticker | TEXT FK | Market ticker |
| timestamp | INTEGER | When estimate was generated |
| model_name | TEXT | Which model produced this |
| estimated_prob | REAL | Model's P(yes) (0-1) |
| confidence | REAL | Model's confidence (0-1) |
| data_sources | TEXT | JSON array of sources used |
| reasoning | TEXT | Brief explanation |

### paper_trades
Simulated position entries.

| Column | Type | Description |
|---|---|---|
| id | INTEGER PK | Auto-increment |
| ticker | TEXT FK | Market ticker |
| opened_at | INTEGER | When position opened |
| closed_at | INTEGER | When closed (NULL if open) |
| side | TEXT | 'yes' or 'no' |
| entry_price | REAL | Price paid per contract |
| exit_price | REAL | Price sold or resolution value |
| contracts | INTEGER | Number of contracts |
| cost_basis | REAL | Total invested |
| revenue | REAL | Total returned |
| profit | REAL | revenue - cost_basis |
| profit_pct | REAL | Return on cost basis |
| model_edge | REAL | Model prob - market price at entry |
| category | TEXT | Market category |
| resolution | TEXT | 'win', 'loss', 'open', 'sold' |

### daily_stats
Aggregated daily performance.

| Column | Type | Description |
|---|---|---|
| date | TEXT PK | YYYY-MM-DD |
| markets_tracked | INTEGER | Active markets monitored |
| signals_generated | INTEGER | Mispricings detected |
| trades_opened | INTEGER | New paper positions |
| trades_resolved | INTEGER | Positions that settled |
| daily_pnl | REAL | Day's P&L |
| cumulative_pnl | REAL | Running total |
| win_rate | REAL | % of resolved trades profitable |
| avg_edge | REAL | Average model edge on trades |
| best_category | TEXT | Most profitable category |

---

## Probability Models (Phase 1)

Start with the categories where external data gives a clear reference probability:

### 1. Weather Model
- **Source:** NOAA Weather API (api.weather.gov) — free, no key needed
- **Markets:** Temperature thresholds, precipitation, snowfall
- **Method:** Compare NOAA probabilistic forecast (e.g., "70% chance of rain") directly to Kalshi market price
- **Edge:** NOAA forecasts are quite good. Crowd often overreacts to recent weather or anchors on seasonal norms

### 2. Economics / Fed Model
- **Source:** FRED API (Federal Reserve Economic Data) — free with API key
- **Markets:** CPI, GDP, unemployment, Fed rate decisions
- **Method:** Compare Cleveland Fed inflation nowcast, GDP nowcast, CME FedWatch implied probabilities to Kalshi prices
- **Edge:** Kalshi retail crowd may lag behind institutional consensus by hours/days

### 3. Base Rate Model
- **Source:** Kalshi's own historical data (track resolution rates by series)
- **Markets:** Any recurring series (daily weather, weekly events)
- **Method:** For series with 50+ historical resolutions, use empirical base rate as prior. Flag markets priced far from base rate without clear reason.
- **Edge:** Recency bias, availability heuristic — crowd overweights recent events

### 4. Simple Contrarian Model (experimental)
- **Source:** Kalshi volume + price movement data
- **Markets:** Any with sufficient volume
- **Method:** When prices move sharply on low volume, model probability from pre-move baseline
- **Edge:** Low-volume markets can be moved by single large orders. Mean reversion.

---

## Configuration

```env
# === Kalshi API ===
KALSHI_API_BASE=https://api.elections.kalshi.com/trade-api/v2
# No auth needed for market data reads
# Auth for future real trading:
# KALSHI_EMAIL=
# KALSHI_PASSWORD=

# === External Data Sources ===
FRED_API_KEY=           # Free from fredaccount.stlouisfed.org
# NOAA is free, no key needed

# === Monitoring ===
MARKET_POLL_INTERVAL_MS=60000
MODEL_RUN_INTERVAL_MS=300000
PRICE_SNAPSHOT_INTERVAL_MS=300000

# === Trading Parameters ===
PAPER_BANKROLL=500
MIN_EDGE_PCT=5              # Minimum |model - market| to signal
MIN_CONFIDENCE=0.6          # Minimum model confidence
MAX_POSITION_PCT=5          # Max % of bankroll per trade
KELLY_FRACTION=0.25         # Quarter-Kelly for safety
MIN_LIQUIDITY=100           # Minimum open interest

# === Alerts (Telegram) ===
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
ALERT_MIN_EDGE_PCT=10
ALERT_COOLDOWN_SECONDS=600

# === Web Dashboard ===
PORT=3001
```

---

## Position Sizing: Kelly Criterion

For each signal, optimal bet size is:

```
f* = (p * b - q) / b

where:
  p = model's estimated probability of winning
  b = net odds (payout / cost - 1)
  q = 1 - p
  f* = fraction of bankroll to bet
```

For a binary contract priced at $0.40 (market says 40% likely), if our model says 55%:
- Cost = $0.40, Payout = $1.00, so b = ($1.00 - $0.40) / $0.40 = 1.5
- f* = (0.55 × 1.5 - 0.45) / 1.5 = 0.25
- Quarter-Kelly: bet 6.25% of bankroll

We use **quarter-Kelly** (f*/4) because:
- Model estimates have uncertainty
- Bankroll preservation > growth rate
- Variance reduction matters psychologically

---

## Success Scenarios

### 🟢 Strong Signal — "Fund it"
- **100+ resolved bets** over 4-6 weeks
- **Win rate >55%** on binary bets (above breakeven including fees)
- **Positive cumulative P&L** on $500 paper bankroll
- Clear category edge: at least one model consistently outperforms market
- **Projected annual return: 50-100%+ on deployed capital**
- **Action:** Fund real Kalshi account with $500-2,000, trade live at small size

### 🟡 Moderate Signal — "Refine models"
- 50-100 resolved bets, win rate 52-55%
- Slightly positive P&L but not statistically significant
- Some categories profitable, others not
- Models show promise but need tuning
- **Action:** Add more data sources, refine models, extend paper trading another month

### 🔴 Weak Signal — "Markets are efficient"
- Win rate ≤52% or negative P&L after 100+ bets
- No category shows consistent edge
- Model estimates don't outperform market price
- **Action:** Kalshi crowd is too smart for simple models. Either (a) invest in more sophisticated models (ML, ensemble methods), or (b) shift to event-driven only (trade around data releases where you can be faster), or (c) shelve and focus effort elsewhere

### 🔥 Category Jackpot
- One specific category (e.g., weather) shows 60%+ win rate
- Other categories are efficient (no edge)
- **Action:** Specialize. Build a deep model for the profitable category. Ignore the rest.

---

## Tax Treatment

Kalshi contracts are **Section 1256 contracts** under CFTC regulation:
- 60% of gains taxed as **long-term capital gains** (max 20%)
- 40% of gains taxed as **short-term capital gains** (ordinary income rate)
- **Blended rate: ~26.8%** at top bracket (vs 37% all-short-term)
- This is significantly better than crypto (100% short-term) or ordinary income
- Losses can be **carried back 3 years** against prior 1256 gains
- Mark-to-market at year end (open positions are taxed as if closed Dec 31)

---

## Phases

### Phase 1: Paper Trader (THIS PROJECT)
- Monitor markets, build models, simulate trades
- Zero capital at risk
- Duration: 4-6 weeks (need 100+ resolved bets for statistical significance)
- Cost: $0-5/month (free API tiers + Railway)
- Deliverable: Data-driven go/no-go with model accuracy stats

### Phase 2: Small Live Trading (if Phase 1 shows Strong/Moderate signal)
- Fund Kalshi account with $500-2,000
- Execute real trades based on model signals
- Validate: real execution matches paper P&L
- Duration: 4-8 weeks
- Cost: $500-2,000 (at-risk capital)

### Phase 3: Scale (if Phase 2 validates)
- Increase bankroll to $10-50K
- Add more models, more categories
- Full automation with portfolio management
- Target: 50-100% annual return on capital deployed

---

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Model overfit to historical data | Out-of-sample testing, walk-forward validation |
| Kalshi API changes | Abstract behind interface, version-pin endpoints |
| Low liquidity in some markets | Min liquidity threshold, skip illiquid markets |
| Fees eat edge | Track fee-adjusted P&L from day one (Kalshi fees are ~1-2%) |
| Kalshi regulatory changes | CFTC-regulated, but monitor for rule changes |
| Model probabilities are just wrong | That's what the paper trading phase is for — fail cheap |
| Crowd gets smarter over time | Edge compression is real. First-mover advantage matters. |

---

## API Reference

### Key Endpoints (no auth needed)

```
GET /trade-api/v2/events
  ?limit=100&status=open
  → List all active events (parent categories)

GET /trade-api/v2/markets
  ?limit=200&status=open&event_ticker=KXWEATHER-26FEB03
  → List markets under an event

GET /trade-api/v2/markets/{ticker}
  → Single market detail (price, volume, times)

GET /trade-api/v2/markets/{ticker}/orderbook
  → Live order book (bids/asks)

GET /trade-api/v2/series/{series_ticker}
  → Series metadata
```

### Base URL
```
https://api.elections.kalshi.com/trade-api/v2
```

---

## Out of Scope (Phase 1)

- Real Kalshi account integration or trading
- Complex ML models (start with simple reference data)
- Options-style Greeks or hedging
- Multi-exchange arbitrage (Kalshi vs Polymarket)
- Social/news sentiment analysis (Phase 2+)
- Authentication or multi-user support

---

## Key Questions This Project Answers

1. Can simple probabilistic models (NOAA, FRED, base rates) outperform Kalshi market prices?
2. Which market categories have the most persistent mispricings?
3. What's the optimal position sizing for a small bankroll?
4. What win rate and edge can we realistically achieve?
5. Is prediction market trading a viable income stream at $500-50K scale?
6. Where should we focus model-building effort for maximum edge?

**If the data says yes → fund the account and scale.**
**If the data says no → we lost nothing and learned something.**
