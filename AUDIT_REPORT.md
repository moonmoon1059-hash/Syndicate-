# MOONSCANNER — MASTER PROJECT AUDIT REPORT
**Phase 0: Comprehensive Read-Only Codebase Audit & System Inspection**
*Prepared by Lead Software Architect, Senior Full-Stack Engineer, Quantitative Intelligence Engineer & Deployment Engineer*

---

## 1. Executive Summary

MoonScanner is an advanced, full-stack cryptocurrency market intelligence, quantitative technical analysis, chart pattern detection, and automated trade signal generation platform. The system is designed to evolve into a triple-deliverable ecosystem:
1. **A high-performance production Web Application** running on cloud infrastructure.
2. **An installable, standalone Android APK** offering native-like mobile responsiveness and zero credential leaks.
3. **A clean, modular, buyer-ready source code repository** with institutional documentation, automated testing, and seamless vendor handoff capabilities.

This Phase 0 Audit provides an exhaustive, read-only architectural evaluation of the current codebase, identifying foundational strengths, architectural bottlenecks, data provider couplings, mathematical limitations, historical revisions, and root-cause diagnoses for critical defects (notably the **TP1/TP2/TP3 duplication bug** and **signal state instability**).

---

## 2. Current Project Architecture

The current project employs a decoupled full-stack TypeScript architecture:
- **Client Tier**: Single Page Application (SPA) powered by **React 19**, **Vite 6**, **Tailwind CSS v4**, **Lucide React** icons, and **Motion** (Framer Motion) animations.
- **Server Tier**: **Node.js** with **Express 4.21** providing RESTful intelligence endpoints, background market scanner loops, and technical analysis calculation engines.
- **Data Ingestion**: Multi-layer polling routines communicating with external exchange REST/WebSocket endpoints (primarily Binance spot/futures) and news aggregation feeds.
- **Analytical Pipeline**:
  $$\text{Exchange OHLCV} \longrightarrow \text{Technical Indicators} \longrightarrow \text{Pattern / Structure Heuristics} \longrightarrow \text{Signal Scorer} \longrightarrow \text{Tracker / State Cache} \longrightarrow \text{REST API} \longrightarrow \text{React UI}$$

---

## 3. Frontend Architecture

### 3.1 Technology Stack & Entry Points
- **Framework**: React 19 (Strict Mode enabled), TypeScript ~5.8.
- **Bundler & Build Tool**: Vite 6 with `@tailwindcss/vite` plugin.
- **Entry Points**: `/index.html` $\rightarrow$ `/src/main.tsx` $\rightarrow$ `/src/App.tsx`.
- **Global Styling**: `/src/index.css` via `@import "tailwindcss";`.

### 3.2 Component Hierarchy & Screen Architecture
The user interface is structured across four primary viewports navigated via bottom/header navigation tabs:
1. **Home / Dashboard (`HomeScreen.tsx`)**: Market overview, BTC regime gauge, top intelligence picks, active alert counter, and quick signal cards.
2. **Signals Screener (`SignalsScreen.tsx`)**: Filterable signal feeds (LONG/SHORT/ALL, timeframe selector, minimum MoonScore slider, status filters: Active, Triggered, TP Hit, SL Hit).
3. **News Intelligence (`NewsScreen.tsx`)**: Aggregated news feed with entity tagging, sentiment badges (Bullish/Bearish/Neutral), and impact scores.
4. **Radar / Screener (`RadarScreen.tsx`)**: Multi-asset technical radar matrix displaying RSI, MACD, Volume breakout, and Trend bias across monitored pairs.
5. **Settings & Configurations (`SettingsScreen.tsx`)**: Scan interval settings, risk tolerance, alert thresholds, and API status monitoring.

### 3.3 Modal & Overlay Architecture
- `SignalDetailModal.tsx`: Comprehensive trade breakdown (Entry zone, Stop Loss, Multi-level Take Profits, Risk/Reward ratio, Confluence checklist, Interactive Candlestick chart with overlay targets).
- `NewsModal.tsx`: Full-article summary, AI entity analysis, catalyst breakdown, and market impact prediction.
- `RadarDetailModal.tsx`: In-depth multi-timeframe indicator matrix and support/resistance breakdown for individual coins.
- `AlertCenterModal.tsx`: Notification history, price alerts, and system health status.

### 3.4 State Management & API Communication
- **Context**: Centralized `AppContext.tsx` managing global states (`signals`, `activeSignals`, `news`, `marketStats`, `scannerStatus`, `selectedSignal`, `filters`, `preferences`).
- **Communication Layer**: `/src/services/api.ts` executing HTTP requests with polling intervals (5s–30s) against `/api/signals`, `/api/scan`, `/api/market-data`, and `/api/news`.

