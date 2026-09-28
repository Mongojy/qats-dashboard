// Right pane: one stream in full (D5–D7). Reads the stream only through
// data.js helpers and the cone only through cones.js helpers.

import {
  streamId,
  anchorDate,
  rowIndex,
  bookValueUsd,
  livePnlPct,
  liveSeries,
  exposure,
  isLongOnly,
  openPositions,
  verdictProgress,
  BASELINE_EQUITY,
} from "../data.js";
import {
  artifactGeneratedAt,
  latestRead,
  mismatchedReads,
  isUntrimmed,
  gridPointsInWindow,
  chartReads,
  realizedSeries,
  statusLabel,
} from "../cones.js";
import { strategyMeta } from "../strategies.js";
import { escapeHtml, fmtDay, fmtLevelPct, fmtOrDash, fmtPct, fmtStamp, fmtUsd } from "../format.js";
import { livePathSvg, coneChartSvg } from "../chart.js";
import { ICONS, flagBadges, hint, statusChip } from "./ui.js";
import { glossaryBody } from "./glossary.js";
import { renderPositions } from "./positions.js";

// Fixed captions attached to every cone reading — see M1/scope §4. Copy is
// exact, not paraphrased.
const D1_CAPTION = "Cone ON_TRACK is weak evidence against a dead edge, not evidence of a live one (D1).";
const COST_LEG_CAPTION =
  "Cost leg: Implementation drift vs shadow replay (slippage 0 on both sides), not market execution cost.";
const UNTRIMMED_CAPTION = "Untrimmed cone — narrower than its twins' methodology would give.";

const DAILY_CLOSES_HINT = "Producer count; includes the anchor row, so it is one more than Day.";
const STYLE_HINT =
  "The kind of signal the stream trades: Momentum, Liquidity, or Reference for the passive floor. The line below is the status from the latest scheduled read.";

function stat(label, hintText, value, sub) {
  return `
    <div class="stat">
      ${hint(escapeHtml(label), hintText, { className: "eyebrow" })}
      <p class="stat__value tabular">${escapeHtml(value)}</p>
      <p class="stat__sub">${escapeHtml(sub)}</p>
    </div>`;
}

function estimateTag(next) {
  return next && (next.kind === "scheduled" || next.kind === "due") ? ` <span class="est">estimate</span>` : "";
}

function progressCard(label, done, need, hintText) {
  const pct = need > 0 && done !== null ? Math.min(100, (done / need) * 100) : done !== null ? 100 : 0;
  const title = hintText ? hint(escapeHtml(label), hintText, { className: "eyebrow" }) : `<p class="eyebrow">${escapeHtml(label)}</p>`;
  return `
    <div class="progress-card">
      <div class="progress-card__head">
        ${title}
        <p class="progress-card__count tabular">${escapeHtml(fmtOrDash(done))} / ${escapeHtml(fmtOrDash(need))}</p>
      </div>
      <div class="bar"><div class="bar__fill" style="width:${pct.toFixed(1)}%"></div></div>
    </div>`;
}

function verdictProgressSection(stream, status, next) {
  if (status.kind === "reference") return "";
  let sub;
  if (status.kind === "pending") sub = "…";
  else if (status.kind === "unknown") sub = "Next read: verdict data unavailable";
  else sub = next ? escapeHtml(next.text) + estimateTag(next) : "—";
  const vp = verdictProgress(stream);
  return `
    <section class="section">
      <div class="section__head">
        <h2 class="section__title">Verdict progress</h2>
        <p class="section__sub">${sub}</p>
      </div>
      <div class="progress-grid">
        ${progressCard("Daily closes", vp.dailyCloses, vp.dailyClosesRequired, DAILY_CLOSES_HINT)}
        ${progressCard("Closed trades", vp.closedTrades, vp.closedTradesRequired)}
      </div>
    </section>`;
}

function readRow(k, v, hintText) {
  const label = hintText ? hint(escapeHtml(k), hintText, { className: "hint--inline", withIcon: false }) : escapeHtml(k);
  return `<div class="read__row"><dt>${label}</dt><dd>${escapeHtml(v)}</dd></div>`;
}

function latestReadBlock(read) {
  if (!read) return `<p class="empty-state">No verdict read written yet.</p>`;
  return `
    <dl class="read">
      ${readRow("Overall", `${statusLabel(read.overallStatus)} (${fmtOrDash(read.overallStatus)})`)}
      ${readRow("Cone leg", fmtOrDash(read.coneLegVerdict))}
      ${readRow("Cost leg", `${fmtOrDash(read.costLegVerdict)} (trust: ${read.costLegTrust})`, glossaryBody("Cost leg"))}
      ${readRow("Breach status", String(read.breachStatus))}
      ${readRow("Underpowered", read.coneUnderpowered ? "yes" : "no", glossaryBody("Underpowered"))}
      ${readRow("Percentile position", read.percentilePositionLabel ?? "—")}
      ${readRow("Read", `as of ${fmtDay(read.asOf)} · row ${fmtOrDash(read.horizon)}`)}
    </dl>`;
}

