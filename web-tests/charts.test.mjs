// Cone y-axis label fit and the live-path overlay labels.

import { describe, expect, it } from "vitest";

import { coneChartSvg, livePathSvg, tickLabelWidth } from "../public/chart.js";

const pc = (p1, p95) => ({ p1, p5: p1, p50: 0, p95 });

// [{ x, label }] of the right-aligned y labels.
function yLabels(svg) {
  return [...svg.matchAll(/<text x="([-\d.]+)" y="[-\d.]+" class="cone-chart__tick-label" text-anchor="end"[^>]*>([^<]*)<\/text>/g)].map(
    (m) => ({ x: Number(m[1]), label: m[2] }),
  );
}

function cone(p1, p95, width) {
  return coneChartSvg(
    { realized: [{ row: 0, cumReturn: 0 }, { row: 30, cumReturn: 0 }], gridPoints: [{ horizon: 90, percentiles: pc(p1, p95) }], reads: [] },
    { width, height: 240 },
  );
}

const axisX = (svg) => Number(svg.match(/<line x1="([\d.]+)"[^>]*class="cone-chart__axis"/)[1]);

describe("cone y labels", () => {
  // Label lengths 4 ("0.0%") to 7 ("+298.2%", "+999.9%").
  const cases = [
    [-0.05, 0.05], // "-5.0%", "0.0%", "+5.0%"
    [-0.505, 0.5], // "-50.5%", "+50.0%"
    [-0.5, 2.982], // "+298.2%"
    [-0.999, 9.999], // "-99.9%", "+999.9%"
  ];

  for (const width of [640, 360]) {
    it(`no label extends past x = 0 at width ${width}`, () => {
      const lengths = new Set();
      for (const [lo, hi] of cases) {
        const labels = yLabels(cone(lo, hi, width));
        expect(labels.length).toBeGreaterThanOrEqual(2);
        for (const { x, label } of labels) {
          lengths.add(label.length);
          expect(x - tickLabelWidth(label), label).toBeGreaterThanOrEqual(0);
        }
      }
      expect([...lengths].sort()).toEqual([4, 5, 6, 7]);
    });
  }

  it("the plot does not move when the labels already fit", () => {
    for (const width of [640, 360]) {
      expect(axisX(cone(-0.05, 0.05, width))).toBe(48);
      expect(axisX(cone(-0.505, 0.05, width))).toBe(48); // "-50.5%"
      expect(axisX(cone(-0.5, 2.982, width))).toBeGreaterThan(48); // "+298.2%" needs room
    }
  });
});

describe("live path overlay labels", () => {
  const pts = (values) => values.map((pct, i) => ({ date: `2026-09-${String(i + 1).padStart(2, "0")}`, pct }));
  const overlay = (svg) => ({
    top: [...svg.match(/<div class="live-path__top">([\s\S]*?)<\/div>/)[1].matchAll(/<span[^>]*>([^<]*)<\/span>/g)].map((m) => m[1]),
    bottom: svg.match(/<div class="live-path__bottom"><span[^>]*>([^<]*)<\/span><\/div>/)[1],
  });

  it("hides the max label when the max is the last point", () => {
    expect(overlay(livePathSvg(pts([0, 2, 5])))).toEqual({ top: ["", "+5.00%"], bottom: "0.0%" });
  });

  it("hides the min label when the min is the last point", () => {
    expect(overlay(livePathSvg(pts([0, 3, -4])))).toEqual({ top: ["+3.0%", "-4.00%"], bottom: "" });
  });

  it("keeps both when neither extreme is the last point", () => {
    expect(overlay(livePathSvg(pts([0, 5, -3, 2])))).toEqual({ top: ["+5.0%", "+2.00%"], bottom: "-3.0%" });
  });
});