### 3.5 UI Component File Mapping
| UI Component | File Path | Functional Responsibility |
| :--- | :--- | :--- |
| **Signal Cards** | `/src/components/SignalCard.tsx` | Visual display of active LONG/SHORT setups, MoonScore, Timeframe, Entry, TP/SL summary |
| **Signal Details Modal** | `/src/screens/SignalDetailModal.tsx` | Expanded setup parameters, TP1/TP2/TP3 target matrix, R:R calculation, chart overlay |
| **Candlestick Chart** | `/src/components/CandlestickChart.tsx` | Custom SVG/Canvas candlestick visualizer with horizontal price levels and pattern overlay |
| **MoonScore Gauge** | `/src/components/MoonScoreGauge.tsx` | Radial confidence visualizer (0–100 score with dynamic color gradient) |
| **Intelligence Pipeline** | `/src/components/IntelligencePipeline.tsx` | Multi-factor confirmation checklist (Trend, Momentum, Volume, Derivatives, News) |
| **Data State Badge** | `/src/components/DataStateBadge.tsx` | Real-time connection indicator (Live, Cached, Stale, Error) |
| **Status Badge** | `/src/components/StatusBadge.tsx` | Signal status pill (ACTIVE, TRIGGERED, TP1_HIT, TP2_HIT, TP3_HIT, STOPPED_OUT, EXPIRED) |

---

## 4. Backend Architecture

### 4.1 Server Execution Model
- **Server Entry**: `/server.ts` running Express on host `0.0.0.0` and port `3000`.
- **API Routing**: Express router hosting endpoints under `/api/*`:
  - `GET /api/health`: Healthcheck and uptime probe.
  - `GET /api/signals`: Fetch active and historic trading signals.
  - `POST /api/scan`: Trigger immediate multi-coin market evaluation.
  - `GET /api/market/:symbol`: Real-time Kline/OHLCV data, 24h ticker, and derivatives telemetry.
  - `GET /api/news`: Curated crypto news feed with sentiment metadata.
  - `GET /api/radar`: Cross-market multi-timeframe radar scoring.
  - `GET /api/tracker/stats`: Cumulative win rate, profit factor, average R:R, and outcome distribution.

### 4.2 Core Service Modules
- `/server/cryptoService.ts`: Market data fetching, REST proxying, kline aggregation, and exchange integration.
- `/server/technicalAnalysis.ts`: Mathematical indicator library (EMA, RSI, MACD, ATR, Bollinger Bands, Stochastic, VWAP, Pivot Points) and pattern recognition heuristics.
- `/server/signalEngine.ts`: Signal creation pipeline, confluence scoring, entry/SL/TP calculation, and filter thresholds.
- `/server/signalTracker.ts`: Signal lifecycle state machine, real-time price monitoring, target hit detection, and performance tracking.
- `/server/newsService.ts` & `/server/newsIntelligenceEngine.ts`: News scraping/fetching, entity extraction, sentiment scoring, and market catalyst correlation.
- `/server/advancedMarketData.ts`: Derivatives metrics (Open Interest, Funding Rates, Long/Short ratios, Taker Buy/Sell volume).

---

## 5. Market Data Architecture & Global Provider Analysis

### 5.1 Current Data Provider Inventory
An audit of all API endpoints and network calls reveals the following current footprint:

| Provider | Integration Type | Data Provided | Status in Code |
| :--- | :--- | :--- | :--- |
| **Binance (Spot)** | REST (`api.binance.com`) | OHLCV Klines, 24h Ticker, Order Book Depth | Primary (Hardcoded endpoints) |
| **Binance (Futures)** | REST (`fapi.binance.com`) | Open Interest, Funding Rate, Long/Short Ratio | Primary for Derivatives |
| **CoinGecko** | REST (`api.coingecko.com`) | Coin metadata, global market cap, 24h volume | Partial / Secondary fallback |
| **CryptoCompare** | REST (`min-api.cryptocompare.com`) | News feed aggregation, multi-source news | Primary News Provider |
| **Bybit** | — | — | **Missing** (No adapter) |
| **OKX** | — | — | **Missing** (No adapter) |
| **Coinbase** | — | — | **Missing** (No adapter) |
| **Kraken** | — | — | **Missing** (No adapter) |
| **DexScreener** | — | — | **Missing** (No DEX/on-chain adapter) |

### 5.2 Binance Coupling & Risk Assessment
- **Current Limitation**: The codebase directly concatenates Binance REST URL strings (e.g., `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}`) inside `cryptoService.ts` and `advancedMarketData.ts`.
- **Architectural Risk**: Any regional IP block (e.g., US/EU regulatory restrictions), API rate limit HTTP 429, or exchange outage completely disables the application.
- **Recommended Future Pattern**: Provider-Agnostic Adapter Pattern:
  ```
  [ BinanceAdapter ]   [ BybitAdapter ]   [ OKXAdapter ]   [ CoinbaseAdapter ]
          \                  |                  |                 /
           \_________________v__________________v________________/
                                    |
                          [ IDataProvider Interface ]
                                    |
                        [ Unified Normalization Layer ]
                                    |
                          [ Data Quality Gate ]
                                    |
                         [ Core Intelligence Engine ]
  ```

---

## 6. Data Quality & Failover Analysis

### 6.1 Current Data Validation Checks
- **Candle Completeness**: Basic array length check (`candles.length >= 50`). Missing middle candles or gap detection is **not implemented**.
- **Stale Timestamp Checks**: Basic check comparing the latest candle close timestamp against `Date.now()`. Thresholds are static rather than interval-aware.
- **Inconsistent Zero/NaN Values**: Partial checks for zero division in indicator math, but no sanitization on inbound raw candle floats (high < low anomalies or zero volume spikes).
- **Rate Limit Handling**: Exponential backoff is rudimentary; HTTP 429 errors cause silent empty array returns rather than automated failover to alternate providers.

