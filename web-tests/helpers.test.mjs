// Pure frontend helpers (public/*.js) under node. Run: npm run test:web.
// Expected values pin the 2026-09-26 payload shape (see fixtures.mjs) and the
// locked verdict protocol (status C1/C2, next read C6, filters C4, briefing D2).

import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  bookStats,
  briefing,
  exposure,
  findStream,
  getStreams,
  isAttention,
  isLongOnly,
  livePnlPct,
  liveSeries,
  matchesFilter,
  raisedFlags,
  rowIndex,
  sortByLivePnl,
} from "../public/data.js";
import { coneFor, nextRead, nextReadProgressPct, readsWrittenCount, streamStatus } from "../public/cones.js";
import { buildRows } from "../public/rows.js";
import { strategyMeta } from "../public/strategies.js";
import { escapeHtml, fmtDay, fmtPct, fmtUsd } from "../public/format.js";
import { coneChartSvg } from "../public/chart.js";
import { makeCone, makeCones, makeSummary, read } from "./fixtures.mjs";

const D2_BRIEFING =
  "6 live streams, 5 under test. 2 scheduled reads written: TSMOM v1 Incomplete, TSMOM v3 (4h, L/S) On track (both row 90). 1 stream with a monitoring flag. Next read: TSMOM v3, gross cap 1.0, row 90 in ~4 closes.";

const C6_EXPECTED = {
  amihud_lo_v1: "Waiting on closed trades — 18 more needed",
  btc_hold_baseline: null,
  f_lo_1_0: "Next read at row 90 · ~62 closes",
  tsmom_v1: "Next read at row 120 · ~15 closes",
  tsmom_v3_4h_3d_ls: "Next read at row 120 · ~14 closes",
  v3_gross_cap_1_0: "Next read at row 90 · ~4 closes",
};

function nextText(summary, cones, id) {
  return nextRead(findStream(summary, id), coneFor(cones, id))?.text ?? null;
}

// A stream with `rows` equity rows and `closed` closed trades (20 required).
function syntheticStream(rows, closed) {
  return {
    strategy_id: "x",
    equity_series: Array.from({ length: rows }, (_, i) => ({ date: `d${i}`, equity: 10_000 })),
    verdict_progress: { closed_trades: closed, closed_trades_required: 20 },
  };
}

describe("streamStatus (C1/C2)", () => {
  it("maps each overall_status to its label and tone", () => {
    const cases = [
      ["ON_TRACK", "On track", "up"],
      ["WATCH", "Watch", "warn"],
      ["KILL", "Kill", "down"],
      ["INCOMPLETE", "Incomplete", "info"],
      ["SUSPEND", "Suspended", "down"],
    ];
    for (const [token, label, tone] of cases) {
      const s = streamStatus("ready", makeCone("x", [read(90, token)]));
      expect([s.kind, s.token, s.label, s.tone]).toEqual(["read", token, label, tone]);
    }
  });

  it("uses the LATEST written read", () => {
    const s = streamStatus("ready", makeCone("x", [read(90, "WATCH"), read(120, "ON_TRACK")]));
    expect(s.label).toBe("On track");
    expect(s.horizon).toBe(120);
  });

  it("covers reference, no read, pending, failed and unknown tokens", () => {
    expect(streamStatus("ready", null)).toMatchObject({ kind: "reference", label: "Reference", tone: "info" });
    expect(streamStatus("ready", makeCone("x"))).toMatchObject({ kind: "no_read", label: "No read yet", tone: "subtle" });
    expect(streamStatus("loading", null)).toMatchObject({ kind: "pending", label: "…" });
    expect(streamStatus("failed", null)).toMatchObject({ kind: "unknown", label: "Unknown" });
    expect(streamStatus("ready", makeCone("x", [read(90, "trade_starved")]))).toMatchObject({
      label: "trade_starved",
      tone: "subtle",
    });
  });
});

