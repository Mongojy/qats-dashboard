// Inline-SVG charts. No canvas, no library. Pure string builders — no DOM —
// so they can be unit-tested and rendered through innerHTML. Every label is
// either a number formatted here or a string passed through escapeHtml.

import { escapeHtml, fmtDay } from "./format.js";
import { dateAtRow, weekBandSpans } from "./calendar.js";

function bucket(value) {
  return value >= 0 ? "pos" : "neg";
}

function fmtPctLabel(value, decimals = 1) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(decimals)}%`;
}

// fraction -> "+12.3%"-style label, for cone-chart values (percentiles,
// realized returns) which are stored as fractions, not already-scaled
// percentages like the live-path input.
function fmtFracPctLabel(value) {
  return fmtPctLabel(value * 100);
}

function fixed(n) {
  return n.toFixed(2);
}

// Week bands (calendar.js weekBandSpans): only the brighter weeks are drawn;
// the others are the chart's own background. Always the first layer.
function weekBandRects(spans, y, height) {
  return spans
    .filter((s) => s.alt)
    .map(
      (s) =>
        `<rect x="${fixed(s.x1)}" y="${fixed(y)}" width="${fixed(s.x2 - s.x1)}" height="${fixed(height)}" class="week-band" />`,
    )
    .join("");
}

// ---------------------------------------------------------------------------
// Sparkline (strategy card). Input: liveSeries(stream) -> [{ date, pct }].
// Zero baseline + one path coloured by the sign of the last point.
// ---------------------------------------------------------------------------

export function sparklineSvg(points) {
  const w = 160;
  const h = 42;
  const pad = 1;
  const values = (Array.isArray(points) ? points : []).map((p) => p.pct);
  if (values.length === 0) return `<svg viewBox="0 0 ${w} ${h}" class="spark" aria-hidden="true"></svg>`;

  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const span = max - min || 1;
  const xAt = (i) => pad + (i / Math.max(values.length - 1, 1)) * (w - pad * 2);
  const yAt = (v) => pad + (1 - (v - min) / span) * (h - pad * 2);
  const d = values.map((v, i) => `${i === 0 ? "M" : "L"}${fixed(xAt(i))} ${fixed(yAt(v))}`).join(" ");
  const tone = bucket(values[values.length - 1]);

  return `
    <svg viewBox="0 0 ${w} ${h}" class="spark" preserveAspectRatio="none" aria-hidden="true">
      <line x1="0" x2="${w}" y1="${fixed(yAt(0))}" y2="${fixed(yAt(0))}" class="spark__zero" />
      <path d="${d}" class="spark__line spark__line--${tone}" vector-effect="non-scaling-stroke" />
    </svg>
  `;
}

// ---------------------------------------------------------------------------
// Live path (detail view). Input: liveSeries(stream) -> [{ date, pct }],
// rebased to 0 at the anchor row. Area + line split at the zero crossing,
// coloured by sign. Labels (max, last, min, first/last date) are HTML
// overlays so they stay crisp while the SVG stretches to the container.
// ---------------------------------------------------------------------------

// Vertical inset (viewBox units) reserved for the max/last and min overlay
// labels, so the line never runs underneath them.
const LIVE_PAD_Y = 22;

function livePathY(min, max, h) {
  const span = max - min || 1;
  return (v) => LIVE_PAD_Y + (1 - (v - min) / span) * (h - LIVE_PAD_Y * 2);
}

function splitBySign(values, w, h) {
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const yAt = livePathY(min, max, h);
  const xy = values.map((v, i) => ({ x: (i / Math.max(values.length - 1, 1)) * w, y: yAt(v), v }));
  const z = yAt(0);
  const line = { pos: [], neg: [] };
  const area = { pos: [], neg: [] };

  const push = (a, b, tone) => {
    const seg = `M${fixed(a.x)} ${fixed(a.y)} L${fixed(b.x)} ${fixed(b.y)}`;
    line[tone].push(seg);
    area[tone].push(`${seg} L${fixed(b.x)} ${fixed(z)} L${fixed(a.x)} ${fixed(z)} Z`);
  };

  for (let i = 0; i < xy.length - 1; i++) {
    const a = xy[i];
    const b = xy[i + 1];
    if (bucket(a.v) === bucket(b.v)) {
      push(a, b, bucket(a.v));
    } else {
      const t = a.v / (a.v - b.v);
      const cross = { x: a.x + (b.x - a.x) * t, y: z, v: 0 };
      push(a, cross, bucket(a.v));
      push(cross, b, bucket(b.v));
    }
  }
  return { z, line, area };
}

export function livePathSvg(points) {
  const series = Array.isArray(points) ? points : [];
  if (series.length === 0) return `<p class="empty-state">No equity rows yet.</p>`;

  const w = 640;
  const h = 220;
  const values = series.map((p) => p.pct);
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const last = values[values.length - 1];

  const yAt = livePathY(min, max, h);
  let plot;
  if (values.length === 1) {
    const y = yAt(last);
    plot = `<circle cx="${w / 2}" cy="${fixed(y)}" r="3" class="live-path__point live-path__point--${bucket(last)}" />`;
  } else {
    const { line, area } = splitBySign(values, w, h);
    plot = `
      <path d="${area.pos.join(" ")}" class="live-path__area live-path__area--pos" />
      <path d="${area.neg.join(" ")}" class="live-path__area live-path__area--neg" />
      <path d="${line.pos.join(" ")}" class="live-path__line live-path__line--pos" vector-effect="non-scaling-stroke" />
      <path d="${line.neg.join(" ")}" class="live-path__line live-path__line--neg" vector-effect="non-scaling-stroke" />
    `;
  }
  const z = yAt(0);
  // x is index-based (unchanged geometry); bands map dates through the same
  // per-point x, so a date gap would still land on the right x.
  const bandPoints = series.length > 1 ? series.map((p, i) => ({ date: p.date, x: (i / (series.length - 1)) * w })) : [];
  const bands = weekBandRects(weekBandSpans(bandPoints, { x0: 0, x1: w }), 0, h);

  return `
    <div class="live-path">
      <svg viewBox="0 0 ${w} ${h}" class="live-path__svg" preserveAspectRatio="none" role="img" aria-label="Live P&amp;L path from the anchor close">
        ${bands}
        <line x1="0" x2="${w}" y1="${fixed(z)}" y2="${fixed(z)}" class="live-path__zero" vector-effect="non-scaling-stroke" />
        ${plot}
      </svg>
      <div class="live-path__top">
        <span class="tabular">${fmtPctLabel(max)}</span>
        <span class="tabular live-path__last live-path__last--${bucket(last)}">${fmtPctLabel(last, 2)}</span>
      </div>
      <div class="live-path__bottom"><span class="tabular">${fmtPctLabel(min)}</span></div>
    </div>
    <div class="live-path__dates">
      <span>${escapeHtml(fmtDay(series[0].date))}</span>
      <span>${escapeHtml(fmtDay(series[series.length - 1].date))}</span>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Percentile-cone chart: a p5-p95 bar + p1 whisker + p50 tick at each grid