### 6.2 Target Data Quality Gate (Future Architecture)
A production-ready Data Quality Gate must enforce:
1. **Gap & Continuity Verification**: Verify consecutive candle timestamps strictly adhere to interval delta ($\Delta t = t_n - t_{n-1}$).
2. **High-Low-Open-Close Consistency**: Validate $Low \le \min(Open, Close)$ and $High \ge \max(Open, Close)$.
3. **Volume Sanity**: Eliminate synthetic negative or null volumes.
4. **Provider Cross-Verification**: Reconcile price divergence between multiple exchanges (> 0.5% spread triggers anomaly flag).

---

## 7. Technical Analysis & Market Structure Audit

### 7.1 Existing Technical Indicators (`technicalAnalysis.ts`)
- **Exponential Moving Averages (EMA)**: EMA 9, 20, 50, 200 calculated via recursive multiplier $\alpha = \frac{2}{N+1}$.
- **Relative Strength Index (RSI)**: 14-period Wilder smoothing with overbought/oversold boundaries (70/30).
- **Moving Average Convergence Divergence (MACD)**: Fast 12, Slow 26, Signal 9 with histogram momentum tracking.
- **Average True Range (ATR)**: 14-period true range for dynamic volatility calculation and SL/TP spacing.
- **Bollinger Bands**: 20-period SMA $\pm 2$ standard deviations with %B and Bandwidth calculations.
- **Volume Moving Average & Relative Volume (RVOL)**: 20-period volume SMA with breakout threshold ($RVOL > 1.5$).

### 7.2 Swing Points & Market Structure Audit
- **Swing High / Swing Low Detection**: Implemented via $N$-bar local extrema heuristic (checking if bar $i$ is higher than $i-2, i-1, i+1, i+2$).
- **Market Structure State**:
  - Higher Highs (HH) + Higher Lows (HL) $\rightarrow$ Bullish Structure.
  - Lower Highs (LH) + Lower Lows (LL) $\rightarrow$ Bearish Structure.
- **Break of Structure (BOS) & Change of Character (CHoCH)**: Partially drafted in heuristic backup versions, but currently lacks strict close-above-wick validation and multi-candle consolidation filtering.
- **Support & Resistance Clusters**: Basic horizontal pivot clustering based on swing high/low density.

---

## 8. Existing Chart Pattern Engine Audit

A rigorous inspection of all pattern recognition functions across `technicalAnalysis.ts`, `signalEngine.ts`, and historical versions reveals the following definitive inventory:

| Pattern Name | Classification | Implementation Status | Detector Function | Connected to Signals? | Connected to UI? | Breakout & Retest Validated? |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Double Bottom** | Reversal (Bullish) | **Partially Working** | `detectDoubleBottom()` | Yes (Heuristic) | Yes | Basic Breakout, No Retest |
| **Double Top** | Reversal (Bearish) | **Partially Working** | `detectDoubleTop()` | Yes (Heuristic) | Yes | Basic Breakdown, No Retest |
| **Ascending Triangle** | Continuation / Breakout | **Partially Working** | `detectAscendingTriangle()` | Yes | Yes | Slope check only |
| **Descending Triangle** | Continuation / Breakdown | **Partially Working** | `detectDescendingTriangle()` | Yes | Yes | Slope check only |
| **Symmetrical Triangle** | Bilateral | **Partially Working** | `detectSymmetricalTriangle()`| Yes | Yes | Converging slope check |
| **Bull Flag** | Continuation (Bullish) | **Partially Working** | `detectBullFlag()` | Yes | Yes | Pole + Consolidation ratio |
| **Bear Flag** | Continuation (Bearish) | **Partially Working** | `detectBearFlag()` | Yes | Yes | Pole + Consolidation ratio |
| **Rising Wedge** | Reversal (Bearish) | **Type / Basic Stub** | `detectRisingWedge()` | Partial | UI Tag only | No geometric touch validation |
| **Falling Wedge** | Reversal (Bullish) | **Type / Basic Stub** | `detectFallingWedge()` | Partial | UI Tag only | No geometric touch validation |
| **Head & Shoulders** | Reversal (Bearish) | **Type / Stub Only** | `detectHeadAndShoulders()` | No | UI Tag only | Incomplete 3-peak geometry |
| **Inv. Head & Shoulders** | Reversal (Bullish) | **Type / Stub Only** | `detectInvHeadAndShoulders()`| No | UI Tag only | Incomplete 3-trough geometry |
| **Triple Top** | Reversal (Bearish) | **Missing** | — | No | No | Not implemented |
| **Triple Bottom** | Reversal (Bullish) | **Missing** | — | No | No | Not implemented |
| **Bull Pennant** | Continuation (Bullish) | **Missing** (merged with Flag)| — | No | No | Not distinct |
| **Bear Pennant** | Continuation (Bearish) | **Missing** (merged with Flag)| — | No | No | Not distinct |
| **Rectangle / Box** | Continuation / Range | **Missing** | — | No | No | Not implemented |
| **Rising Channel** | Trend Continuation | **Missing** | — | No | No | Not implemented |
| **Falling Channel** | Trend Continuation | **Missing** | — | No | No | Not implemented |
| **Cup & Handle** | Continuation (Bullish) | **Missing** (Type only) | — | No | No | Not implemented |
| **Inv. Cup & Handle** | Continuation (Bearish) | **Missing** (Type only) | — | No | No | Not implemented |
| **Rounding Bottom** | Reversal (Bullish) | **Missing** | — | No | No | Not implemented |
| **Rounding Top** | Reversal (Bearish) | **Missing** | — | No | No | Not implemented |
| **Broadening Wedge** | Volatility Expansion | **Missing** | — | No | No | Not implemented |
| **Diamond Top / Bottom** | Reversal | **Missing** | — | No | No | Not implemented |

