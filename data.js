/* =========================================================================
   Mock state for the Signal overview page.
   Values reflect an honest-negative snapshot (ML underperforms TSMOM,
   TSMOM underperforms BTC B&H). Numbers are illustrative, not live.

   Wrapped in an IIFE so top-level declarations stay scoped to this script
   and never collide with sibling classic <script> files' global lexical
   bindings. Only `window.STATE` is exported.
   ========================================================================= */
(function () {
  "use strict";

  /* ---- deterministic synthetic equity curves (seeded, no randomness drift) ---- */
  function _lin(n, start, end) {
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = +(start + (end - start) * (i / (n - 1))).toFixed(3);
    return out;
  }
  // ML net: trending down, with a mid-window bounce
  function EQUITY_ML() {
    const n = 60;
    return _lin(n, 1.0, 0.91).map((v, i) =>
      +(v + 0.02 * Math.sin(i / 5)).toFixed(3));
  }
  // TSMOM: middle, modest uptrend
  function EQUITY_TSMOM() {
    const n = 60;
    return _lin(n, 1.0, 1.07).map((v, i) =>
      +(v + 0.01 * Math.sin(i / 4 + 1)).toFixed(3));
  }
  // BTC B&H: best, strong uptrend
  function EQUITY_BTC() {
    const n = 60;
    return _lin(n, 1.0, 1.21).map((v, i) =>
      +(v + 0.012 * Math.sin(i / 6 + 2)).toFixed(3));
  }

const STATE = {
  topbar: {
    title: "Signal overview",
    timestamp: "2026-06-12 09:00 UTC · daily close",
    status: "live",          // live | paused | error
    regime: "bull",          // bull | bear | chop
  },

  // Section 1 — metric strip
  metrics: [
    {
      label: "Net Sharpe (WF)",
      value: "−0.097",
      sub: "walk-forward",
      variant: "negative",
    },
    {
      label: "Benchmark Sharpe",
      value: "0.87",
      sub: "tsmom_v1",
      variant: "muted",
    },
    {
      label: "BTC B&H Sharpe",
      value: "1.34",
      sub: "honest floor",
      variant: "positive",
    },
    {
      label: "Open positions",
      value: "3",
      sub: "1 long · 2 short",
      variant: "neutral",
    },
    {
      label: "PBO / DSR",
      value: "0.42 / 0.87",
      sub: "DSR fail (< 0.95)",
      variant: "neutral",
      subVariant: "negative",
    },
  ],

  // Section 2 — honest banner
  banner: {
    text: "ML does not beat TSMOM. TSMOM does not beat BTC B&H. Signal posture = hold BTC.",
  },

  // Section 3 — active signals
  signals: {
    updatedAt: "2026-06-12 09:00 UTC",
    tracked: 8,
    rows: [
      { asset: "BTC",   dir: "long",  leg: "spot", regime: "bull", conf: 0.71, sizeUsd: 4200, hold: 6 },
      { asset: "ETH",   dir: "short", leg: "perp", regime: "bull", conf: 0.58, sizeUsd: 1800, hold: 3 },
      { asset: "SOL",   dir: "short", leg: "perp", regime: "chop", conf: 0.49, sizeUsd: 1200, hold: 2 },
      { asset: "LTC",   dir: "flat",  leg: null,   regime: "bull", conf: 0.12, sizeUsd: 0,    hold: 0 },
      { asset: "DOGE",  dir: "long",  leg: "spot", regime: "bull", conf: 0.64, sizeUsd: 900,  hold: 4 },
      { asset: "AVAX",  dir: "short", leg: "perp", regime: "chop", conf: 0.53, sizeUsd: 1100, hold: 1 },
      { asset: "LINK",  dir: "flat",  leg: null,   regime: "chop", conf: 0.09, sizeUsd: 0,    hold: 0 },
      { asset: "MATIC", dir: "flat",  leg: null,   regime: "bear", conf: 0.05, sizeUsd: 0,    hold: 0 },
    ],
  },

  // Section 4 — system health
  health: [
    { status: "ok",   label: "Data pipeline",  sub: "All venues · last bar 09:00 UTC · no gaps" },
    { status: "ok",   label: "Feature compute", sub: "32 features · leakage tests pass · no NaNs" },
    { status: "warn", label: "OKX OHLCV",       sub: "Partial coverage · tracked follow-up" },
    { status: "err",  label: "ML gate",         sub: "DSR 0.87 < 0.95 threshold · not shipping" },
  ],

  // Section 5 — weekly LLM brief
  brief: {
    track: "Track B",
    state: "draft",
    date: "2026-06-12",
    body: [
      "Momentum regime classification held bull across BTC and ETH this week, but the ML gate failed DSR (0.87 < 0.95) for the second consecutive close — the model is not cleared to ship and remains a Track B draft.",
      "TSMOM v1 outperformed the ML stack net of costs on the walk-forward window, yet still trails BTC buy-and-hold on absolute Sharpe. The honest posture is to hold BTC as the reference position.",
      "One watch item: OKX OHLCV has partial coverage since the 09:00 bar; derivstats accumulators are still healthy but coverage should be confirmed before the next daily close.",
    ],
  },

  // Section 6 — equity curve
  equity: {
    series: [
      // ordering is intentional: ML worst, TSMOM middle, BTC B&H best
      { id: "ml",   label: "ML net",   color: "var(--gray)",  dash: null,         data: EQUITY_ML() },
      { id: "tsmom", label: "TSMOM",   color: "var(--green)", dash: "5 4",        data: EQUITY_TSMOM() },
      { id: "btc",   label: "BTC B&H", color: "var(--blue)",  dash: "1.5 4",      data: EQUITY_BTC() },
    ],
  },
};

  if (typeof window !== "undefined") window.STATE = STATE;
  if (typeof module !== "undefined" && module.exports) module.exports = { STATE };
})();
