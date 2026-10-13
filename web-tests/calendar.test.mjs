// Week bands (calendar.js + chart.js) and read dates (cones.js / rows.js).
// Expected date strings go through format.js's own formatter — the month
// abbreviation is engine-dependent ("Sept" vs "Sep").

import { describe, expect, it } from "vitest";

import { addDays, dateAtRow, isAltWeek, parseDay, weekBandSpans, weekStart } from "../public/calendar.js";
import { findStream, liveSeries, rowDates } from "../public/data.js";
import { coneFor, gridPointsInWindow, horizonDateLabels, nextRead, nextReadDate, realizedSeries, chartReads } from "../public/cones.js";
import { buildRows } from "../public/rows.js";
import { fmtDay, fmtShortDay } from "../public/format.js";
import { coneChartSvg, livePathSvg, placeDateLabels, tickLabelWidth } from "../public/chart.js";
import { makeCone, makeCones, makeStream, makeSummary, read } from "./fixtures.mjs";

const AS_OF = "2026-09-26";
const day = (iso) => fmtShortDay(iso, AS_OF);

function dailyPoints(firstIso, n) {
  return Array.from({ length: n }, (_, i) => ({ date: addDays(firstIso, i), x: i }));
}

describe("week bands", () => {
  it("weeks start on Monday 00:00 UTC", () => {
    expect(new Date(weekStart(parseDay("2026-10-14"))).toISOString()).toBe("2026-10-12T00:00:00.000Z");
    expect(new Date(weekStart(parseDay("2026-10-12"))).toISOString()).toBe("2026-10-12T00:00:00.000Z");
    expect(new Date(weekStart(parseDay("2026-10-18"))).toISOString()).toBe("2026-10-12T00:00:00.000Z");
  });

  it("cuts partial weeks at both edges and alternates the tone", () => {
    // Wed 30 Sep .. Tue 20 Oct 2026, x = day index.
    const spans = weekBandSpans(dailyPoints("2026-09-30", 21), { x0: 0, x1: 20 });
    expect(spans.map((s) => [s.start, s.x1, s.x2])).toEqual([
      ["2026-09-28", 0, 5],
      ["2026-10-05", 5, 12],
      ["2026-10-12", 12, 19],
      ["2026-10-19", 19, 20],
    ]);
    for (let i = 1; i < spans.length; i++) expect(spans[i].alt).toBe(!spans[i - 1].alt);
  });

  it("keeps alternating across the 2026 W53 -> 2027 W01 boundary", () => {
    expect(isAltWeek(parseDay("2026-12-28"))).not.toBe(isAltWeek(parseDay("2027-01-04")));
  });

  it("clips spans to the plot range", () => {
    const spans = weekBandSpans(dailyPoints("2026-09-30", 21), { x0: 3, x1: 14 });
    expect(spans[0].x1).toBe(3);
    expect(spans[spans.length - 1].x2).toBe(14);
  });

  it("tone depends only on the week, not on the x mapping or the render", () => {
    const s = findStream(makeSummary(), "tsmom_v1");
    const live = weekBandSpans(liveSeries(s).map((p, i) => ({ date: p.date, x: i * 3 })), { x0: 0, x1: 1e6 });
    // Another mapping over a longer, row-extrapolated date range.
    const dates = rowDates(s);
    const other = weekBandSpans(
      Array.from({ length: 151 }, (_, r) => ({ date: dateAtRow(dates, r).iso, x: 50 + r })),
      { x0: 0, x1: 1e6 },
    );
    const otherTone = new Map(other.map((sp) => [sp.start, sp.alt]));
    expect(live.length).toBeGreaterThan(10);
    for (const sp of live) expect(otherTone.get(sp.start), sp.start).toBe(sp.alt);
    // Re-render: same input, same tones.
    expect(weekBandSpans(liveSeries(s).map((p, i) => ({ date: p.date, x: i })), { x0: 0, x1: 1e6 }).map((x) => x.alt)).toEqual(
      live.map((x) => x.alt),
    );
  });

  it("dateAtRow: own date up to the last row, +1 day per row beyond it", () => {
    const dates = ["2026-09-01", "2026-09-02", null, "2026-09-04"];
    expect(dateAtRow(dates, 1)).toEqual({ iso: "2026-09-02", estimated: false });
    expect(dateAtRow(dates, 2)).toEqual({ iso: "2026-09-03", estimated: true });
    expect(dateAtRow(dates, 3)).toEqual({ iso: "2026-09-04", estimated: false });
    expect(dateAtRow(dates, 33)).toEqual({ iso: "2026-10-04", estimated: true });
    expect(dateAtRow([], 3)).toBeNull();
  });

  it("spans extrapolated rows past the last row up to the range end", () => {
    const s = findStream(makeSummary(), "f_lo_1_0"); // last row 28
    const spans = weekBandSpans(
      Array.from({ length: 91 }, (_, r) => ({ date: dateAtRow(rowDates(s), r).iso, x: r })),
      { x0: 0, x1: 90 },
    );
    expect(spans[spans.length - 1].x2).toBe(90);
    expect(spans[spans.length - 1].start).toBe("2026-11-23"); // week of row 90 = 27 Nov
  });

  it("cone chart: no week bands; the date line keeps its +12 viewBox", () => {
    const s = findStream(makeSummary(), "f_lo_1_0");
    const cone = makeCone("f_lo_1_0");
    const gridPoints = gridPointsInWindow(cone, 28);
    const horizonDates = [{ horizon: 90, label: "≈27 Nov", role: "next" }];
    const svg = coneChartSvg({ realized: realizedSeries(s), gridPoints, reads: [], horizonDates }, { width: 360, height: 240 });
    expect(svg).not.toContain("week-band");
    expect(svg).not.toContain("<rect");
    expect(svg).toContain(`viewBox="0 0 360 252"`);
    expect(svg).toContain(">≈27 Nov</text>");
  });

  it("live path: bands sit under every other layer", () => {
    const svg = livePathSvg(liveSeries(findStream(makeSummary(), "tsmom_v1")));
    const body = svg.slice(svg.indexOf("<svg"));
    expect(body.indexOf("week-band")).toBeGreaterThan(0);
    expect(body.indexOf("week-band")).toBeLessThan(body.indexOf("live-path__zero"));
    expect(livePathSvg([{ date: "2026-09-01", pct: 0 }])).not.toContain("week-band");
  });
});