---

## 9. Existing Trendline Engine Audit

### 9.1 Algorithmic vs Visual Implementation
- **Current State**: Trendlines are generated primarily for UI visualization via linear regression or 2-point pivot connections.
- **Touch Detection**: True $\ge 3$-touch validation is **missing**. Currently, any 2 arbitrary swing points are joined to form a line.
- **Breakout & Retest Validation**: No mathematical retest verification (i.e., verifying price breaks the line, returns to test the line within $1\times \text{ATR}$, rejects with a rejection wick, and continues in breakout direction).
- **Multi-Timeframe Trendline Projection**: Not connected across 4H $\rightarrow$ 1H $\rightarrow$ 15M $\rightarrow$ 5M.

---

## 10. Signal Engine & TP/SL/Entry Architecture

### 10.1 Current Signal Generation Workflow
1. **Market Scanner Loop**: Iterates through top cryptocurrency pairs (BTC, ETH, SOL, BNB, XRP, ADA, DOGE, AVAX, LINK, NEAR, etc.).
2. **Indicator Computation**: Generates EMAs, RSI, MACD, ATR, and Volume ratios on selected timeframe (15M / 1H).
3. **Pattern Scan**: Evaluates heuristic pattern detectors.
4. **Confluence & MoonScore Scoring**: Computes weighted score ($0 - 100$) based on:
   - Trend alignment (Price vs EMA50/200): +25 pts
   - Momentum (RSI & MACD): +20 pts
   - Volume confirmation ($RVOL > 1.5$): +20 pts
   - Pattern detection: +20 pts
   - Derivatives confirmation (OI + Funding): +15 pts
5. **Entry / SL / TP Calculations**:
   - **Entry**: Current market close or breakout price.
   - **Stop Loss (SL)**: $\text{Entry} \mp (1.5 \times \text{ATR})$ or recent swing high/low $\pm (0.5 \times \text{ATR})$.
   - **Take Profit 1 (TP1)**: $\text{Entry} \pm (1.5 \times \text{Risk})$ ($1:1.5$ R:R).
   - **Take Profit 2 (TP2)**: $\text{Entry} \pm (2.5 \times \text{Risk})$ ($1:2.5$ R:R).
   - **Take Profit 3 (TP3)**: $\text{Entry} \pm (4.0 \times \text{Risk})$ ($1:4.0$ R:R).

---

## 11. TP1 / TP2 / TP3 Duplication Bug — Root-Cause Analysis

### 11.1 Problem Description
In the user interface (specifically inside `SignalDetailModal.tsx` and occasionally `SignalCard.tsx`), take profit levels render duplicate items, displaying:
$$\text{TP1}, \text{TP1}, \text{TP2}, \text{TP2}, \text{TP3}, \text{TP3}$$
or extending to 6–9 duplicated target entries during prolonged active sessions.

### 11.2 Root-Cause Identification & Code Path Trace

```
[ Backend signalEngine.ts ]
  Generates signal with:
  - tp1: number, tp2: number, tp3: number
  - targets: [{ level: 1, price: tp1 }, { level: 2, price: tp2 }, { level: 3, price: tp3 }]
          |
          v
[ REST API /api/signals Response ]
  Payload contains both scalar (tp1, tp2, tp3) and array (targets: [...])
          |
          v
[ AppContext.tsx - Polling & Merging State ]
  Polling cycle merges new scan results with activeSignals:
  activeSignals.map(s => s.id === incoming.id ? { ...s, ...incoming, targets: [...s.targets, ...incoming.targets] } : s)
  <-- CRITICAL DEFECT 1: Array concatenation instead of idempotent replacement on poll!
          |
          v
[ SignalDetailModal.tsx - Target Normalization Helper ]
  const targets = (signal.targets && signal.targets.length > 0)
    ? [...signal.targets, { level: 1, price: signal.tp1 }, { level: 2, price: signal.tp2 }, { level: 3, price: signal.tp3 }]
    : defaultTargets;
  <-- CRITICAL DEFECT 2: Component attempts fallback appending, doubling targets to 6 items!
```

### 11.3 Diagnosis Summary
- **Origin**: **Both Backend & Frontend State/Rendering Interaction**.
- **Data Structure Conflict**: Dual representation of targets as both scalar properties (`tp1`, `tp2`, `tp3`) and object array (`targets: TargetLevel[]`).
- **Defect Mechanism**:
  1. Frontend polling in `AppContext.tsx` performed non-idempotent array merges on existing signal IDs.
  2. UI helper in `SignalDetailModal.tsx` appended scalar TP values to an already populated `targets` array.
- **Definitive Fix Strategy (To be applied in Phase 1)**:
  - Establish a single canonical target schema: `targets: TargetLevel[]` where `TargetLevel = { level: 1 | 2 | 3, price: number, percentage: number, hit: boolean, hitTime?: number }`.
  - Deprecate loose scalar fields or generate them as read-only getters.
  - Make state reconciliation strictly idempotent using `Map<string, Signal>` with direct replacement.

---

## 12. Signal ID & Deduplication Analysis