describe("nextRead (C6)", () => {
  const summary = makeSummary();
  const cones = makeCones();

  it("matches the expected values on the 09-26 shape", () => {
    for (const [id, text] of Object.entries(C6_EXPECTED)) {
      expect(nextText(summary, cones, id), id).toBe(text);
    }
  });

  it("returns null for a reference stream (no cone)", () => {
    expect(nextRead(findStream(summary, "btc_hold_baseline"), null)).toBeNull();
  });

  it("reports a due read when the index sits on the next grid row", () => {
    expect(nextRead(syntheticStream(91, 25), makeCone("x"))).toMatchObject({ kind: "due", text: "Read due at row 90" });
    expect(nextRead(syntheticStream(121, 25), makeCone("x", [read(90, "ON_TRACK")]))).toMatchObject({
      kind: "due",
      text: "Read due at row 120",
    });
  });

  it("skips to the next grid row once the index is past the first", () => {
    expect(nextRead(syntheticStream(101, 25), makeCone("x")).text).toBe("Next read at row 120 · ~20 closes");
  });

  it("flags trade-starved streams from row 180", () => {
    expect(nextRead(syntheticStream(181, 5), makeCone("x"))).toMatchObject({
      kind: "trade_starved",
      text: "Trade-starved: cone-only read, cost leg inconclusive",
    });
    expect(nextRead(syntheticStream(180, 5), makeCone("x")).kind).toBe("waiting_trades");
  });

  it("says so when the next read would be beyond the cone grid", () => {
    const text = "Beyond the cone grid (row 360) — no scheduled read on the grid";
    expect(nextRead(syntheticStream(365, 25), makeCone("x", [read(360, "ON_TRACK")])).text).toBe(text);
    expect(nextRead(syntheticStream(400, 25), makeCone("x")).text).toBe(text);
  });
});

describe("nextReadProgressPct (card bar)", () => {
  const summary = makeSummary();
  const cones = makeCones();
  const pct = (id) => {
    const s = findStream(summary, id);
    const c = coneFor(cones, id);
    return nextReadProgressPct(s, c, nextRead(s, c));
  };

  it("has reads: progress through the current 30-row interval", () => {
    expect(pct("tsmom_v1")).toBeCloseTo(50, 6); // (105 − 90) / 30
    expect(pct("tsmom_v3_4h_3d_ls")).toBeCloseTo((16 / 30) * 100, 6);
  });

  it("no reads: index / next row", () => {
    expect(pct("v3_gross_cap_1_0")).toBeCloseTo((86 / 90) * 100, 6);
    expect(pct("f_lo_1_0")).toBeCloseTo((28 / 90) * 100, 6);
  });

  it("waiting on trades: closed / required", () => {
    expect(pct("amihud_lo_v1")).toBeCloseTo(10, 6);
  });

  it("no bar for reference, trade-starved or beyond the grid", () => {
    expect(pct("btc_hold_baseline")).toBeNull();
    const starved = syntheticStream(181, 5);
    expect(nextReadProgressPct(starved, makeCone("x"), nextRead(starved, makeCone("x")))).toBeNull();
    const done = syntheticStream(365, 25);
    const cone = makeCone("x", [read(360, "ON_TRACK")]);
    expect(nextReadProgressPct(done, cone, nextRead(done, cone))).toBeNull();
  });
});

describe("filters and attention (C4)", () => {
  const rows = buildRows(makeSummary(), "ready", makeCones());
  const ids = (filter) => rows.filter((r) => matchesFilter(r, filter)).map((r) => r.id);

  it("splits the 09-26 streams as expected", () => {
    expect(ids("all")).toHaveLength(6);
    expect(ids("attention")).toEqual(["tsmom_v3_4h_3d_ls"]);
    expect(ids("on_track")).toEqual(["tsmom_v3_4h_3d_ls"]);
    expect(ids("reference")).toEqual(["btc_hold_baseline"]);
  });

  it("counts WATCH / KILL / SUSPEND as attention, not INCOMPLETE", () => {
    const row = (token) => ({ flags: [], status: { token } });
    expect(isAttention(row("WATCH"))).toBe(true);
    expect(isAttention(row("KILL"))).toBe(true);
    expect(isAttention(row("SUSPEND"))).toBe(true);
    expect(isAttention(row("INCOMPLETE"))).toBe(false);
    expect(isAttention(row("ON_TRACK"))).toBe(false);
  });
});

describe("briefing (D2) and KPIs (D3)", () => {
  const summary = makeSummary();
  const cones = makeCones();

  it("reproduces the D2 example line", () => {
    const rows = buildRows(summary, "ready", cones);
    expect(briefing(rows, true, readsWrittenCount(cones))).toBe(D2_BRIEFING);
  });

  it("asserts nothing about reads while verdicts are unknown", () => {
    const rows = buildRows(summary, "failed", null);
    expect(briefing(rows, false, 0)).toBe("6 live streams. 1 stream with a monitoring flag.");
  });

  it('prefixes "latest:" once a stream has more than one read', () => {
    const more = makeCones();
    coneFor(more, "tsmom_v1").reads = [read(90, "INCOMPLETE"), read(120, "WATCH")];
    const rows = buildRows(summary, "ready", more);
    expect(briefing(rows, true, readsWrittenCount(more))).toContain(
      "3 scheduled reads written: latest: TSMOM v1 Watch (row 120), TSMOM v3 (4h, L/S) On track (row 90).",
    );
  });

  it("computes the KPI tiles", () => {
    const stats = bookStats(buildRows(summary, "ready", cones), true);
    expect(stats.count).toBe(6);
    expect(stats.underTest).toBe(5);
    expect(stats.top.id).toBe("amihud_lo_v1");
    expect(stats.top.index).toBe(85);
    expect(stats.attentionCount).toBe(1);
    expect(stats.attentionReasons).toBe("1 drift flag");
    expect(bookStats(buildRows(summary, "loading", null), false).underTest).toBeNull();
  });

  it("sorts by live P&L descending with nulls last", () => {
    const sorted = sortByLivePnl([{ livePnlPct: 1 }, { livePnlPct: null }, { livePnlPct: 5 }]);
    expect(sorted.map((r) => r.livePnlPct)).toEqual([5, 1, null]);
  });
});

