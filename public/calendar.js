// Calendar arithmetic for the charts and read dates: UTC days, week bands,
// row -> date extrapolation. Pure — no payload knowledge, no DOM; callers
// pass plain ISO date strings ("YYYY-MM-DD") and x positions.

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

// Monday 1970-01-05 00:00 UTC. Band tone alternates by the parity of whole
// weeks since this Monday — not by ISO week number, which repeats its parity
// across a W53 -> W01 year boundary (e.g. 2026 -> 2027).
const EPOCH_MONDAY = Date.UTC(1970, 0, 5);

// "YYYY-MM-DD..." -> ms at 00:00 UTC, or null.
export function parseDay(iso) {
  if (typeof iso !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return null;
  const ms = Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(ms) ? null : ms;
}

export function isoDay(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(iso, n) {
  const ms = parseDay(iso);
  return ms === null ? null : isoDay(ms + n * DAY_MS);
}

// Whole weeks since EPOCH_MONDAY (negative before it).
export function weekIndex(ms) {
  return Math.floor((ms - EPOCH_MONDAY) / WEEK_MS);
}

// Monday 00:00 UTC of the week containing ms.
export function weekStart(ms) {
  return EPOCH_MONDAY + weekIndex(ms) * WEEK_MS;
}

// true = the brighter band tone; false = the chart's own background.
export function isAltWeek(ms) {
  return Math.abs(weekIndex(ms)) % 2 === 1;
}

// Date of row r. rowDates[r] is that row's own date (null when missing).
// Beyond the last row, or on a row without a date, the date is the nearest
// earlier dated row's date + the row difference in days, flagged estimated.
export function dateAtRow(rowDates, r) {
  const dates = Array.isArray(rowDates) ? rowDates : [];
  if (!Number.isInteger(r) || r < 0) return null;
  if (r < dates.length && parseDay(dates[r]) !== null) return { iso: dates[r].slice(0, 10), estimated: false };
  for (let j = Math.min(r, dates.length - 1); j >= 0; j--) {
    if (parseDay(dates[j]) !== null) return { iso: addDays(dates[j], r - j), estimated: true };
  }
  return null;
}

// Piecewise-linear date -> x over points sorted by date ([{ t, x }]).
function interpolator(pts) {
  return (t) => {
    let lo = 0;
    let hi = pts.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (pts[mid].t <= t) lo = mid;
      else hi = mid;
    }
    const a = pts[lo];
    const b = pts[hi];
    return a.x + ((t - a.t) / (b.t - a.t)) * (b.x - a.x);
  };
}

// Week bands over a date-mapped x axis. points: [{ date, x }] — the chart's
// own date -> x mapping, sampled (rows or series points). Weeks start Monday
// 00:00 UTC; the first and last weeks are cut at the data's date span and
// every span is clipped to [x0, x1]. Returns every week in view:
//   [{ x1, x2, start, week, alt }]   (start = that week's Monday, ISO)
export function weekBandSpans(points, { x0, x1 }) {
  const pts = (Array.isArray(points) ? points : [])
    .map((p) => ({ t: parseDay(p?.date), x: p?.x }))
    .filter((p) => p.t !== null && Number.isFinite(p.x))
    .sort((a, b) => a.t - b.t)
    .filter((p, i, arr) => i === 0 || p.t > arr[i - 1].t);
  if (pts.length < 2) return [];

  const xAt = interpolator(pts);
  const tFirst = pts[0].t;
  const tLast = pts[pts.length - 1].t;
  const spans = [];
  for (let w = weekStart(tFirst); w < tLast; w += WEEK_MS) {
    const left = Math.max(x0, Math.min(x1, xAt(Math.max(w, tFirst))));
    const right = Math.max(x0, Math.min(x1, xAt(Math.min(w + WEEK_MS, tLast))));
    if (right - left <= 0) continue;
    spans.push({ x1: left, x2: right, start: isoDay(w), week: weekIndex(w), alt: isAltWeek(w) });
  }
  return spans;
}