### 12.1 Current Signal Identity Generation
- **Current Pattern**: Signals generate IDs using timestamp randomizers:
  `id: 'sig_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9)`
- **Flaw**: Every execution of the background scanner generates a **new ID** for the **same ongoing market setup** (e.g., BTC 1H Bull Flag).
- **Consequence**: The frontend accumulators and tracker treat recurring scans of the same active breakout as distinct signals, flooding the database and UI with duplicates.

### 12.2 Target Deterministic Identity Formula (Future Architecture)
Signals must use a deterministic, collision-resistant composite key:
$$\text{SignalID} = \text{hash}(\text{Symbol} + \text{"\_"} + \text{Timeframe} + \text{"\_"} + \text{Direction} + \text{"\_"} + \text{PatternType} + \text{"\_"} + \text{TriggerCandleTimestamp})$$
This guarantees that as long as the trade setup originates from the same breakout candle, subsequent scanner ticks update the existing signal in place rather than creating duplicates.

---

## 13. News Intelligence Audit

### 13.1 Current News Architecture (`newsService.ts` & `newsIntelligenceEngine.ts`)
- **Ingestion**: CryptoCompare / RSS REST feeds.
- **Entity Extraction**: Regex keyword matching against a predefined dictionary of top 50 coin tickers (BTC, ETH, SOL, XRP, etc.).
- **Sentiment Engine**: Lexicon-based keyword scoring (positive words vs negative words: "surge", "breakout", "hack", "lawsuit", "approval").
- **Signal Correlation**: Basic MoonScore booster (+5 to +10 pts if positive news exists for coin).
- **Limitations**:
  - No actionable Trade Window calculation (Entry time, SL, TP1–TP3 with expiration).
  - No news credibility weighting (Tier 1 sources vs unverified blogs).
  - No automated deduplication of syndicated news articles.

---

## 14. Bangladesh Local Time (UTC+6) Requirement Audit

### 14.1 Current Project Timezone Handling
- The existing codebase uses standard JavaScript `Date.toLocaleTimeString()` and `new Date().toISOString()`.
- This causes time representations to default to the user's browser locale or UTC server time, creating inconsistency across web, mobile, and alerts.

### 14.2 Future Time Standardization Engine
All user-facing representations across Dashboard, Signal Cards, Modals, History, News, and Telegram notifications must format through a dedicated Bangladesh Time formatter:
```ts
export function formatBangladeshTime(timestamp: number | string | Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Dhaka',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  }).format(new Date(timestamp));
}
```
*Note: Internal storage and wire APIs remain standardized in Unix epoch milliseconds / UTC ISO-8601.*

---

## 15. Multi-Timeframe Architecture Audit

### 15.1 Current Timeframe Footprint
- The application supports selection of `5m`, `15m`, `1h`, `4h`, and `1d` in UI dropdowns.
- However, calculations are executed **in isolation** on the active timeframe. Cross-timeframe confluence (e.g., 4H Trend $\rightarrow$ 1H Pattern $\rightarrow$ 15M Breakout $\rightarrow$ 5M Retest) is **not yet unified into a single multi-timeframe confirmation engine**.

---

## 16. Current UI Architecture & Card Design Audit

### 16.1 Design System & Component Styling
- **Styling Engine**: Tailwind CSS v4.
- **Theme**: Dark trading terminal palette (`#0B0E14` base canvas, `#141824` container surfaces, `#1E2638` borders).
- **Color Coding**:
  - LONG: Emerald `#10B981` / Green accent `#22C55E`.
  - SHORT: Rose `#F43F5E` / Red accent `#EF4444`.
  - Neutral / Info: Sky `#0EA5E9` / Slate `#64748B`.
- **Card Differentiation**:
  - Currently, `SignalCard.tsx` uses similar layout structures for both LONG and SHORT, distinguished primarily by badge colors and directional icons.
  - Future UI stabilization will introduce distinct visual identities and card layouts for **LONG**, **SHORT**, **NEWS CATALYST**, **CHART PATTERN**, and **TRENDLINE BREAKOUT** cards.

---

## 17. Android APK Readiness Audit

### 17.1 Native Wrapper Evaluation
- **Capacitor / Cordova Presence**: Currently not installed in `package.json`.
- **Packaging Path**: The project is architecturally ready for **Capacitor 6+ integration** (`@capacitor/core`, `@capacitor/android`, `@capacitor/cli`).
- **Security & Secret Isolation**:
  - The Android APK must operate exclusively as an HTTPS client pointing to the hosted MoonScanner backend.
  - Zero exchange API keys, secrets, or administrative tokens will be bundled within the client assets or APK package.
- **Mobile Hardware & Viewport**:
  - Viewport metadata configured in `index.html`.
  - Safe-area insets (`env(safe-area-inset-top)`, `env(safe-area-inset-bottom)`) and Android back-button hardware event listeners will be added during APK preparation phase.

---

## 18. Production Deployment Readiness

### 18.1 Server & Hosting Architecture
- **Web Bundler**: Vite produces static optimized assets in `dist/`.
- **Server Bundle**: Node.js / Express compiled with `esbuild server.ts --bundle --platform=node --format=cjs --packages=external --outfile=dist/server.cjs`.
- **Port Ingress**: Bound to `0.0.0.0:3000` for Cloud Run, VPS, Docker, and Nginx reverse proxy compatibility.
- **Process Management**: Production execution via PM2 or Container runtime with automatic restart on unhandled rejection.

