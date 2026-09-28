// Single place that knows verdict_cones.json's shape. Mirrors data.js's rule
// for dashboard_summary.json: views consume the derived helpers below and
// never touch a cone's raw fields (reads[], trim, percentile_position, ...)
// directly.
//
// Pure module apart from loadCones()'s fetch — no DOM, nothing runs at
// import time, so web-tests/ can import it in node.

import { rowIndex, verdictProgress } from "./data.js";

const NA = "n/a";

let conesPromise = null;

// Fetched once at startup (in parallel with /api/summary) and cached for the
// page's lifetime. A failure is not pinned: the cache resets so the next
// navigation gets a fresh attempt.
export function loadCones() {
  if (!conesPromise) {
    conesPromise = fetch("/api/verdicts")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .catch((err) => {
        conesPromise = null;
        throw err;
      });
  }
  return conesPromise;
}

// The raw per-stream cone entry (an opaque handle — pass it to the other
// helpers below, never read its fields directly) or null when the artifact
// has no cone for this stream. No cone == reference stream (payload-driven,
// never a hardcoded id).
export function coneFor(payload, streamId) {
  const streams = Array.isArray(payload?.streams) ? payload.streams : [];
  return streams.find((s) => s.strategy_id === streamId) ?? null;
}

export function artifactGeneratedAt(payload) {
  return payload?.generated_at ?? null;
}

function reads(cone) {
  return Array.isArray(cone?.reads) ? cone.reads : [];
}

// Total written reads across every stream in the artifact.
export function readsWrittenCount(payload) {
  const streams = Array.isArray(payload?.streams) ? payload.streams : [];
  return streams.reduce((n, s) => n + reads(s).length, 0);
}

// ---------------------------------------------------------------------------
// Status (protocol v1 §5): the latest WRITTEN read's overall_status. Between
// scheduled reads the dashboard is monitoring, not evidence. Flags never feed
// this.
// ---------------------------------------------------------------------------

const STATUS_LABELS = {
  ON_TRACK: { label: "On track", tone: "up" },
  WATCH: { label: "Watch", tone: "warn" },
  KILL: { label: "Kill", tone: "down" },
  INCOMPLETE: { label: "Incomplete", tone: "info" },
  SUSPEND: { label: "Suspended", tone: "down" },
};

export function statusLabel(token) {
  return STATUS_LABELS[token]?.label ?? String(token);
}

// conesState: "loading" | "failed" | "ready". cone: coneFor(...) result.
// Returns { kind, token, label, tone, horizon }:
//   kind "pending" | "unknown" | "reference" | "no_read" | "read"
export function streamStatus(conesState, cone) {
  if (conesState === "loading") return { kind: "pending", token: null, label: "…", tone: "subtle", horizon: null };
  if (conesState !== "ready") return { kind: "unknown", token: null, label: "Unknown", tone: "subtle", horizon: null };
  if (cone === null) return { kind: "reference", token: null, label: "Reference", tone: "info", horizon: null };
  const all = reads(cone);
  if (all.length === 0) return { kind: "no_read", token: null, label: "No read yet", tone: "subtle", horizon: null };
  const last = all[all.length - 1];
  const token = last.overall_status ?? null;
  const known = STATUS_LABELS[token];
  return {
    kind: "read",
    token,
    label: known ? known.label : String(token),
    tone: known ? known.tone : "subtle",
    horizon: typeof last.horizon === "number" ? last.horizon : null,
  };
}

// ---------------------------------------------------------------------------
// Next scheduled read — an ESTIMATE (protocol §5, lock D2: 30-close grid from
// 90). Row-index basis (closes after the anchor), never producer
// daily_closes. Returns null for a reference stream (no cone), else
// { kind, text, row, closesLeft }:
//   kind "scheduled" | "due" | "waiting_trades" | "trade_starved" | "grid_end"
// ---------------------------------------------------------------------------

const GRID_STEP = 30;
const FIRST_READ_ROW = 90;
const TRADE_STARVED_ROW = 180;

function gridHorizons(cone) {
  const hs = Array.isArray(cone?.horizons) ? cone.horizons.filter((h) => typeof h === "number") : [];
  return [...hs].sort((a, b) => a - b);
}

function scheduledAt(row, index) {
  if (index >= row) return { kind: "due", text: `Read due at row ${row}`, row, closesLeft: 0 };
  const left = row - index;
  return {
    kind: "scheduled",
    text: `Next read at row ${row} · ~${left} ${left === 1 ? "close" : "closes"}`,
    row,
    closesLeft: left,
  };
}

function gridEnd(grid) {
  const last = grid.length ? grid[grid.length - 1] : null;
  return {
    kind: "grid_end",
    text: `Beyond the cone grid (row ${last ?? "—"}) — no scheduled read on the grid`,
    row: null,
    closesLeft: null,
  };
}

export function nextRead(stream, cone) {
  if (cone === null || cone === undefined) return null;
  const index = rowIndex(stream);
  if (index === null) return null;
  const grid = gridHorizons(cone);
  const all = reads(cone);

  if (all.length > 0) {
    const lastHorizon = all[all.length - 1].horizon;
    if (typeof lastHorizon !== "number") return null;
    const next = lastHorizon + GRID_STEP;
    if (grid.length && next > grid[grid.length - 1]) return gridEnd(grid);
    return scheduledAt(next, index);
  }

  const { closedTrades, closedTradesRequired } = verdictProgress(stream);
  if (closedTrades !== null && closedTradesRequired !== null && closedTrades < closedTradesRequired) {
    if (index >= TRADE_STARVED_ROW) {
      return { kind: "trade_starved", text: "Trade-starved: cone-only read, cost leg inconclusive", row: null, closesLeft: null };
    }
    const k = closedTradesRequired - closedTrades;
    return { kind: "waiting_trades", text: `Waiting on closed trades — ${k} more needed`, row: null, closesLeft: null };
  }

  const floor = Math.max(FIRST_READ_ROW, index);
  const next = grid.find((h) => h >= floor);
  if (next === undefined) return gridEnd(grid);
  return scheduledAt(next, index);
}