// horizon in view (grid points only, no interpolation, nothing below the
// first horizon), with the realized cumulative-return line drawn over it and
// a marker per written verdict read labelled with its overall_status.
//
// Inputs are adapter output only (public/cones.js), never raw cone fields:
//   realized:   [{ row, cumReturn }]                  from realizedSeries(stream)
//   gridPoints: [{ horizon, percentiles|null }]        from gridPointsInWindow(cone, lastRow)
//   reads:      [{ horizon, y, label }]                from chartReads(cone, windowEnd)
//   rowDates:   [date|null] by row                     from data.js rowDates(stream)
//   horizonDates: [{ horizon, label, role }]           from horizonDateLabels(...)
// ---------------------------------------------------------------------------

const CONE_PAD = { top: 18, right: 14, bottom: 24, left: 48 };
// Extra viewBox height under the x axis for the date line below the horizon
// ticks; the plot (pad, innerH, y-domain) is unchanged.
const CONE_DATE_LINE = 12;
const TICK_FONT_PX = 11;
const LABEL_GAP = 4;

// Advance widths (em) of IBM Plex Sans Regular, the tick-label font,
// measured in the browser (canvas measureText, 2026-10-13) for the glyphs of
// "≈27 Nov 2027"-style labels; anything unlisted uses the widest (M).
const PLEX_SANS_EM = {
  ...Object.fromEntries([..."0123456789"].map((d) => [d, 0.6])),
  " ": 0.236,
  "≈": 0.604,
  A: 0.641, D: 0.671, F: 0.559, J: 0.51, M: 0.812, N: 0.707, O: 0.708, S: 0.581,
  a: 0.534, b: 0.58, c: 0.503, e: 0.549, g: 0.528, l: 0.272, n: 0.568, o: 0.56,
  p: 0.58, r: 0.367, t: 0.351, u: 0.568, v: 0.492, y: 0.499,
  FALLBACK: 0.812,
};

export function tickLabelWidth(text) {
  let em = 0;
  for (const ch of String(text)) em += PLEX_SANS_EM[ch] ?? PLEX_SANS_EM.FALLBACK;
  return em * TICK_FONT_PX;
}