---

## 19. Security Audit

An automated and manual inspection of the entire codebase was conducted:
- **API Keys & Secrets**:
  - No private exchange API secret keys or user passwords are hardcoded in source files.
  - Standard `.env.example` templates provided.
- **CORS Configuration**:
  - Express server configures open CORS in development mode; requires strict whitelist origin enforcement for production deployment.
- **Input Sanitization**:
  - Query parameters on `/api/market/:symbol` require strict symbol regex validation (`^[A-Z0-9]{2,12}$`) to prevent injection or malformed requests.

---

## 20. Performance Audit

### 20.1 Discovered Bottlenecks
1. **Sequential Coin Scanning**: Scanners iterating sequentially over 30+ coins with individual `await` calls causes scan cycles to exceed 15–20 seconds.
   - *Recommendation*: Implement batched worker pools (`p-limit` / concurrency pool of 5–8 concurrent requests).
2. **Repeated OHLCV Re-fetching**: Polling endpoints re-fetch 500 candles every 5 seconds even when prices have only ticked.
   - *Recommendation*: Implement an in-memory Candle Cache with incremental tick updating.
3. **React Re-render Loops**: `AppContext.tsx` updating entire signal arrays on every poll triggers unnecessary child card re-renders.
   - *Recommendation*: Memoize `SignalCard` with `React.memo` and use stable ID-based keys.

---

## 21. Historical & Backup Code Analysis

Multiple historical backup files were inspected across `/server/` and `/src/`:
- `technicalAnalysis.ts.before_patterns` & `.before_trendline`: Contained early, simpler indicator logic before experimental pattern heuristics were added.
- `signalEngine.ts.before_fix` & `.pre_signal_hardening`: Confirmed earlier iterations of the confluence scoring mechanism.
- `cryptoService.ts.before_data_hardening`: Exhibited unhandled rate-limit edge cases that were subsequently patched with try/catch fallbacks.
- **Key Takeaway**: The newer implementations in `technicalAnalysis.ts` and `signalEngine.ts` contain valuable structural evolution, but must be hardened systematically through the phased roadmap rather than reverting to deprecated backups.

---

## 22. Current Feature Inventory

### WORKING
- Express + Vite full-stack dev and production server build pipeline.
- Real-time Binance REST market data ingestion (OHLCV, 24h ticker, volume).
- Mathematical indicator engine (EMA 9/20/50/200, RSI 14, MACD 12/26/9, ATR 14, Bollinger Bands).
- Basic MoonScore composite scoring algorithm (0–100).
- Candlestick chart rendering with price overlays and responsive layout.
- CryptoCompare news aggregation with keyword-based sentiment tagging.
- Basic signal tracking state machine (Active, Triggered, TP/SL checks).
- Mobile-responsive navigation and modal viewports.

### PARTIALLY WORKING
- **Chart Pattern Engine**: Basic heuristics exist for Double Top/Bottom, Triangles, and Flags; however, geometric validation, multi-touch confirmation, and retest mechanics are missing.
- **Trendline Engine**: Simple linear approximations exist for visual rendering; algorithmic breakout/retest validation is missing.
- **Market Structure**: Swing high/low detection exists; formal BOS/CHoCH confirmation logic is incomplete.
- **Derivatives Telemetry**: Open Interest and Funding rates are fetched for select pairs, but not normalized across all monitored coins.
- **Timezone Handling**: Displays in browser local time rather than mandatory Bangladesh Local Time (UTC+6).

### BROKEN
- **Take Profit (TP1/TP2/TP3) Duplication**: Rendering duplicates (TP1, TP1, TP2, TP2, TP3, TP3) caused by dual property schemas and array concatenation during polling cycles.
- **Signal Identity & State Stability**: Non-deterministic signal IDs causing active setups to duplicate upon scanner re-runs.

### MISSING
- Multi-exchange Global Provider Architecture (Bybit, OKX, Coinbase, Kraken adapters).
- Data Quality Gate (gap detection, spike filtration, cross-exchange failover).
- Advanced Chart Patterns (Head & Shoulders, Cup & Handle, Triple Top/Bottom, Broadening, Channels).
- Multi-Timeframe Confluence Engine (4H + 1H + 15M + 5M synchronized confirmation).
- Actionable News Signals with calculated trade windows and expiration timestamps.
- Capacitor Android APK wrapper configuration.
- Comprehensive Automated Unit & Integration Test Suite.

---

## 23. Recommended Final Architecture

