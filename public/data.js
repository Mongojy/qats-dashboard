// Single place that knows dashboard_summary.json's shape. Every view module
// consumes the derived helpers below instead of reading summary.streams[]
// fields directly, so a future sanitized-public data source only needs a
// replacement for this one file.
//
// Pure module: no DOM, no fetch — importable from node (web-tests/).
//
// The aggregate helpers at the bottom (bookStats, briefing, matchesFilter,
// sortByLivePnl) take "stream rows" assembled by the caller from this module
// and cones.js:
//   { id, name, livePnlPct, index, openCount, flags: [{key,label}],
//     status: { kind, token, label, tone }, next: nextRead(...) | null }

// Nominal paper allocation; schema_v2 has no baseline field.
export const BASELINE_EQUITY = 10_000;

export function getStreams(summary) {
  return Array.isArray(summary?.streams) ? summary.streams : [];
}

export function findStream(summary, id) {
  return getStreams(summary).find((s) => s.strategy_id === id) ?? null;
}

export function getAsOfDate(summary) {
  return summary?.as_of_date ?? null;
}

export function streamId(stream) {
  return stream?.strategy_id ?? null;
}

export function anchorDate(stream) {
  return stream?.anchor_date ?? null;
}

function equitySeries(stream) {
  return Array.isArray(stream?.equity_series) ? stream.equity_series : [];
}

// equity_series[0] is the anchor row; horizon h = row index h. The current
// row index is also "Day N" in the UI and the protocol's close count
// (closes strictly after the anchor). Producer daily_closes is one more.
export function rowIndex(stream) {
  const n = equitySeries(stream).length;
  return n > 0 ? n - 1 : null;
}

// Mark-to-market value of the paper book, started at BASELINE_EQUITY.
// Includes the anchor-day move, so it is NOT on the same basis as livePnlPct.
export function bookValueUsd(stream) {
  return typeof stream?.equity === "number" ? stream.equity : null;
}

// net_pnl_pct = equity / equity_series[0].equity − 1, in percent — measured
// from the anchor close (producer: ledger/artifacts.py build_dashboard_summary).
export function livePnlPct(stream) {
  const value = stream?.net_pnl_pct;
  return typeof value === "number" ? value : null;
}

// Live P&L % per row for the live-path chart and sparkline. Rebased to the
// anchor row (same basis as livePnlPct), so the last point equals it.
export function liveSeries(stream) {
  const valid = equitySeries(stream).filter((p) => typeof p?.equity === "number" && typeof p?.date === "string");
  const baseline = valid[0]?.equity;
  if (typeof baseline !== "number" || baseline === 0) return [];
  return valid.map((p) => ({ date: p.date, pct: ((p.equity - baseline) / baseline) * 100 }));
}

function rawPositions(stream) {
  return Array.isArray(stream?.open_positions) ? stream.open_positions : [];
}

// Gross/net exposure aren't precomputed in the source JSON — derived from
// each open position's size_pct, signed by side for net.
export function exposure(stream) {
  let gross = 0;
  let net = 0;
  const positions = rawPositions(stream);
  for (const pos of positions) {
    const size = typeof pos.size_pct === "number" ? pos.size_pct : 0;
    gross += Math.abs(size);
    net += pos.side === "short" ? -size : size;
  }
  return { count: positions.length, grossPct: gross, netPct: net };
}

// Derived from the positions, never from the strategy id: any short open
// position makes the stream long/short right now.
export function isLongOnly(stream) {
  return !rawPositions(stream).some((pos) => pos.side === "short");
}

// Normalized open positions. `vote` is passed through exactly as stored
// (integer or null) — its meaning differs per stream and is never relabeled.
export function openPositions(stream) {
  return rawPositions(stream).map((p) => {
    const ts = typeof p.open_ts === "string" && p.open_ts.includes("T") ? p.open_ts.split("T") : null;
    return {
      asset: p.base_asset ?? null,
      side: p.side ?? null,
      leg: p.leg ?? null,
      vote: p.vote ?? null,
      openDate: ts ? ts[0] : (p.open_ts ?? null),
      openTime: ts ? ts[1].slice(0, 5) : null,
      daysHeld: typeof p.days_held === "number" ? p.days_held : null,
      openPrice: typeof p.open_price === "number" ? p.open_price : null,
      sizePct: typeof p.size_pct === "number" ? p.size_pct : null,
      unrealPnlPct: typeof p.unreal_pnl_pct === "number" ? p.unreal_pnl_pct : null,
    };
  });
}

// Producer fields as-is (daily_closes includes the anchor row).
export function verdictProgress(stream) {
  const vp = stream?.verdict_progress ?? {};
  const num = (v) => (typeof v === "number" ? v : null);
  return {
    dailyCloses: num(vp.daily_closes),
    dailyClosesRequired: num(vp.daily_closes_required),
    closedTrades: num(vp.closed_trades),
    closedTradesRequired: num(vp.closed_trades_required),
  };
}

// Monitoring flags — diagnostics from the daily run, NOT verdict inputs.
// Only === true raises a badge (drawdown can be null upstream: no badge).
// Known keys first in a fixed order, then any unknown key with its raw name.
const KNOWN_FLAGS = [
  ["drawdown", "Drawdown"],
  ["drift", "Drift"],
  ["edge_decay", "Edge decay"],
];

