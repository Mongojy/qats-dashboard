// Single place that knows verdict_cones.json's shape. Mirrors data.js's rule
// for dashboard_summary.json: views consume the derived helpers below and
// never touch a cone's raw fields (reads[], trim, percentile_position, ...)
// directly.
//
// Lazy-fetched (only once a stream view actually needs it) and cached for
// the page's lifetime — /api/verdicts is only hit once no matter how many
// stream views are visited.

const NA = "n/a";

let conesPromise = null;

function loadCones() {
  if (!conesPromise) {
    conesPromise = fetch("/api/verdicts")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .catch((err) => {
        // Don't pin a transient failure for the rest of the page's life —
        // the next stream navigation gets a fresh attempt.
        conesPromise = null;
        throw err;
      });
  }
  return conesPromise;
}

// Returns the raw per-stream cone entry (an opaque handle — pass it to the
// other helpers below, never read its fields directly) or null when the
// artifact has no cone for this stream (by design for btc_hold_baseline;
// possible for any stream if the producer hasn't built one yet).
export async function coneForStream(streamId) {
  const payload = await loadCones();
  const streams = Array.isArray(payload?.streams) ? payload.streams : [];
  return streams.find((s) => s.strategy_id === streamId) ?? null;
}

export async function coneArtifactGeneratedAt() {
  const payload = await loadCones();
  return payload?.generated_at ?? null;
}

function naIfNull(value) {
  return value === null || value === undefined ? NA : value;
}

// "between": ["p25", "p50"], "interpolated_percentile": 34.44 (percentile
// points, 0-100 scale, not a fraction) — measured against the live artifact
// at qats-crypto/store/research/dashboard/verdict_cones.json and its
// validator (src/cryptoquant/dashboard/verdict_cones.py::build_read_payload,
// which passes read["percentile_position"] straight through).
function formatPercentilePosition(pp) {
  if (!pp) return null;
  const between = Array.isArray(pp.between) ? pp.between.join("–") : String(pp.between ?? "");
  const pct = typeof pp.interpolated_percentile === "number" ? pp.interpolated_percentile.toFixed(1) : "—";
  return `between ${between} (~${pct}th percentile)`;
}

// The latest read (producer sorts reads by as_of ascending — confirmed:
// build_stream_payload's docstring states reads arrive "already sorted by
// as_of ascending"), normalized: nulls already mapped to "n/a", percentile
// position already formatted as a display string. Returns null when the
// cone has no reads yet.
export function latestRead(cone) {
  const reads = Array.isArray(cone?.reads) ? cone.reads : [];
  if (reads.length === 0) return null;
  const r = reads[reads.length - 1];
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
  const reads = Array.isArray(cone?.reads) ? cone.reads : [];
  return reads.filter((r) => r.cone_match === false).map((r) => r.as_of);
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
// objects. windowEnd caps which reads are plotted (a read's horizon should
// never exceed it in practice, but filtered defensively).
export function chartReads(cone, windowEnd) {
  const reads = Array.isArray(cone?.reads) ? cone.reads : [];
  return reads
    .filter((r) => typeof r.horizon === "number" && r.horizon <= windowEnd)
    .map((r) => ({ horizon: r.horizon, y: r.realized_cum_net_return, label: r.overall_status }));
}

// Fraction-basis realized curve (matches cone percentiles' units: simple
// compounded cumulative return from the anchor row), row-indexed directly
// from equity_series — NOT derived from data.js's netPnlPctSeries, which
// filters out invalid points and would silently shift row indices out of
// alignment with cone horizons if any point were ever dropped.
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
