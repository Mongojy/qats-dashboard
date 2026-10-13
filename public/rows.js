// Assembles the per-stream "row" the list, KPIs and briefing work from, out
// of the two adapters (data.js, cones.js) and the display metadata. Pure: no
// DOM, no fetch — shared by app.js and web-tests/.

import { getStreams, getAsOfDate, streamId, rowIndex, livePnlPct, liveSeries, exposure, raisedFlags } from "./data.js";
import { coneFor, streamStatus, nextRead, nextReadDate, nextReadProgressPct } from "./cones.js";
import { strategyMeta, isReferenceStrategy } from "./strategies.js";

// The next-read line the card and the detail show: the C6 text plus the
// date of that row when the state has one ("… · ≈27 Nov").
function withDate(stream, next, asOfDate) {
  if (!next) return null;
  const dateLabel = nextReadDate(stream, next, asOfDate);
  return { ...next, dateLabel, line: dateLabel ? `${next.text} · ${dateLabel}` : next.text };
}

// conesState: "loading" | "ready" | "failed"; conesPayload only read when ready.
// asOfDate: the summary's as_of_date (year rule of the read dates).
export function buildRow(stream, conesState, conesPayload, asOfDate = null) {
  const id = streamId(stream);
  // undefined while cones are not loaded; null = no cone (reference stream).
  const cone = conesState === "ready" ? coneFor(conesPayload, id) : undefined;
  const next = cone === undefined ? null : withDate(stream, nextRead(stream, cone), asOfDate);
  const exp = exposure(stream);
  const meta = strategyMeta(id);
  return {
    id,
    name: meta.name,
    universe: meta.universe,
    pinned: isReferenceStrategy(id),
    livePnlPct: livePnlPct(stream),
    index: rowIndex(stream),
    openCount: exp.count,
    grossPct: exp.grossPct,
    series: liveSeries(stream),
    flags: raisedFlags(stream),
    status: streamStatus(conesState, cone ?? null),
    next,
    barPct: cone === undefined ? null : nextReadProgressPct(stream, cone, next),
  };
}

export function buildRows(summary, conesState, conesPayload) {
  const asOfDate = getAsOfDate(summary);
  return getStreams(summary).map((s) => buildRow(s, conesState, conesPayload, asOfDate));
}
