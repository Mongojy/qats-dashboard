// Shared formatting helpers. Every function tolerates null/undefined and
// renders "—" instead of throwing or printing "NaN"/"null".

// HTML-escape for any value interpolated into innerHTML. Mandatory for
// every payload-derived string (ids, assets, tokens, dates) and for
// untrusted input (URL hash, error messages).
export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function isMissing(value) {
  return value === null || value === undefined || Number.isNaN(value);
}

// For signed deltas (PnL, net exposure) where +/- carries meaning.
export function fmtPct(value, decimals = 2) {
  if (isMissing(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(decimals)}%`;
}

// For magnitudes/levels (gross exposure, position size) where a "+" prefix
// would misleadingly imply a change relative to zero.
export function fmtLevelPct(value, decimals = 2) {
  if (isMissing(value)) return "—";
  return `${value.toFixed(decimals)}%`;
}

export function fmtNum(value, decimals = 2) {
  if (isMissing(value)) return "—";
  return value.toFixed(decimals);
}

// "$17,541.50" — dollars with thousands separators (two decimals by default).
export function fmtUsd(value, decimals = 2) {
  if (isMissing(value)) return "—";
  const sign = value < 0 ? "-" : "";
  const [whole, frac] = Math.abs(value).toFixed(decimals).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sign}$${grouped}${frac ? `.${frac}` : ""}`;
}

// Open price with precision that scales with magnitude (BTC vs DOGE).
export function fmtPrice(value) {
  if (isMissing(value)) return "—";
  const abs = Math.abs(value);
  if (abs >= 100) return value.toFixed(2);
  if (abs >= 10) return value.toFixed(3);
  return value.toFixed(4);
}

export function fmtVote(value) {
  return value === null || value === undefined ? "—" : String(value);
}

export function fmtOrDash(value) {
  return value === null || value === undefined || value === "" ? "—" : String(value);
}

// Every en-GB day label on the page goes through this one formatter, so the
// engine-dependent month abbreviation ("Sept" vs "Sep") always matches.
function utcDay(isoDate) {
  if (typeof isoDate !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(isoDate)) return null;
  const d = new Date(`${isoDate.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function fmtUtcDay(d, withYear) {
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", ...(withYear ? { year: "numeric" } : {}), timeZone: "UTC" });
}

// "2026-09-26" -> "26 Sept 2026" (en-GB, UTC). The month abbreviation is
// engine-dependent ("Sept" vs "Sep"); nothing may depend on the exact string.
export function fmtDay(isoDate) {
  if (typeof isoDate !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(isoDate)) return fmtOrDash(isoDate);
  const d = utcDay(isoDate);
  return d ? fmtUtcDay(d, true) : isoDate;
}

// "2026-11-27" -> "27 Nov"; the year is added only when it differs from
// refDate's year (refDate: an ISO date, e.g. the summary's as_of_date).
export function fmtShortDay(isoDate, refDate) {
  const d = utcDay(isoDate);
  if (!d) return fmtOrDash(isoDate);
  const ref = utcDay(refDate);
  return fmtUtcDay(d, ref !== null && ref.getUTCFullYear() !== d.getUTCFullYear());
}

// ISO timestamp -> "27 Sept 2026, 06:54" (en-GB, UTC; caller appends "UTC").
export function fmtStamp(iso) {
  if (typeof iso !== "string") return fmtOrDash(iso);
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

// Splits an open_ts ("YYYY-MM-DDTHH:MM:SS+00:00") into date/time for a
// two-row table cell. String-split on purpose (no Date parsing) so this
// can't be shifted by the runtime's local timezone. The source is always
// UTC (+00:00) and that's what's displayed.
export function splitOpenTs(value) {
  if (typeof value !== "string" || !value.includes("T")) {
    return { date: fmtOrDash(value), time: null };
  }
  const [date, rest] = value.split("T");
  return { date, time: rest.slice(0, 5) };
}