describe("summary adapter", () => {
  it("raisedFlags: only === true, fixed order, unknown keys after with raw label", () => {
    const s = { flags: { edge_decay: true, zeta: true, drawdown: null, drift: true, off: false } };
    expect(raisedFlags(s)).toEqual([
      { key: "drift", label: "Drift" },
      { key: "edge_decay", label: "Edge decay" },
      { key: "zeta", label: "zeta" },
    ]);
  });

  it("isLongOnly derives from positions, not the id", () => {
    expect(isLongOnly({ strategy_id: "tsmom_v3_4h_3d_ls", open_positions: [{ side: "long" }] })).toBe(true);
    expect(isLongOnly({ open_positions: [{ side: "long" }, { side: "short" }] })).toBe(false);
  });

  it("exposure: gross can exceed 100%, net signs shorts", () => {
    const e = exposure({ open_positions: [{ side: "long", size_pct: 90 }, { side: "short", size_pct: 50 }] });
    expect(e).toEqual({ count: 2, grossPct: 140, netPct: 40 });
  });

  it("rowIndex and liveSeries use the anchor row as row 0", () => {
    const s = findStream(makeSummary(), "tsmom_v1");
    expect(rowIndex(s)).toBe(105);
    const series = liveSeries(s);
    expect(series[0].pct).toBe(0);
    expect(series[series.length - 1].pct).toBeCloseTo(livePnlPct(s), 9);
  });
});

describe("format and metadata", () => {
  it("formats dates en-GB in UTC (node output pinned; views must not depend on the month string)", () => {
    expect(fmtDay("2026-09-26")).toBe("26 Sept 2026");
  });

  it("formats money and signed percentages", () => {
    expect(fmtUsd(17541.504)).toBe("$17,541.50");
    expect(fmtUsd(10_000, 0)).toBe("$10,000");
    expect(fmtPct(4.2333)).toBe("+4.23%");
    expect(fmtPct(-0.5, 1)).toBe("-0.5%");
    expect(fmtPct(null)).toBe("—");
  });

  it("escapes payload text", () => {
    expect(escapeHtml(`<img src=x onerror="a('b')">&`)).toBe("&lt;img src=x onerror=&quot;a(&#39;b&#39;)&quot;&gt;&amp;");
    const svg = coneChartSvg({
      realized: [{ row: 0, cumReturn: 0 }, { row: 90, cumReturn: 0.1 }],
      gridPoints: [{ horizon: 90, percentiles: { p1: -0.5, p5: -0.4, p50: 0, p95: 0.8 } }],
      reads: [{ horizon: 90, y: 0.1, label: "<script>x</script>" }],
    });
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&lt;script&gt;");
  });

  it("falls back to the raw id for unknown strategies", () => {
    expect(strategyMeta("tsmom_v1").name).toBe("TSMOM v1");
    expect(strategyMeta("new_stream_v9")).toEqual({ name: "new_stream_v9", style: "—", thesis: null });
    expect(strategyMeta("__proto__").name).toBe("__proto__");
  });
});

// The real payloads are gitignored (test/fixtures/); when present locally,
// confirm the same expectations hold on them.
const REAL_SUMMARY = fileURLToPath(new URL("../test/fixtures/dashboard_summary.sample.json", import.meta.url));
const REAL_CONES = fileURLToPath(new URL("../test/fixtures/verdict_cones.sample.json", import.meta.url));
const hasReal = existsSync(REAL_SUMMARY) && existsSync(REAL_CONES);

describe.skipIf(!hasReal)("local real fixtures (2026-09-26)", () => {
  const load = (p) => JSON.parse(readFileSync(p, "utf8"));

  it("C6 next-read values and the D2 briefing", () => {
    const summary = load(REAL_SUMMARY);
    const cones = load(REAL_CONES);
    expect(getStreams(summary)).toHaveLength(6);
    for (const [id, text] of Object.entries(C6_EXPECTED)) {
      expect(nextText(summary, cones, id), id).toBe(text);
    }
    expect(briefing(buildRows(summary, "ready", cones), true, readsWrittenCount(cones))).toBe(D2_BRIEFING);
  });
});