// Card bar, in percent (0–100), or null for no bar. Row-index basis:
//   no reads yet      index / next.row
//   has reads         progress through the current 30-row interval:
//                     (index − last read horizon) / (next.row − last read horizon)
//   waiting on trades closed / required (producer fields)
//   reference, trade-starved, beyond the grid: no bar
export function nextReadProgressPct(stream, cone, next) {
  if (!next) return null;
  const clamp = (v) => Math.max(0, Math.min(100, v));
  const index = rowIndex(stream);
  if (next.kind === "scheduled" || next.kind === "due") {
    if (index === null || !next.row) return null;
    const all = reads(cone);
    const lastHorizon = all.length ? all[all.length - 1].horizon : null;
    if (typeof lastHorizon === "number" && next.row > lastHorizon) {
      return clamp(((index - lastHorizon) / (next.row - lastHorizon)) * 100);
    }
    return clamp((index / next.row) * 100);
  }
  if (next.kind === "waiting_trades") {
    const { closedTrades, closedTradesRequired } = verdictProgress(stream);
    if (!closedTradesRequired) return null;
    return clamp(((closedTrades ?? 0) / closedTradesRequired) * 100);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Latest-read block and chart inputs
// ---------------------------------------------------------------------------

function naIfNull(value) {
  return value === null || value === undefined ? NA : value;
}

// "between": ["p25", "p50"], "interpolated_percentile": 34.44 (percentile
// points, 0-100 scale, not a fraction) — measured against the live artifact
// and verdict_cones.py::build_read_payload, which passes it straight through.
function formatPercentilePosition(pp) {
  if (!pp) return null;
  const between = Array.isArray(pp.between) ? pp.between.join("–") : String(pp.between ?? "");
  const pct = typeof pp.interpolated_percentile === "number" ? pp.interpolated_percentile.toFixed(1) : "—";
  return `between ${between} (~${pct}th percentile)`;
}

// The latest read (producer sorts reads by as_of ascending), normalized:
// nulls mapped to "n/a", percentile position formatted. Null when no reads.
export function latestRead(cone) {
  const all = reads(cone);
  if (all.length === 0) return null;
  const r = all[all.length - 1];
  return {
    overallStatus: r.overall_status,
    coneLegVerdict: r.cone_leg_verdict,
    costLegVerdict: r.cost_leg_verdict,
    costLegTrust: naIfNull(r.cost_leg_trust),
    breachStatus: naIfNull(r.breach_status),
    coneUnderpowered: r.cone_underpowered === true,
    percentilePositionLabel: formatPercentilePosition(r.percentile_position),
    asOf: r.as_of ?? null,
    horizon: r.horizon ?? null,
  };
}

// as_of of every read whose cone_match is false — not just the latest one.
export function mismatchedReads(cone) {
  return reads(cone)
    .filter((r) => r.cone_match === false)
    .map((r) => r.as_of);
}

export function isUntrimmed(cone) {
  return cone?.trim?.untrimmed === true;
}

// nRows = index of the LAST REALIZED ROW (0-based, e.g. equity_series.length - 1).
// Window end = smallest grid horizon >= nRows; if nRows exceeds every horizon,
// window end = the largest horizon (360) — the grid never draws past its own
// ceiling even if the stream has been running longer than that.
export function gridPointsInWindow(cone, nRows) {
  const horizons = Array.isArray(cone?.horizons) ? cone.horizons : [];
  if (horizons.length === 0) return [];
  const windowEnd = horizons.find((h) => h >= nRows) ?? horizons[horizons.length - 1];
  return horizons
    .filter((h) => h <= windowEnd)
    .map((h) => ({ horizon: h, percentiles: cone?.percentiles?.[String(h)] ?? null }));
}

// Chart-ready read markers: [{ horizon, y, label }], never the raw read
// objects. windowEnd caps which reads are plotted.
export function chartReads(cone, windowEnd) {
  return reads(cone)
    .filter((r) => typeof r.horizon === "number" && r.horizon <= windowEnd)
    .map((r) => ({ horizon: r.horizon, y: r.realized_cum_net_return, label: r.overall_status }));
}

// Fraction-basis realized curve (matches cone percentiles' units: simple
// compounded cumulative return from the anchor row), row-indexed directly
// from equity_series — NOT derived from data.js's liveSeries, which filters
// out invalid points and would silently shift row indices out of alignment
// with cone horizons if any point were ever dropped.
export function realizedSeries(stream) {
  const points = Array.isArray(stream?.equity_series) ? stream.equity_series : [];
  const baseline = points[0]?.equity;
  if (typeof baseline !== "number" || baseline === 0) return [];
  const series = [];
  points.forEach((p, row) => {
    if (typeof p?.equity !== "number") return;
    series.push({ row, date: p.date, cumReturn: p.equity / baseline - 1 });
  });
  return series;
}