```
                                [ GLOBAL DATA SOURCES ]
               (Binance, Bybit, OKX, Coinbase, Kraken, News Feeds)
                                         |
                                         v
                            [ DATA PROVIDER ADAPTERS ]
                     (Normalized IDataProvider Implementations)
                                         |
                                         v
                              [ DATA QUALITY GATE ]
                 (Continuity Check, Anomaly Filter, Failover Engine)
                                         |
                                         v
                         [ TECHNICAL ANALYSIS & SWING ENGINE ]
                 (EMAs, RSI, MACD, ATR, Swing Highs/Lows, BOS/CHoCH)
                                         |
             +---------------------------+---------------------------+
             |                           |                           |
             v                           v                           v
  [ CHART PATTERN ENGINE ]      [ TRENDLINE ENGINE ]      [ NEWS INTELLIGENCE ]
  (20+ Geometric Detectors,    (Multi-Touch Detection,     (Entity Extraction,
   Breakout/Retest Validation)  Angle/Slope Validation)     Impact Scoring)
             |                           |                           |
             +---------------------------+---------------------------+
                                         |
                                         v
                     [ MULTI-TIMEFRAME CONFLUENCE ENGINE ]
                        (4H Bias + 1H Setup + 15M Trigger)
                                         |
                                         v
                         [ CORE INTELLIGENCE ENGINE ]
                 (MoonScore 0-100, Derivatives Confirmation,
                  Signal Validation Gate: LONG / SHORT / WAIT)
                                         |
                                         v
                       [ DETERMINISTIC SIGNAL GENERATOR ]
               (Canonical Targets, Dynamic SL/TP, Trade Window,
                 Bangladesh Time UTC+6, Unique Setup Hash)
                                         |
                                         v
                        [ SIGNAL LIFECYCLE TRACKER ]
                 (In-Memory State, Real-time PnL & R:R Tracking)
                                         |
             +---------------------------+---------------------------+
             |                                                       |
             v                                                       v
  [ HIGH-PERFORMANCE WEB SPA ]                              [ STANDALONE ANDROID APK ]
 (React 19 + Tailwind + Motion)                            (Capacitor 6+ Native Shell)
```

---

## 24. Recommended Master File Structure

```
moonscanner/
├── package.json
├── tsconfig.json
├── vite.config.ts
├── server.ts
├── README.md
├── AUDIT_REPORT.md
│
├── server/
│   ├── core/
│   │   ├── intelligenceEngine.ts
│   │   ├── confluenceEngine.ts
│   │   └── signalValidationGate.ts
│   ├── providers/
│   │   ├── IDataProvider.ts
│   │   ├── DataProviderManager.ts
│   │   ├── DataQualityGate.ts
│   │   ├── adapters/
│   │   │   ├── BinanceAdapter.ts
│   │   │   ├── BybitAdapter.ts
│   │   │   ├── OKXAdapter.ts
│   │   │   └── CoinbaseAdapter.ts
│   ├── analysis/
│   │   ├── indicators.ts
│   │   ├── marketStructure.ts
│   │   ├── patternEngine.ts
│   │   └── trendlineEngine.ts
│   ├── news/
│   │   ├── newsAggregator.ts
│   │   └── newsIntelligence.ts
│   ├── signals/
│   │   ├── signalGenerator.ts
│   │   ├── signalTracker.ts
│   │   └── signalDeduplicator.ts
│   └── utils/
│       ├── timezone.ts
│       └── logger.ts
│
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── index.css
│   ├── context/
│   │   └── AppContext.tsx
│   ├── types/
│   │   ├── crypto.ts
│   │   └── signals.ts
│   ├── services/
│   │   └── api.ts
│   ├── utils/
│   │   ├── formatters.ts
│   │   └── bangladeshTime.ts
│   ├── components/
│   │   ├── Navigation.tsx
│   │   ├── SignalCard.tsx
│   │   ├── CandlestickChart.tsx
│   │   ├── MoonScoreGauge.tsx
│   │   ├── StatusBadge.tsx
│   │   └── DataStateBadge.tsx
│   └── screens/
│       ├── HomeScreen.tsx
│       ├── SignalsScreen.tsx
│       ├── NewsScreen.tsx
│       ├── RadarScreen.tsx
│       ├── SettingsScreen.tsx
│       └── SignalDetailModal.tsx
│
└── android/ (Capacitor APK configuration)
```

---

## 25. Implementation Roadmap

- **Phase 0 (Current)**: Master Read-Only Codebase Audit & Architectural Plan.
- **Phase 1**: TP1/TP2/TP3 Target Deduplication & Deterministic Signal Identity Engine.
- **Phase 2**: UI Card Differentiation & Bangladesh Time (`UTC+6`) Standardization.
- **Phase 3**: Global Multi-Provider Architecture (IDataProvider + Binance/Bybit/OKX Adapters + Data Quality Gate).
- **Phase 4**: Market Structure Engine (Pivots, HH/HL/LH/LL, BOS, CHoCH, Key Levels).
- **Phase 5**: Comprehensive Chart Pattern Engine (20+ Reversal, Triangle, Wedge, and Continuation Patterns).
- **Phase 6**: Trendline Engine (Algorithmic $\ge 3$-touch detection, slope constraints, breakout/retest validation).
- **Phase 7**: Multi-Timeframe Confluence Engine (4H Trend + 1H Structure + 15M Setup + 5M Trigger).
- **Phase 8**: Actionable News Intelligence Engine (Entity extraction, impact scoring, calculated trade windows).
- **Phase 9**: Core Intelligence Engine & Signal Validation Gate (LONG / SHORT / WAIT).
- **Phase 10**: Signal Lifecycle Tracking, Performance Analytics & Telegram Alerts.
- **Phase 11**: Android APK Packaging (Capacitor 6+, mobile optimization, zero-leak client build).
- **Phase 12**: Production Hardening, Testing Suite & Buyer-Ready Documentation Package.

---

## 26. Testing Strategy

