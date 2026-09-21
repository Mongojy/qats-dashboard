// Tiny inline-SVG line chart. No canvas — just <line>/<circle> elements
// scaled to fit a viewBox, with x/y axes and sign-colored segments.

import { escapeHtml } from "./format.js";

const PAD = { top: 10, right: 12, bottom: 22, left: 40 };
const MAX_X_TICKS = 5;

function bucket(value) {
  return value >= 0 ? "pos" : "neg";
}

// Evenly-spaced indices into [0, n), always including 0 and n-1.
function pickTickIndices(n, maxTicks) {
  if (n <= 1) return [0];
  if (n <= maxTicks) return Array.from({ length: n }, (_, i) => i);
  const step = (n - 1) / (maxTicks - 1);
  const indices = new Set();
  for (let i = 0; i < maxTicks; i++) indices.add(Math.round(i * step));
  return [...indices].sort((a, b) => a - b);
}

function xTickLabel(date) {
  return typeof date === "string" ? date.slice(5) : String(date);
}

export function netPnlChartSvg(points, { width = 560, height = 160 } = {}) {
  const series = Array.isArray(points) ? points : [];
  if (series.length === 0) {
    return `<svg viewBox="0 0 ${width} ${height}" class="pnl-chart pnl-chart--empty"></svg>`;
  }

  const values = series.map((p) => p.pct);
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const span = max - min || 1;

  const innerW = width - PAD.left - PAD.right;
  const innerH = height - PAD.top - PAD.bottom;
  const step = series.length > 1 ? innerW / (series.length - 1) : 0;

  const xAt = (i) => PAD.left + i * step;
  const yAt = (v) => PAD.top + innerH - ((v - min) / span) * innerH;
  const yZero = yAt(0);

  const coords = series.map((p, i) => ({ x: xAt(i), y: yAt(p.pct), v: p.pct }));

  // y-axis ticks: min/0/max, deduped, and dropped if within ~5% of the
  // 0-gridline in pixel space (avoids label collision with "0%").
  const collisionPx = innerH * 0.05;
  const yTickValues = [...new Set([min, 0, max])].filter(
    (v) => v === 0 || Math.abs(yAt(v) - yZero) >= collisionPx,
  );
  const yTicks = yTickValues
    .map(
      (v) => `
      <line x1="${PAD.left - 4}" y1="${yAt(v).toFixed(2)}" x2="${PAD.left}" y2="${yAt(v).toFixed(2)}" class="pnl-chart__tick" />
      <text x="${(PAD.left - 8).toFixed(2)}" y="${yAt(v).toFixed(2)}" class="pnl-chart__tick-label" text-anchor="end" dominant-baseline="middle">${fmtPctLabel(v)}</text>
    `,
    )
    .join("");

  const xTickIndices = pickTickIndices(series.length, MAX_X_TICKS);
  const xTicks = xTickIndices
    .map((i) => {
      const x = xAt(i).toFixed(2);
      const y = (PAD.top + innerH).toFixed(2);
      return `
      <line x1="${x}" y1="${y}" x2="${x}" y2="${(PAD.top + innerH + 4).toFixed(2)}" class="pnl-chart__tick" />
      <text x="${x}" y="${(PAD.top + innerH + 15).toFixed(2)}" class="pnl-chart__tick-label" text-anchor="middle">${xTickLabel(series[i].date)}</text>
    `;
    })
    .join("");

  const axes = `
    <line x1="${PAD.left}" y1="${PAD.top}" x2="${PAD.left}" y2="${(PAD.top + innerH).toFixed(2)}" class="pnl-chart__axis" />
    <line x1="${PAD.left}" y1="${(PAD.top + innerH).toFixed(2)}" x2="${(PAD.left + innerW).toFixed(2)}" y2="${(PAD.top + innerH).toFixed(2)}" class="pnl-chart__axis" />
    <line x1="${PAD.left}" y1="${yZero.toFixed(2)}" x2="${(PAD.left + innerW).toFixed(2)}" y2="${yZero.toFixed(2)}" class="pnl-chart__zero-line" />
  `;

  let plot;
  if (coords.length === 1) {
    const p = coords[0];
    plot = `<circle cx="${p.x.toFixed(2)}" cy="${p.y.toFixed(2)}" r="3" class="pnl-chart__point pnl-chart__point--${bucket(p.v)}" />`;
  } else {
    const segments = [];
    for (let i = 0; i < coords.length - 1; i++) {
      const a = coords[i];
      const b = coords[i + 1];
      const bucketA = bucket(a.v);
      const bucketB = bucket(b.v);
      if (bucketA === bucketB) {
        segments.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, color: bucketA });
      } else {
        const t = a.v / (a.v - b.v);
        const crossX = a.x + (b.x - a.x) * t;
        segments.push({ x1: a.x, y1: a.y, x2: crossX, y2: yZero, color: bucketA });
        segments.push({ x1: crossX, y1: yZero, x2: b.x, y2: b.y, color: bucketB });
      }
    }
    plot = segments
      .map(
        (s) =>
          `<line x1="${s.x1.toFixed(2)}" y1="${s.y1.toFixed(2)}" x2="${s.x2.toFixed(2)}" y2="${s.y2.toFixed(2)}" class="pnl-chart__segment pnl-chart__segment--${s.color}" />`,
      )
      .join("");
  }

  return `
    <svg viewBox="0 0 ${width} ${height}" class="pnl-chart">
      ${axes}
      ${yTicks}
      ${xTicks}
      ${plot}
    </svg>
  `;
}

