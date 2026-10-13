// Line colour by segment sign (chart.js signRuns), shared by the sparkline,
// the live path and the cone chart's realized line.

import { describe, expect, it } from "vitest";

import { livePathSvg, signRuns, sparklineSvg } from "../public/chart.js";

const pts = (values) => values.map((pct, i) => ({ date: `2026-09-${String(i + 1).padStart(2, "0")}`, pct }));

// [{ tone, d }] for every coloured line path in the SVG.
function linePaths(svg, prefix) {
  const re = new RegExp(`<path d="([^"]*)" class="${prefix}__line ${prefix}__line--(pos|neg)" vector-effect="non-scaling-stroke"`, "g");
  return [...svg.matchAll(re)].map((m) => ({ tone: m[2], d: m[1] }));
}

describe("signRuns", () => {
  const c = (values) => values.map((v, i) => ({ x: i * 10, y: -v, v }));

  it("splits at the interpolated zero crossing", () => {
    expect(signRuns(c([1, -3]), 0)).toEqual([
      { tone: "pos", points: [{ x: 0, y: -1 }, { x: 2.5, y: 0 }] },
      { tone: "neg", points: [{ x: 2.5, y: 0 }, { x: 10, y: 3 }] },
    ]);
  });

  it("one run for a one-sign series", () => {
    expect(signRuns(c([1, 2, 3]), 0).map((r) => [r.tone, r.points.length])).toEqual([["pos", 3]]);
    expect(signRuns(c([-1, -2, -3]), 0).map((r) => [r.tone, r.points.length])).toEqual([["neg", 3]]);
  });

  it("a point exactly at 0 creates no empty run", () => {
    const runs = signRuns(c([1, 0, -1, 0, 1]), 0);
    expect(runs.map((r) => r.tone)).toEqual(["pos", "neg", "pos"]);
    for (const r of runs) {
      expect(r.points.length).toBeGreaterThanOrEqual(2);
      const [a, b] = [r.points[0], r.points[r.points.length - 1]];
      expect(a.x === b.x && a.y === b.y).toBe(false);
    }
    expect(signRuns(c([0, 0, 2]), 0).map((r) => r.tone)).toEqual(["pos"]);
  });
});

describe("sparkline colour by segment sign", () => {
  it("mixed series: both tones, crossing x interpolated", () => {
    // x runs 1..159 (pad 1, width 160); 1 -> -1 crosses at the midpoint.
    const paths = linePaths(sparklineSvg(pts([1, -1])), "spark");
    expect(paths.map((p) => p.tone)).toEqual(["pos", "neg"]);
    expect(paths[0].d).toMatch(/^M1\.00 [\d.]+ L80\.00 [\d.]+$/);
    expect(paths[1].d).toMatch(/^M80\.00 [\d.]+ L159\.00 [\d.]+$/);
  });

  it("same crossing expectation as the live path", () => {
    const paths = linePaths(livePathSvg(pts([1, -1])), "live-path");
    expect(paths.map((p) => p.tone)).toEqual(["pos", "neg"]);
    expect(paths[0].d).toMatch(/L320\.00 [\d.]+$/);
    expect(paths[1].d).toMatch(/^M320\.00 /);
  });

  it("all-positive / all-negative: one tone only", () => {
    expect(linePaths(sparklineSvg(pts([1, 2, 1.5])), "spark").map((p) => p.tone)).toEqual(["pos"]);
    expect(linePaths(sparklineSvg(pts([-1, -2, -1.5])), "spark").map((p) => p.tone)).toEqual(["neg"]);
  });

  it("exactly-zero point: no empty segment", () => {
    const paths = linePaths(sparklineSvg(pts([2, 0, -2])), "spark");
    expect(paths.map((p) => p.tone)).toEqual(["pos", "neg"]);
    for (const p of paths) expect(p.d).toMatch(/^M[\d.]+ [\d.]+( L[\d.]+ [\d.]+)+$/);
  });

  it("keeps the zero line and the no-fill, non-scaling setup", () => {
    const svg = sparklineSvg(pts([1, -1, 2, -2]));
    expect(svg).toContain('preserveAspectRatio="none"');
    expect(svg).toContain('class="spark__zero"');
    expect(svg).not.toContain("area");
    const all = [...svg.matchAll(/<path [^>]*>/g)].map((m) => m[0]);
    expect(all).toHaveLength(2);
    for (const p of all) expect(p).toContain('vector-effect="non-scaling-stroke"');
  });

  it("single point renders as before", () => {
    const paths = linePaths(sparklineSvg(pts([-3])), "spark");
    expect(paths).toEqual([{ tone: "neg", d: "M1.00 41.00" }]);
    expect(sparklineSvg([])).toBe(`<svg viewBox="0 0 160 42" class="spark" aria-hidden="true"></svg>`);
  });
});