1. **Unit Testing**: Mathematical verification of all technical indicators against TradingView benchmark outputs.
2. **Pattern Recognition Tests**: Synthetic and historic candle replay tests validating each of the 20+ patterns.
3. **Deduplication Tests**: Automated testing simulating continuous 100-cycle scanner runs to confirm zero TP duplication and zero duplicate signal insertion.
4. **Data Provider Failover Tests**: Simulated network dropouts and HTTP 429 rate limits to verify seamless adapter switching.
5. **Timezone Tests**: Unit tests confirming all formatted timestamps strictly output Bangladesh Local Time (`UTC+6`).
6. **Mobile & APK Tests**: Android emulator and physical device testing for touch responsiveness, back-button handling, and network disconnect recovery.

---

## 27. Architectural Risks & Mitigation

| Risk Area | Potential Impact | Architectural Mitigation |
| :--- | :--- | :--- |
| **Exchange Rate Limits / Outages** | Application stalls or returns empty signals | Multi-provider fallback pool (Binance $\rightarrow$ Bybit $\rightarrow$ OKX) with Data Quality Gate. |
| **State Duplication / Memory Growth** | UI slowdown, distorted target lists | Idempotent `Map<string, Signal>` state store and canonical target arrays. |
| **False Breakouts / Market Whipsaws** | Poor signal win-rate | Strict multi-candle close validation, volume confirmation ($RVOL > 1.5$), and retest verification. |
| **Client Credential Exposure** | Security vulnerability in APK | Strict zero-secret policy; APK communicates exclusively with authenticated HTTPS backend. |

---

## 28. Phase 0 Audit Conclusion & Final Output

```
==================================================
AUDIT COMPLETE

CURRENT STATUS:

Working:
- Full-stack Express + Vite + React 19 execution pipeline.
- Real-time Binance REST market data ingestion.
- Core technical indicators (EMA 9/20/50/200, RSI, MACD, ATR, Bollinger Bands).
- Basic MoonScore 0-100 confluence calculation.
- Responsive dark trading terminal interface and candlestick chart component.
- Basic signal lifecycle state tracking.

Partially Working:
- Chart pattern detection (basic heuristics for Triangles, Flags, and Double Tops/Bottoms without geometric or retest validation).
- Trendline detection (simple 2-point pivot connections for visual rendering).
- Market structure (swing points detected, but BOS/CHoCH state machine incomplete).
- Derivatives intelligence (Open Interest and Funding fetched for select pairs only).

Broken:
- TP1 / TP2 / TP3 target duplication in Signal Details Modal and Signal Cards (displaying duplicated targets upon polling).
- Signal identity instability (non-deterministic ID generation causing signal accumulation on scanner re-runs).

Missing:
- Global multi-provider adapter architecture (Bybit, OKX, Coinbase, Kraken).
- Automated Data Quality Gate (gap detection, candle validation, failover).
- Advanced Chart Patterns (Head & Shoulders, Cup & Handle, Triple Top/Bottom, Channels, Broadening, Diamonds).
- Algorithmic >= 3-touch Trendline validation and breakout/retest confirmation.
- Multi-Timeframe Confluence Engine (4H + 1H + 15M + 5M).
- Actionable News Signals with calculated trade windows and expiration.
- Universal Bangladesh Local Time (UTC+6) formatting across all screens and notifications.
- Capacitor Android APK wrapper and mobile hardware bridge.
- Institutional buyer-ready test suite and documentation package.

High Risk:
- Single-point-of-failure reliance on Binance public REST endpoints without multi-exchange failover.
- Array state mutation during periodic polling cycles causing UI target duplication.

TP DUPLICATION ROOT CAUSE:
Dual target data structures on backend (scalar tp1/tp2/tp3 vs array targets) combined with non-idempotent array concatenation in AppContext.tsx polling handler and fallback appending in SignalDetailModal.tsx.

SIGNAL DEDUPLICATION STATUS:
Currently unstable due to timestamp/random ID generation; requires deterministic composite hash keys (Symbol + Timeframe + Direction + Pattern + BreakoutTimestamp).

EXISTING CHART PATTERN ENGINE:
Heuristic checks for 6 basic patterns; 18+ major reversal, continuation, and bilateral patterns are either stubs or completely missing. Retest and volume validation absent.

EXISTING TRENDLINE ENGINE:
Basic visual line generation between two points; lacks algorithmic multi-touch validation, slope constraints, and breakout/retest confirmation.

GLOBAL DATA PROVIDER STATUS:
Heavily coupled to Binance REST endpoints; requires immediate abstraction into an IDataProvider adapter layer.

NEWS INTELLIGENCE STATUS:
Keyword sentiment tagging operational; actionable trade window signals with SL/TP and expiration not yet implemented.

ANDROID APK READINESS:
Web architecture is responsive and clean; requires Capacitor 6+ configuration, safe-area inset adaptation, and secure HTTPS backend proxy routing.

PRODUCTION READINESS:
Core server and client build cleanly; requires CORS hardening, input validation, structured logging, and multi-provider failover.

RECOMMENDED FINAL ARCHITECTURE:
Decoupled multi-provider pipeline with Data Quality Gate -> Technical/Structure Engine -> 20+ Pattern & Multi-Touch Trendline Engine -> Multi-Timeframe Confluence -> Core Intelligence & Validation Gate -> Deterministic Signal & Lifecycle Tracker -> Web SPA + Android APK.

RECOMMENDED NEXT IMPLEMENTATION STEP:
Phase 1: Fix TP1/TP2/TP3 target duplication, standardize canonical signal data contracts, implement deterministic signal identity hashing, and enforce idempotent state reconciliation.
==================================================
```
