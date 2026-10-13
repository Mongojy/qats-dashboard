// Universe tabs and list order (data.js list helpers, strategies.js
// membership, rows.js pinned / universe fields).

import { describe, expect, it } from "vitest";

import { defaultUniverse, firstSelectable, hasUnpinned, matchesFilter, matchesUniverse, sortForList } from "../public/data.js";
import { buildRows } from "../public/rows.js";
import { isReferenceStrategy, strategyMeta } from "../public/strategies.js";
import { makeCone, makeCones, makeStream, makeSummary, read } from "./fixtures.mjs";

const V1 = ["tsmom_v1", "btc_hold_baseline", "tsmom_v3_4h_3d_ls", "v3_gross_cap_1_0", "amihud_lo_v1", "f_lo_1_0"];

function withV2(extra) {
  const summary = makeSummary();
  summary.streams.push(...extra);
  return summary;
}

const ids = (rows) => rows.map((r) => r.id);
const inTab = (rows, u, filter = "all") => ids(sortForList(rows.filter((r) => matchesUniverse(r, u) && matchesFilter(r, filter))));

describe("universe membership", () => {
  it("the original six are v1; an unknown id is v2", () => {
    for (const id of V1) expect(strategyMeta(id).universe, id).toBe("v1");
    expect(strategyMeta("tsmom_v4_pit").universe).toBe("v2");
    expect(isReferenceStrategy("btc_hold_baseline")).toBe(true);
    expect(isReferenceStrategy("tsmom_v1")).toBe(false);
    expect(isReferenceStrategy("tsmom_v4_pit")).toBe(false);
  });

  it("the reference stream is in both tabs, pinned on top", () => {
    const rows = buildRows(withV2([makeStream("tsmom_v4_pit", "2026-09-20", 7, 0, { pnl: 99 })]), "ready", makeCones());
    expect(inTab(rows, "v2")).toEqual(["btc_hold_baseline", "tsmom_v4_pit"]);
    expect(inTab(rows, "v1")[0]).toBe("btc_hold_baseline");
    expect(inTab(rows, "v1")).toHaveLength(6);
  });

  it("default tab: v2 once it holds a non-reference stream, else v1", () => {
    const today = buildRows(makeSummary(), "ready", makeCones());
    expect(hasUnpinned(today, "v2")).toBe(false);
    expect(defaultUniverse(today)).toBe("v1");
    const later = buildRows(withV2([makeStream("tsmom_v4_pit", "2026-09-20", 7, 0)]), "loading", null);
    expect(defaultUniverse(later)).toBe("v2");
    expect(defaultUniverse([])).toBe("v1");
  });

  it("chips filter within the active tab", () => {
    const summary = withV2([
      makeStream("tsmom_v4_pit", "2026-09-20", 7, 0, { flags: { drift: true } }),
      makeStream("amihud_v2", "2026-09-20", 7, 0),
    ]);
    const cones = makeCones();
    cones.streams.push(makeCone("tsmom_v4_pit"), makeCone("amihud_v2", [read(90, "ON_TRACK")]));
    const rows = buildRows(summary, "ready", cones);
    expect(inTab(rows, "v1", "attention")).toEqual(["tsmom_v3_4h_3d_ls"]);
    expect(inTab(rows, "v2", "attention")).toEqual(["tsmom_v4_pit"]);
    expect(inTab(rows, "v2", "on_track")).toEqual(["amihud_v2"]);
    expect(inTab(rows, "v2", "reference")).toEqual(["btc_hold_baseline"]);
    expect(inTab(rows, "v1", "reference")).toEqual(["btc_hold_baseline"]);
  });
});

describe("list order", () => {
  const row = (id, livePnlPct) => ({ id, livePnlPct, pinned: isReferenceStrategy(id) });

  it("reference first regardless of P&L, then P&L descending", () => {
    const sorted = sortForList([row("a", 5), row("btc_hold_baseline", -80), row("b", 50)]);
    expect(ids(sorted)).toEqual(["btc_hold_baseline", "b", "a"]);
  });

  it("null and NaN P&L last, ties by strategy_id ascending", () => {
    const sorted = sortForList([row("z", null), row("c", 1), row("y", NaN), row("b", 1), row("a", 2), row("x", null)]);
    expect(ids(sorted)).toEqual(["a", "b", "c", "x", "y", "z"]);
  });

  it("the pin is static: same position before and after verdicts arrive", () => {
    const summary = makeSummary();
    summary.streams.find((s) => s.strategy_id === "btc_hold_baseline").net_pnl_pct = -40;
    const loading = buildRows(summary, "loading", null);
    const ready = buildRows(summary, "ready", makeCones());
    expect(ids(sortForList(loading))[0]).toBe("btc_hold_baseline");
    expect(ids(sortForList(ready))).toEqual(ids(sortForList(loading)));
  });

  it("default selection skips the pinned reference", () => {
    const rows = buildRows(makeSummary(), "ready", makeCones());
    const sorted = sortForList(rows);
    expect(sorted[0].id).toBe("btc_hold_baseline");
    expect(firstSelectable(sorted).id).toBe("amihud_lo_v1");
    const onlyRef = sorted.filter((r) => r.pinned);
    expect(firstSelectable(onlyRef).id).toBe("btc_hold_baseline");
    expect(firstSelectable([])).toBeNull();
  });
});
