// Assembles the per-stream "row" the list, KPIs and briefing work from, out
// of the two adapters (data.js, cones.js) and the display metadata. Pure: no
// DOM, no fetch — shared by app.js and web-tests/.

import { getStreams, streamId, rowIndex, livePnlPct, liveSeries, exposure, raisedFlags } from "./data.js";
import { coneFor, streamStatus, nextRead, nextReadProgressPct } from "./cones.js";
import { strategyMeta } from "./strategies.js";

// conesState: "loading" | "ready" | "failed"; conesPayload only read when ready.
export function buildRow(stream, conesState, conesPayload) {
  const id = streamId(stream);
  // undefined while cones are not loaded; null = no cone (reference stream).
  const cone = conesState === "ready" ? coneFor(conesPayload, id) : undefined;
  const next = cone === undefined ? null : nextRead(stream, cone);
  const exp = exposure(stream);
  return {
    id,
    name: strategyMeta(id).name,
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
  return getStreams(summary).map((s) => buildRow(s, conesState, conesPayload));
}
