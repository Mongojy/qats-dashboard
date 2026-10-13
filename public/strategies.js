// Display metadata per strategy_id: human name, style, one-line thesis.
// Presentation-only copy owned by this repo — never read from a payload.
// The stream list itself always comes from dashboard_summary.json; an id
// missing here still renders, falling back to the raw id.
//
// universe: the coin universe the stream was built on (static membership).
// v1 = the original six; an id missing here belongs to v2 (successors).

const STRATEGIES = {
  tsmom_v1: {
    name: "TSMOM v1",
    style: "Momentum",
    thesis: "Frozen time-series momentum with volatility scaling, daily cadence.",
    universe: "v1",
  },
  btc_hold_baseline: {
    name: "Bitcoin hold",
    style: "Reference",
    thesis: "Passive bitcoin hold — the floor every stream is compared against.",
    universe: "v1",
  },
  tsmom_v3_4h_3d_ls: {
    name: "TSMOM v3 (4h, L/S)",
    style: "Momentum",
    thesis: "Time-series momentum on the 4-hour grid, long and short.",
    universe: "v1",
  },
  v3_gross_cap_1_0: {
    name: "TSMOM v3, gross cap 1.0",
    style: "Momentum",
    thesis: "TSMOM v3 with gross exposure capped at 100% of the book.",
    universe: "v1",
  },
  amihud_lo_v1: {
    name: "Amihud long-only",
    style: "Liquidity",
    thesis: "Long-only spot stream ranked on Amihud illiquidity.",
    universe: "v1",
  },
  f_lo_1_0: {
    name: "TSMOM v3, long-only",
    style: "Momentum",
    thesis: "TSMOM v3 with gross cap 1.0 and shorts clipped to flat.",
    universe: "v1",
  },
};

const DEFAULT_UNIVERSE = "v2";

export function strategyMeta(id) {
  const known = Object.hasOwn(STRATEGIES, id) ? STRATEGIES[id] : null;
  if (!known) return { name: String(id), style: "—", thesis: null, universe: DEFAULT_UNIVERSE };
  return { ...known, universe: known.universe ?? DEFAULT_UNIVERSE };
}

// Reference streams are pinned on top of the list in every universe tab.
// Static on purpose (style), so the order never moves when verdicts arrive —
// unlike the "Reference" status label, which stays cone-driven.
export function isReferenceStrategy(id) {
  return strategyMeta(id).style === "Reference";
}

// List tabs, in display order. `empty`: shown when the universe holds no
// non-reference stream.
export const UNIVERSES = [
  { id: "v2", label: "Universe v2", empty: "No v2 streams yet — successors start on the day of the universe rebuild." },
  { id: "v1", label: "Universe v1", empty: null },
];