// Places the date labels under their horizon ticks. "latest" and "next"
// always stay (pushed apart by anchoring "end" / "start" when they would
// overlap centred); "older" read dates are dropped oldest first when they
// collide with anything already placed. Input order: newest first. Labels
// are kept inside [0, width]: one that would overflow the right edge is
// right-aligned to it (the last grid horizon sits on the plot's edge).
// Returns [{ horizon, label, role, anchor, x }].
export function placeDateLabels(items, xAt, width = Infinity) {
  const extent = (p) => {
    const w = tickLabelWidth(p.label);
    const left = p.anchor === "end" ? p.x - w : p.anchor === "start" ? p.x : p.x - w / 2;
    return { left, right: left + w };
  };
  const overlaps = (a, b) => a.left < b.right + LABEL_GAP && b.left < a.right + LABEL_GAP;
  const fit = (p) => {
    const e = extent(p);
    if (e.right > width - 1) return { ...p, anchor: "end", x: width - 1 };
    if (e.left < 1) return { ...p, anchor: "start", x: 1 };
    return p;
  };
  const at = (item, anchor) => ({ ...item, anchor, x: xAt(item.horizon) });

  const seen = new Set();
  const unique = items.filter((i) => !seen.has(i.horizon) && seen.add(i.horizon));
  const latest = unique.find((i) => i.role === "latest");
  const next = unique.find((i) => i.role === "next");
  const placed = [];
  if (latest && next) {
    let l = fit(at(latest, "middle"));
    let n = fit(at(next, "middle"));
    if (overlaps(extent(l), extent(n))) {
      l = fit(at(latest, "end"));
      n = fit(at(next, "start"));
      // next pulled in from the right edge: latest moves left of it.
      if (overlaps(extent(l), extent(n))) l = { ...l, anchor: "end", x: extent(n).left - LABEL_GAP };
    }
    placed.push(l, n);
  } else {
    for (const item of [latest, next]) if (item) placed.push(fit(at(item, "middle")));
  }
  for (const item of unique.filter((i) => i.role === "older")) {
    const p = fit(at(item, "middle"));
    if (placed.every((q) => !overlaps(extent(p), extent(q)))) placed.push(p);
  }
  return placed;
}

function realizedSegments(coords, yZero) {
  const segments = [];
  for (let i = 0; i < coords.length - 1; i++) {
    const a = coords[i];
    const b = coords[i + 1];
    if (bucket(a.v) === bucket(b.v)) {
      segments.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, tone: bucket(a.v) });
    } else {
      const t = a.v / (a.v - b.v);
      const crossX = a.x + (b.x - a.x) * t;
      segments.push({ x1: a.x, y1: a.y, x2: crossX, y2: yZero, tone: bucket(a.v) });
      segments.push({ x1: crossX, y1: yZero, x2: b.x, y2: b.y, tone: bucket(b.v) });
    }
  }
  return segments;
}

function coneLegend() {
  const item = (cls, label) => `<span class="legend__item"><span class="legend__swatch ${cls}"></span>${label}</span>`;
  return `
    <div class="legend">
      ${item("legend__swatch--band", "Expected range p5–p95")}
      ${item("legend__swatch--whisker", "p1")}
      ${item("legend__swatch--median", "Median p50")}
      ${item("legend__swatch--live", "Live path")}
      ${item("legend__swatch--read", "Scheduled read")}
    </div>
  `;
}