function fmtPctLabel(value) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

// fraction -> "+12.3%"-style label, for cone-chart values (percentiles,
// realized returns) which are stored as fractions, not already-scaled
// percentages like netPnlChartSvg's input.
function fmtFracPctLabel(value) {
  return fmtPctLabel(value * 100);
}

const CONE_PAD = { top: 10, right: 12, bottom: 22, left: 44 };

// Percentile-cone chart: a p5-p95 bar + p1 whisker + p50 tick at each grid
// horizon in view, with the realized cumulative-return line drawn over it
// and a marker per written verdict read. Self-contained — does not share
// code with netPnlChartSvg, which stays untouched.
//
// Inputs are adapter output only (public/cones.js), never raw cone fields:
//   realized:   [{ row, cumReturn }]                  from realizedSeries(stream)
//   gridPoints: [{ horizon, percentiles|null }]        from gridPointsInWindow(cone, lastRow)
//   reads:      [{ horizon, y, label }]                from chartReads(cone, windowEnd)
export function coneChartSvg({ realized, gridPoints, reads }, { width = 560, height = 200 } = {}) {
  const realizedSeries = Array.isArray(realized) ? realized : [];
  const validGridPoints = (Array.isArray(gridPoints) ? gridPoints : []).filter((gp) => gp && gp.percentiles);
  const readMarkers = Array.isArray(reads) ? reads : [];

  if (validGridPoints.length === 0) {
    return `<svg viewBox="0 0 ${width} ${height}" class="cone-chart cone-chart--empty"></svg>`;
  }

  const windowEnd = validGridPoints[validGridPoints.length - 1].horizon;
  const lastRow = realizedSeries.length ? realizedSeries[realizedSeries.length - 1].row : 0;
  const xDomainEnd = Math.max(windowEnd, lastRow, 1);

  const innerW = width - CONE_PAD.left - CONE_PAD.right;
  const innerH = height - CONE_PAD.top - CONE_PAD.bottom;
  const xAt = (row) => CONE_PAD.left + (row / xDomainEnd) * innerW;

  const yValues = [0, ...realizedSeries.map((p) => p.cumReturn), ...readMarkers.map((r) => r.y)];
  for (const gp of validGridPoints) yValues.push(gp.percentiles.p1, gp.percentiles.p95);
  const yMin = Math.min(...yValues);
  const yMax = Math.max(...yValues);
  const ySpan = yMax - yMin || 1;
  const yAt = (v) => CONE_PAD.top + innerH - ((v - yMin) / ySpan) * innerH;
  const yZero = yAt(0);

  const axes = `
    <line x1="${CONE_PAD.left}" y1="${CONE_PAD.top}" x2="${CONE_PAD.left}" y2="${(CONE_PAD.top + innerH).toFixed(2)}" class="cone-chart__axis" />
    <line x1="${CONE_PAD.left}" y1="${(CONE_PAD.top + innerH).toFixed(2)}" x2="${(CONE_PAD.left + innerW).toFixed(2)}" y2="${(CONE_PAD.top + innerH).toFixed(2)}" class="cone-chart__axis" />
    <line x1="${CONE_PAD.left}" y1="${yZero.toFixed(2)}" x2="${(CONE_PAD.left + innerW).toFixed(2)}" y2="${yZero.toFixed(2)}" class="cone-chart__zero-line" />
  `;

  const yTickValues = [...new Set([yMin, 0, yMax])];
  const yTicks = yTickValues
    .map(
      (v) => `
      <line x1="${CONE_PAD.left - 4}" y1="${yAt(v).toFixed(2)}" x2="${CONE_PAD.left}" y2="${yAt(v).toFixed(2)}" class="cone-chart__tick" />
      <text x="${(CONE_PAD.left - 8).toFixed(2)}" y="${yAt(v).toFixed(2)}" class="cone-chart__tick-label" text-anchor="end" dominant-baseline="middle">${fmtFracPctLabel(v)}</text>
    `,
    )
    .join("");

  const xTicks = validGridPoints
    .map((gp) => {
      const x = xAt(gp.horizon).toFixed(2);
      const y = (CONE_PAD.top + innerH).toFixed(2);
      return `
      <line x1="${x}" y1="${y}" x2="${x}" y2="${(CONE_PAD.top + innerH + 4).toFixed(2)}" class="cone-chart__tick" />
      <text x="${x}" y="${(CONE_PAD.top + innerH + 15).toFixed(2)}" class="cone-chart__tick-label" text-anchor="middle">${gp.horizon}</text>
    `;
    })
    .join("");

  const barsAndWhiskers = validGridPoints
    .map((gp) => {
      const x = xAt(gp.horizon).toFixed(2);
      const pc = gp.percentiles;
      return `
      <line x1="${x}" y1="${yAt(pc.p1).toFixed(2)}" x2="${x}" y2="${yAt(pc.p5).toFixed(2)}" class="cone-chart__whisker" />
      <line x1="${x}" y1="${yAt(pc.p5).toFixed(2)}" x2="${x}" y2="${yAt(pc.p95).toFixed(2)}" class="cone-chart__bar" />
      <line x1="${(xAt(gp.horizon) - 5).toFixed(2)}" y1="${yAt(pc.p50).toFixed(2)}" x2="${(xAt(gp.horizon) + 5).toFixed(2)}" y2="${yAt(pc.p50).toFixed(2)}" class="cone-chart__median" />
    `;
    })
    .join("");

  let realizedLine = "";
  if (realizedSeries.length === 1) {
    const p = realizedSeries[0];
    realizedLine = `<circle cx="${xAt(p.row).toFixed(2)}" cy="${yAt(p.cumReturn).toFixed(2)}" r="3" class="cone-chart__realized cone-chart__realized--${bucket(p.cumReturn)}" />`;
  } else if (realizedSeries.length > 1) {
    const coords = realizedSeries.map((p) => ({ x: xAt(p.row), y: yAt(p.cumReturn), v: p.cumReturn }));
    const segments = [];
    for (let i = 0; i < coords.length - 1; i++) {
      const a = coords[i];
      const b = coords[i + 1];
      const bucketA = bucket(a.v);
      const bucketB = bucket(b.v);
      if (bucketA === bucketB) {
        segments.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, color: bucketA });
      } else {
        const t = a.v / (a.v - b.v);
        const crossX = a.x + (b.x - a.x) * t;
        segments.push({ x1: a.x, y1: a.y, x2: crossX, y2: yZero, color: bucketA });
        segments.push({ x1: crossX, y1: yZero, x2: b.x, y2: b.y, color: bucketB });
      }
    }
    realizedLine = segments
      .map(
        (s) =>
          `<line x1="${s.x1.toFixed(2)}" y1="${s.y1.toFixed(2)}" x2="${s.x2.toFixed(2)}" y2="${s.y2.toFixed(2)}" class="cone-chart__realized cone-chart__realized--${s.color}" />`,
      )
      .join("");
  }

  const markers = readMarkers
    .map((r) => {
      const x = xAt(r.horizon).toFixed(2);
      const y = yAt(r.y).toFixed(2);
      return `
      <circle cx="${x}" cy="${y}" r="4" class="cone-chart__marker" />
      <text x="${x}" y="${(yAt(r.y) - 8).toFixed(2)}" class="cone-chart__marker-label" text-anchor="middle">${escapeHtml(r.label ?? "")}</text>
    `;
    })
    .join("");

  return `
    <svg viewBox="0 0 ${width} ${height}" class="cone-chart">
      ${axes}
      ${yTicks}
      ${xTicks}
      ${barsAndWhiskers}
      ${realizedLine}
      ${markers}
    </svg>
  `;
}