function mismatchWarning(asOfList) {
  const joined = asOfList.map((d) => escapeHtml(fmtOrDash(d))).join(", ");
  return `
    <p class="caption caption--warning">
      Cone mismatch: read(s) ${joined} were scored against a different cone than the one in
      this artifact (cone_sha256 differs). Treat those verdicts as unverified against the
      current cone.
    </p>`;
}

function generatedLine(payload) {
  const at = artifactGeneratedAt(payload);
  return `<p class="generated mono">Cone generated ${escapeHtml(at ? fmtStamp(at) : "—")} UTC</p>`;
}

function coneBody(stream, cone, payload, coneWidth) {
  const realized = realizedSeries(stream);
  const lastRow = realized.length ? realized[realized.length - 1].row : 0;
  const gridPoints = gridPointsInWindow(cone, lastRow);
  const windowEnd = gridPoints.length ? gridPoints[gridPoints.length - 1].horizon : lastRow;
  const mismatched = mismatchedReads(cone);
  return `
    ${coneChartSvg({ realized, gridPoints, reads: chartReads(cone, windowEnd) }, { width: coneWidth, height: 240 })}
    ${latestReadBlock(latestRead(cone))}
    ${mismatched.length > 0 ? mismatchWarning(mismatched) : ""}
    ${isUntrimmed(cone) ? `<p class="caption caption--warning">${UNTRIMMED_CAPTION}</p>` : ""}
    <p class="caption">${D1_CAPTION}</p>
    <p class="caption">${COST_LEG_CAPTION}</p>
    ${generatedLine(payload)}`;
}

function coneSection(ctx) {
  const { stream, status, cone, conesPayload, coneWidth } = ctx;
  let body;
  if (status.kind === "pending") body = `<p class="empty-state">Loading verdict cone…</p>`;
  else if (status.kind === "unknown") body = `<p class="empty-state">Cone data unavailable</p>`;
  else if (cone === null) body = `<p class="empty-state">Reference stream — no cone.</p>${generatedLine(conesPayload)}`;
  else body = coneBody(stream, cone, conesPayload, coneWidth);

  return `
    <section class="section" id="cone-section">
      <div class="section__head">
        <h2 class="section__title">Expected range</h2>
        <p class="section__sub">Research name: verdict cone · status ${escapeHtml(status.label)}</p>
      </div>
      <div class="panel">${body}</div>
    </section>`;
}

// ctx: { stream, status, flags, next, cone (handle | null | undefined),
//        conesPayload, coneWidth, positionsMode }
export function renderDetail(ctx) {
  const { stream, status, flags, next, positionsMode } = ctx;
  const id = streamId(stream);
  const meta = strategyMeta(id);
  const pnl = livePnlPct(stream);
  const anchor = anchorDate(stream);
  const index = rowIndex(stream);
  const exp = exposure(stream);

  return `
    <article class="detail">
      <a class="back-link" href="#/">${ICONS.arrowLeft}All streams</a>

      <header class="detail__header">
        <div class="detail__title-row">
          <h1 class="detail__title">${escapeHtml(meta.name)}</h1>
          ${statusChip(status)}
          ${flagBadges(flags)}
        </div>
        ${meta.thesis ? `<p class="detail__thesis">${escapeHtml(meta.thesis)}</p>` : ""}
        <p class="detail__meta mono">${escapeHtml(id)} · live since ${escapeHtml(fmtDay(anchor))} · day ${index ?? "—"}</p>
      </header>

      <div class="detail__pnl">
        <p class="eyebrow">Live P&amp;L</p>
        <p class="detail__pnl-value tabular ${pnl === null ? "" : pnl >= 0 ? "tone--up" : "tone--down"}">${escapeHtml(fmtPct(pnl))}</p>
        <p class="detail__pnl-note">From the anchor close on ${escapeHtml(fmtDay(anchor))}, open positions marked to market.</p>
      </div>

      <div class="stats">
        ${stat("Book value", glossaryBody("Book value"), fmtUsd(bookValueUsd(stream)), `from ${fmtUsd(BASELINE_EQUITY, 0)} nominal`)}
        ${stat("Deployed", glossaryBody("Deployed"), fmtLevelPct(exp.grossPct, 1), `${exp.count} open`)}
        ${stat("Net exposure", glossaryBody("Net exposure"), fmtPct(exp.netPct, 1), isLongOnly(stream) ? "long-only" : "long/short")}
        ${stat("Style", STYLE_HINT, meta.style, status.label)}
      </div>

      <section class="section">
        <div class="section__head">
          <h2 class="section__title">The live path</h2>
          <p class="section__sub">Return from the anchor close, marked to market — not the backtest.</p>
        </div>
        <div class="panel">${livePathSvg(liveSeries(stream))}</div>
      </section>

      ${verdictProgressSection(stream, status, next)}
      ${renderPositions(openPositions(stream), positionsMode)}
      ${coneSection(ctx)}
    </article>`;
}

// Unknown id straight from the URL hash — escaping here is the XSS fix.
export function renderUnknownStream(id) {
  return `
    <article class="detail">
      <a class="back-link" href="#/">${ICONS.arrowLeft}All streams</a>
      <p class="empty-state">Unknown stream: ${escapeHtml(id)}</p>
    </article>`;
}
