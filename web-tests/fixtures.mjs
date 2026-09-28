// Synthetic payloads that mirror the SHAPE of the 2026-09-26 artifacts
// (row counts, closed trades, reads, flags) without copying real equity or
// positions — the real payloads stay in the gitignored test/fixtures/.

function series(anchor, rows, endPct = 0) {
  const start = Date.parse(`${anchor}T00:00:00Z`);
  return Array.from({ length: rows }, (_, i) => ({
    date: new Date(start + i * 86_400_000).toISOString().slice(0, 10),
    equity: 10_000 * (1 + (endPct / 100) * (rows > 1 ? i / (rows - 1) : 0)),
  }));
}

function stream(id, anchor, rows, closed, { pnl = 0, flags = {}, positions } = {}) {
  const equity_series = series(anchor, rows, pnl);
  return {
    strategy_id: id,
    anchor_date: anchor,
    equity: equity_series[equity_series.length - 1].equity,
    equity_series,
    net_pnl_pct: pnl,
    open_positions: positions ?? [
      { base_asset: "BTC", side: "long", leg: "spot_long", vote: null, open_ts: `${anchor}T00:00:00+00:00`, days_held: 1, open_price: 100, size_pct: 10, unreal_pnl_pct: 1 },
    ],
    verdict_progress: {
      daily_closes: rows,
      daily_closes_required: 90,
      closed_trades: closed,
      closed_trades_required: 20,
      verdict_ready: false,
    },
    flags: { drawdown: false, drift: false, edge_decay: false, ...flags },
  };
}

export function makeSummary() {
  return {
    schema_version: 2,
    generated_at: "2026-09-27T06:54:17+00:00",
    as_of_date: "2026-09-26",
    streams: [
      stream("amihud_lo_v1", "2026-07-02", 86, 2, { pnl: 68.46 }),
      stream("btc_hold_baseline", "2026-06-12", 106, 0, { pnl: 30.99 }),
      stream("f_lo_1_0", "2026-08-29", 29, 66, { pnl: 25.02 }),
      stream("tsmom_v1", "2026-06-12", 106, 69, { pnl: 6.79 }),
      stream("tsmom_v3_4h_3d_ls", "2026-06-12", 107, 256, { pnl: 4.23, flags: { drift: true } }),
      stream("v3_gross_cap_1_0", "2026-07-02", 87, 196, { pnl: 18.21 }),
    ],
  };
}

const HORIZONS = [90, 120, 150, 180, 210, 240, 270, 300, 330, 360];

export function makeCone(id, reads = [], { untrimmed = false } = {}) {
  const percentiles = Object.fromEntries(
    HORIZONS.map((h) => [String(h), { p1: -0.5, "p2.5": -0.45, p5: -0.4, p10: -0.3, p25: -0.1, p50: 0.05, p75: 0.2, p90: 0.5, p95: 0.8, "p97.5": 1.0 }]),
  );
  return {
    strategy_id: id,
    cone_sha256: "sha",
    horizons: HORIZONS,
    percentiles,
    trim: { rule: "test", untrimmed, warmup_trimmed_rows: 0 },
    reads,
  };
}

export function read(horizon, overall, extra = {}) {
  return {
    as_of: "2026-09-10",
    horizon,
    overall_status: overall,
    cone_leg_verdict: "ON_TRACK",
    cost_leg_verdict: "inconclusive",
    cost_leg_trust: null,
    breach_status: null,
    realized_cum_net_return: -0.1,
    percentile_position: { between: ["p25", "p50"], interpolated_percentile: 34.4 },
    cone_underpowered: true,
    cone_match: true,
    ...extra,
  };
}

export function makeCones() {
  return {
    schema_version: 1,
    generated_at: "2026-09-27T06:54:32+00:00",
    streams: [
      makeCone("amihud_lo_v1"),
      makeCone("f_lo_1_0"),
      makeCone("tsmom_v1", [read(90, "INCOMPLETE")]),
      makeCone("tsmom_v3_4h_3d_ls", [read(90, "ON_TRACK")], { untrimmed: true }),
      makeCone("v3_gross_cap_1_0"),
    ],
  };
}