export function coneChartSvg({ realized, gridPoints, reads, rowDates, horizonDates }, { width = 640, height = 240 } = {}) {
  const realizedPoints = Array.isArray(realized) ? realized : [];
  const validGridPoints = (Array.isArray(gridPoints) ? gridPoints : []).filter((gp) => gp && gp.percentiles);
  const readMarkers = Array.isArray(reads) ? reads : [];

  if (validGridPoints.length === 0) {
    return `<p class="empty-state">No cone percentiles in this artifact.</p>`;
  }

  const windowEnd = validGridPoints[validGridPoints.length - 1].horizon;
  const lastRow = realizedPoints.length ? realizedPoints[realizedPoints.length - 1].row : 0;
  const xDomainEnd = Math.max(windowEnd, lastRow, 1);

  const innerW = width - CONE_PAD.left - CONE_PAD.right;
  const innerH = height - CONE_PAD.top - CONE_PAD.bottom;
  const xAt = (row) => CONE_PAD.left + (row / xDomainEnd) * innerW;

  const yValues = [0, ...realizedPoints.map((p) => p.cumReturn), ...readMarkers.map((r) => r.y)];
  for (const gp of validGridPoints) yValues.push(gp.percentiles.p1, gp.percentiles.p95);
  const yMin = Math.min(...yValues);
  const yMax = Math.max(...yValues);
  const ySpan = yMax - yMin || 1;
  const yAt = (v) => CONE_PAD.top + innerH - ((v - yMin) / ySpan) * innerH;
  const yZero = yAt(0);
  const bottom = CONE_PAD.top + innerH;

  const axes = `
    <line x1="${CONE_PAD.left}" y1="${fixed(bottom)}" x2="${fixed(CONE_PAD.left + innerW)}" y2="${fixed(bottom)}" class="cone-chart__axis" />
    <line x1="${CONE_PAD.left}" y1="${fixed(yZero)}" x2="${fixed(CONE_PAD.left + innerW)}" y2="${fixed(yZero)}" class="cone-chart__zero-line" />
  `;

  const yTicks = [...new Set([yMin, 0, yMax])]
    .map(
      (v) => `
      <text x="${fixed(CONE_PAD.left - 8)}" y="${fixed(yAt(v))}" class="cone-chart__tick-label" text-anchor="end" dominant-baseline="middle">${fmtFracPctLabel(v)}</text>
    `,
    )
    .join("");

  // Week bands over the whole x window: realized rows carry their own date,
  // rows past the last one are extrapolated a day per row.
  const bandPoints = [];
  for (let row = 0; row <= xDomainEnd; row++) {
    const at = dateAtRow(rowDates, row);
    if (at) bandPoints.push({ date: at.iso, x: xAt(row) });
  }
  const bands = weekBandRects(
    weekBandSpans(bandPoints, { x0: CONE_PAD.left, x1: CONE_PAD.left + innerW }),
    CONE_PAD.top,
    innerH,
  );

  const xTicks = [0, ...validGridPoints.map((gp) => gp.horizon)]
    .map(
      (row) => `
      <text x="${fixed(xAt(row))}" y="${fixed(bottom + 16)}" class="cone-chart__tick-label" text-anchor="middle">${row}</text>
    `,
    )
    .join("");

  const gridHorizons = new Set(validGridPoints.map((gp) => gp.horizon));
  const dateItems = (Array.isArray(horizonDates) ? horizonDates : []).filter((d) => gridHorizons.has(d.horizon));
  const dateLabels = placeDateLabels(dateItems, xAt, width)
    .map(
      (d) => `
      <text x="${fixed(d.x)}" y="${fixed(bottom + 16 + CONE_DATE_LINE)}" class="cone-chart__tick-label cone-chart__date-label" text-anchor="${d.anchor}">${escapeHtml(d.label)}</text>
    `,
    )
    .join("");

  const barsAndWhiskers = validGridPoints
    .map((gp) => {
      const x = fixed(xAt(gp.horizon));
      const pc = gp.percentiles;
      return `
      <line x1="${x}" y1="${fixed(yAt(pc.p1))}" x2="${x}" y2="${fixed(yAt(pc.p5))}" class="cone-chart__whisker" />
      <line x1="${x}" y1="${fixed(yAt(pc.p5))}" x2="${x}" y2="${fixed(yAt(pc.p95))}" class="cone-chart__bar" />
      <line x1="${fixed(xAt(gp.horizon) - 7)}" y1="${fixed(yAt(pc.p50))}" x2="${fixed(xAt(gp.horizon) + 7)}" y2="${fixed(yAt(pc.p50))}" class="cone-chart__median" />
    `;
    })
    .join("");

  let realizedLine = "";
  if (realizedPoints.length === 1) {
    const p = realizedPoints[0];
    realizedLine = `<circle cx="${fixed(xAt(p.row))}" cy="${fixed(yAt(p.cumReturn))}" r="3" class="cone-chart__realized cone-chart__realized--${bucket(p.cumReturn)}" />`;
  } else if (realizedPoints.length > 1) {
    const coords = realizedPoints.map((p) => ({ x: xAt(p.row), y: yAt(p.cumReturn), v: p.cumReturn }));
    realizedLine = realizedSegments(coords, yZero)
      .map(
        (s) =>
          `<line x1="${fixed(s.x1)}" y1="${fixed(s.y1)}" x2="${fixed(s.x2)}" y2="${fixed(s.y2)}" class="cone-chart__realized cone-chart__realized--${s.tone}" />`,
      )
      .join("");
  }

  const markers = readMarkers
    .filter((r) => typeof r.y === "number")
    .map((r) => {
      const x = fixed(xAt(r.horizon));
      const y = yAt(r.y);
      return `
      <circle cx="${x}" cy="${fixed(y)}" r="4.5" class="cone-chart__marker" />
      <text x="${x}" y="${fixed(y - 10)}" class="cone-chart__marker-label" text-anchor="middle">${escapeHtml(r.label ?? "")}</text>
    `;
    })
    .join("");

  return `
    <svg viewBox="0 0 ${width} ${height + CONE_DATE_LINE}" class="cone-chart" role="img" aria-label="Expected range versus live path">
      ${bands}
      ${axes}
      ${yTicks}
      ${xTicks}
      ${dateLabels}
      ${barsAndWhiskers}
      ${realizedLine}
      ${markers}
    </svg>
    ${coneLegend()}
  `;
}