describe("read dates", () => {
  const summary = makeSummary();
  const cones = makeCones();
  const rows = buildRows(summary, "ready", cones);
  const row = (id) => rows.find((r) => r.id === id);

  it("uses the same month string as the existing en-GB dates", () => {
    expect(fmtDay("2026-09-26").startsWith(fmtShortDay("2026-09-26", "2026-01-01"))).toBe(true);
    expect(fmtShortDay("2026-11-27", AS_OF)).toBe(
      new Date("2026-11-27T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }),
    );
  });

  it("appends ≈date to a scheduled read beyond the last row", () => {
    // f_lo_1_0: anchor 29 Aug, row 90 -> 27 Nov.
    expect(row("f_lo_1_0").next.dateLabel).toBe(`≈${day("2026-11-27")}`);
    expect(row("f_lo_1_0").next.line).toBe(`Next read at row 90 · ~62 closes · ≈${day("2026-11-27")}`);
    expect(row("tsmom_v1").next.line).toBe(`Next read at row 120 · ~15 closes · ≈${day("2026-10-10")}`);
  });

  it("Read due (index == h, no reads) shows the row's actual date", () => {
    const s = makeStream("x", "2026-06-01", 91, 25); // index 90
    const next = nextRead(s, makeCone("x"));
    expect(next.kind).toBe("due");
    expect(nextReadDate(s, next, AS_OF)).toBe(day("2026-08-30"));
  });

  it("Read due with lagging reads (last + 30 <= last row): actual date", () => {
    const s = makeStream("x", "2026-03-01", 151, 25); // index 150
    const next = nextRead(s, makeCone("x", [read(90, "ON_TRACK")]));
    expect(next).toMatchObject({ kind: "due", row: 120 });
    expect(nextReadDate(s, next, AS_OF)).toBe(day("2026-06-29"));
  });

  it("derives ≈ from the row, never from the state name", () => {
    const s = makeStream("x", "2026-06-01", 101, 25);
    expect(nextReadDate(s, { kind: "scheduled", row: 60 }, AS_OF)).toBe(day("2026-07-31"));
    expect(nextReadDate(s, { kind: "due", row: 130 }, AS_OF)).toBe(`≈${day("2026-10-09")}`);
  });

  it("no date for states without a horizon", () => {
    expect(row("amihud_lo_v1").next).toMatchObject({ kind: "waiting_trades", dateLabel: null });
    expect(row("amihud_lo_v1").next.line).toBe(row("amihud_lo_v1").next.text);
    expect(row("btc_hold_baseline").next).toBeNull();
    const starved = makeStream("x", "2026-01-01", 181, 5);
    expect(nextReadDate(starved, nextRead(starved, makeCone("x")), AS_OF)).toBeNull();
    const done = makeStream("x", "2025-09-01", 365, 25);
    const end = nextRead(done, makeCone("x", [read(360, "ON_TRACK")]));
    expect(end.kind).toBe("grid_end");
    expect(nextReadDate(done, end, AS_OF)).toBeNull();
  });

  it("adds the year only when it differs from the payload's as_of year", () => {
    const s = makeStream("x", "2026-12-01", 10, 25); // row 90 -> 1 Mar 2027
    const next = nextRead(s, makeCone("x"));
    expect(nextReadDate(s, next, "2026-12-10")).toBe(`≈${fmtDay("2027-03-01")}`);
    expect(nextReadDate(s, next, "2027-01-02")).toBe(`≈${fmtShortDay("2027-03-01", "2027-01-02")}`);
    expect(nextReadDate(s, next, "2027-01-02")).not.toContain("2027");
  });

  it("cone chart labels only read horizons and the next read", () => {
    const s = findStream(summary, "tsmom_v1");
    const cone = coneFor(cones, "tsmom_v1");
    const labels = horizonDateLabels(s, cone, row("tsmom_v1").next, AS_OF);
    expect(labels).toEqual([
      { horizon: 120, label: `≈${day("2026-10-10")}`, role: "next" },
      { horizon: 90, label: day("2026-09-10"), role: "latest" },
    ]);
    const realized = realizedSeries(s);
    const gridPoints = gridPointsInWindow(cone, 105);
    const svg = coneChartSvg(
      { realized, gridPoints, reads: chartReads(cone, 120), horizonDates: labels },
      { width: 640, height: 240 },
    );
    expect(svg.match(/cone-chart__date-label/g)).toHaveLength(2);
    expect(svg).toContain(`>${day("2026-09-10")}</text>`);
  });
});

describe("date label collisions", () => {
  const item = (horizon, role, label = "10 Nov") => ({ horizon, label, role });

  it("keeps the latest and next reads, pushed apart end / start", () => {
    const placed = placeDateLabels([item(210, "next"), item(180, "latest"), item(150, "older")], (h) => h * 0.83);
    expect(placed.map((p) => [p.horizon, p.anchor])).toEqual([
      [180, "end"],
      [210, "start"],
    ]);
  });

  it("drops the oldest read date first", () => {
    // Older reads at 500 (newer) and 505 (oldest) only collide with each other.
    const placed = placeDateLabels(
      [item(5000, "next"), item(0, "latest"), item(500, "older"), item(505, "older")],
      (h) => h,
    );
    expect(placed.map((p) => p.horizon).sort((a, b) => a - b)).toEqual([0, 500, 5000]);
  });

  it("keeps labels inside the viewBox; latest stays left of a pulled-in next", () => {
    // 360 viewBox, plot 48..346, window 0..360 rows: the last horizon is the edge.
    const xAt = (h) => 48 + (h / 360) * 298;
    const placed = placeDateLabels([item(360, "next", "≈27 Nov 2027"), item(330, "latest"), item(300, "older")], xAt, 360);
    const [latest, next] = placed;
    expect(placed.map((p) => p.role)).toEqual(["latest", "next"]);
    expect(next).toMatchObject({ anchor: "end", x: 359 });
    const nextLeft = next.x - tickLabelWidth(next.label);
    expect(latest.anchor).toBe("end");
    expect(latest.x).toBeLessThanOrEqual(nextLeft);
    expect(latest.x - tickLabelWidth(latest.label)).toBeGreaterThan(0);
  });

  it("centres every label when nothing collides", () => {
    const placed = placeDateLabels([item(120, "next"), item(90, "latest")], (h) => h * 5);
    expect(placed.map((p) => p.anchor)).toEqual(["middle", "middle"]);
  });
});
