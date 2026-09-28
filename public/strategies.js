// Display metadata per strategy_id: human name, style, one-line thesis.
// Presentation-only copy owned by this repo — never read from a payload.
// The stream list itself always comes from dashboard_summary.json; an id
// missing here still renders, falling back to the raw id.

const STRATEGIES = {
  tsmom_v1: {
    name: "TSMOM v1",
    style: "Momentum",
    thesis: "Frozen time-series momentum with volatility scaling, daily cadence.",
  },
  btc_hold_baseline: {
    name: "Bitcoin hold",
    style: "Reference",
    thesis: "Passive bitcoin hold — the floor every stream is compared against.",
  },
  tsmom_v3_4h_3d_ls: {
    name: "TSMOM v3 (4h, L/S)",
    style: "Momentum",
    thesis: "Time-series momentum on the 4-hour grid, long and short.",
  },
  v3_gross_cap_1_0: {
    name: "TSMOM v3, gross cap 1.0",
    style: "Momentum",
    thesis: "TSMOM v3 with gross exposure capped at 100% of the book.",
  },
  amihud_lo_v1: {
    name: "Amihud long-only",
    style: "Liquidity",
    thesis: "Long-only spot stream ranked on Amihud illiquidity.",
  },
  f_lo_1_0: {
    name: "TSMOM v3, long-only",
    style: "Momentum",
    thesis: "TSMOM v3 with gross cap 1.0 and shorts clipped to flat.",
  },
};

export function strategyMeta(id) {
  const known = Object.hasOwn(STRATEGIES, id) ? STRATEGIES[id] : null;
  return known ?? { name: String(id), style: "—", thesis: null };
}