export function raisedFlags(stream) {
  const flags = stream?.flags && typeof stream.flags === "object" ? stream.flags : {};
  const known = new Set(KNOWN_FLAGS.map(([key]) => key));
  const out = KNOWN_FLAGS.filter(([key]) => flags[key] === true).map(([key, label]) => ({ key, label }));
  for (const [key, value] of Object.entries(flags)) {
    if (!known.has(key) && value === true) out.push({ key, label: key });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Aggregates over stream rows (see header comment for the row shape)
// ---------------------------------------------------------------------------

const ATTENTION_TOKENS = new Set(["WATCH", "KILL", "SUSPEND"]);

export function isAttention(row) {
  return row.flags.length > 0 || ATTENTION_TOKENS.has(row.status?.token);
}

export function matchesFilter(row, filter) {
  if (filter === "attention") return isAttention(row);
  if (filter === "on_track") return row.status?.token === "ON_TRACK";
  if (filter === "reference") return row.status?.kind === "reference";
  return true;
}

// Live P&L descending; streams without a value sink to the bottom.
export function sortByLivePnl(rows) {
  return [...rows].sort((a, b) => {
    const av = a.livePnlPct;
    const bv = b.livePnlPct;
    if (av === null && bv === null) return 0;
    if (av === null) return 1;
    if (bv === null) return -1;
    return bv - av;
  });
}

function plural(n, one, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

// Reasons behind the Attention count, e.g. "1 drift flag · 1 Watch".
function attentionReasons(rows) {
  const flagCounts = new Map();
  const statusCounts = new Map();
  for (const row of rows) {
    for (const f of row.flags) flagCounts.set(f.label, (flagCounts.get(f.label) ?? 0) + 1);
    if (ATTENTION_TOKENS.has(row.status?.token)) {
      statusCounts.set(row.status.label, (statusCounts.get(row.status.label) ?? 0) + 1);
    }
  }
  const parts = [];
  for (const [label, n] of flagCounts) parts.push(`${n} ${label.toLowerCase()} ${n === 1 ? "flag" : "flags"}`);
  for (const [label, n] of statusCounts) parts.push(`${n} ${label}`);
  return parts;
}

// statusesKnown: false while verdict_cones.json is loading or failed — the
// "under test" count and status-based attention are then not asserted.
export function bookStats(rows, statusesKnown) {
  const sorted = sortByLivePnl(rows);
  const top = sorted[0] && sorted[0].livePnlPct !== null ? sorted[0] : null;
  const attention = rows.filter(isAttention);
  const reasons = attentionReasons(attention);
  return {
    count: rows.length,
    underTest: statusesKnown ? rows.filter((r) => r.status?.kind !== "reference").length : null,
    top,
    attentionCount: attention.length,
    attentionReasons: reasons.length ? reasons.join(" · ") : "none",
    openPositions: rows.reduce((n, r) => n + r.openCount, 0),
  };
}

function soonestRead(rows) {
  const candidates = rows.filter((r) => r.next && (r.next.kind === "scheduled" || r.next.kind === "due"));
  candidates.sort((a, b) => a.next.closesLeft - b.next.closesLeft);
  return candidates[0] ?? null;
}

// One templated line from data only — no adjectives, no advice.
// readsWritten: total reads across streams; rows carry each stream's latest.
export function briefing(rows, statusesKnown, readsWritten) {
  const parts = [];
  const n = rows.length;
  if (!statusesKnown) {
    parts.push(`${plural(n, "live stream")}.`);
  } else {
    const underTest = rows.filter((r) => r.status?.kind !== "reference").length;
    parts.push(`${plural(n, "live stream")}, ${underTest} under test.`);

    const withRead = rows.filter((r) => r.status?.kind === "read");
    if (withRead.length === 0) {
      parts.push("No scheduled read written yet.");
    } else {
      const horizons = new Set(withRead.map((r) => r.status.horizon));
      const shared = horizons.size === 1;
      const items = withRead
        .map((r) => `${r.name} ${r.status.label}${shared ? "" : ` (row ${r.status.horizon})`}`)
        .join(", ");
      const suffix = shared
        ? ` (${withRead.length === 1 ? "" : withRead.length === 2 ? "both " : "all "}row ${[...horizons][0]})`
        : "";
      const latest = readsWritten > withRead.length ? "latest: " : "";
      parts.push(`${plural(readsWritten, "scheduled read")} written: ${latest}${items}${suffix}.`);
    }
  }

  const flagged = rows.filter((r) => r.flags.length > 0).length;
  parts.push(flagged === 0 ? "No monitoring flags." : `${plural(flagged, "stream")} with a monitoring flag.`);

  if (statusesKnown) {
    const next = soonestRead(rows);
    if (next) {
      parts.push(
        next.next.kind === "due"
          ? `Read due: ${next.name}, row ${next.next.row}.`
          : `Next read: ${next.name}, row ${next.next.row} in ~${plural(next.next.closesLeft, "close")}.`,
      );
    }
  }
  return parts.join(" ");
}
