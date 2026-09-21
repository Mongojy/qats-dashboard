import { getStreams, forwardPnlPct, netPnlPctSeries } from "../data.js";
import { escapeHtml, fmtPct, fmtNum, fmtVote, fmtOrDash, splitOpenTs } from "../format.js";
import { netPnlChartSvg, coneChartSvg } from "../chart.js";
import {
  coneForStream,
  coneArtifactGeneratedAt,
  latestRead,
  mismatchedReads,
  isUntrimmed,
  gridPointsInWindow,
  chartReads,
  realizedSeries,
} from "../cones.js";

function renderPositionsTable(positions) {
  if (!Array.isArray(positions) || positions.length === 0) {
    return `<p class="empty-state">No open positions.</p>`;
  }

  const rows = positions
    .map((p) => {
      const opened = splitOpenTs(p.open_ts);
      return `
      <tr>
        <td>${escapeHtml(fmtOrDash(p.base_asset))}</td>
        <td>${escapeHtml(fmtOrDash(p.side))}</td>
        <td>${fmtVote(p.vote)}</td>
        <td>
          <div>${escapeHtml(opened.date)}</div>
          ${opened.time ? `<div class="cell-sub">${escapeHtml(opened.time)}</div>` : ""}
        </td>
        <td>${fmtOrDash(p.days_held)}</td>
        <td>${fmtNum(p.open_price, 4)}</td>
        <td>${fmtPct(p.size_pct)}</td>
        <td>${fmtPct(p.unreal_pnl_pct)}</td>
      </tr>
    `;
    })
    .join("");

  return `
    <table class="positions-table">
      <thead>
        <tr>
          <th>Asset</th><th>Side</th><th>Vote</th><th>Opened</th>
          <th>Days held</th><th>Open price</th><th>Size %</th><th>Unreal PnL %</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function renderVerdictProgress(vp) {
  if (!vp) return `<p class="empty-state">No verdict progress data.</p>`;
  return `
    <ul class="verdict-progress">
      <li>Daily closes: ${fmtOrDash(vp.daily_closes)} / ${fmtOrDash(vp.daily_closes_required)}</li>
      <li>Closed trades: ${fmtOrDash(vp.closed_trades)} / ${fmtOrDash(vp.closed_trades_required)}</li>
      <li>Verdict ready: ${vp.verdict_ready ? "yes" : "no"}</li>
    </ul>
  `;
}

// Fixed captions the operator wants attached to every cone reading — see
// M1/scope §4. Copy is exact, not paraphrased.
const D1_CAPTION = "Cone ON_TRACK is weak evidence against a dead edge, not evidence of a live one (D1).";
const COST_LEG_CAPTION =
  "Cost leg: Implementation drift vs shadow replay (slippage 0 on both sides), not market execution cost.";
const UNTRIMMED_CAPTION = "Untrimmed cone — narrower than its twins' methodology would give.";

function renderGeneratedAt(generatedAt) {
  return `<p class="cone-section__generated-at">Cone artifact generated ${escapeHtml(fmtOrDash(generatedAt))}</p>`;
}

function renderMismatchWarning(asOfList) {
  const joined = asOfList.map((d) => escapeHtml(fmtOrDash(d))).join(", ");
  return `
    <p class="cone-caption cone-caption--warning">
      Cone mismatch: read(s) ${joined} were scored against a different cone than the one in
      this artifact (cone_sha256 differs). Treat those verdicts as unverified against the
      current cone.
    </p>
  `;
}

function renderLatestReadBlock(read) {
  return `
    <ul class="cone-read">
      <li>Overall: ${escapeHtml(fmtOrDash(read.overallStatus))}</li>
      <li>Cone leg: ${escapeHtml(fmtOrDash(read.coneLegVerdict))}</li>
      <li>Cost leg: ${escapeHtml(fmtOrDash(read.costLegVerdict))} (trust: ${escapeHtml(String(read.costLegTrust))})</li>
      <li>Breach status: ${escapeHtml(String(read.breachStatus))}</li>
      <li>Cone underpowered: ${read.coneUnderpowered ? "yes" : "no"}</li>
      <li>Percentile position: ${read.percentilePositionLabel ? escapeHtml(read.percentilePositionLabel) : "—"}</li>
      <li>Read as of ${escapeHtml(fmtOrDash(read.asOf))}, horizon ${escapeHtml(fmtOrDash(read.horizon))}</li>
    </ul>
  `;
}

// Cone found for this stream: chart + verdict text + fixed captions.
function renderConeSectionReady(stream, cone, generatedAt) {
  const realized = realizedSeries(stream);
  const lastRow = realized.length ? realized[realized.length - 1].row : 0;
  const gridPoints = gridPointsInWindow(cone, lastRow);
  const windowEnd = gridPoints.length ? gridPoints[gridPoints.length - 1].horizon : lastRow;
  const reads = chartReads(cone, windowEnd);
  const read = latestRead(cone);
  const mismatched = mismatchedReads(cone);

  return `
    <h3>Verdict cone</h3>
    ${coneChartSvg({ realized, gridPoints, reads })}
    ${read ? renderLatestReadBlock(read) : `<p class="empty-state">No verdict read written yet.</p>`}
    ${mismatched.length > 0 ? renderMismatchWarning(mismatched) : ""}
    ${isUntrimmed(cone) ? `<p class="cone-caption cone-caption--warning">${UNTRIMMED_CAPTION}</p>` : ""}
    <p class="cone-caption">${D1_CAPTION}</p>
    <p class="cone-caption">${COST_LEG_CAPTION}</p>
    ${renderGeneratedAt(generatedAt)}
  `;
}

// No cone for this stream (by design for btc_hold_baseline; possible for
// any stream) — driven off coneForStream's return value, not a hardcoded
// stream-id check.
function renderConeSectionNoCone(generatedAt) {
  return `
    <p class="empty-state">Reference stream — no cone.</p>
    ${renderGeneratedAt(generatedAt)}
  `;
}

// Called from app.js right after a stream view's HTML is set. The cone
// fetch is lazy and async, so this fills in the `#cone-section` placeholder
// independently of the rest of the (already-rendered) view — a fetch
// failure here never affects anything else on the page.
export async function mountConeSection(summary, streamId) {
  const el = document.getElementById("cone-section");
  if (!el) return;

  const stream = getStreams(summary).find((s) => s.strategy_id === streamId);
  if (!stream) return;

  try {
    const [cone, generatedAt] = await Promise.all([coneForStream(streamId), coneArtifactGeneratedAt()]);
    // The user may have navigated away while this was in flight.
    if (!document.body.contains(el)) return;
    el.innerHTML = cone === null ? renderConeSectionNoCone(generatedAt) : renderConeSectionReady(stream, cone, generatedAt);
  } catch {
    if (document.body.contains(el)) el.innerHTML = `<p class="empty-state">Cone data unavailable</p>`;
  }
}

export function renderStream(summary, streamId) {
  const stream = getStreams(summary).find((s) => s.strategy_id === streamId);
  if (!stream) {
    // streamId comes straight from the URL hash — escaping here is the XSS fix.
    return `<p class="empty-state">Unknown stream: ${escapeHtml(streamId)}</p>`;
  }

  return `
    <section class="stream-view">
      <header class="stream-view__header">
        <h2>${escapeHtml(stream.strategy_id)}</h2>
        <span>anchor ${escapeHtml(fmtOrDash(stream.anchor_date))}</span>
      </header>

      ${netPnlChartSvg(netPnlPctSeries(stream))}

      <div class="metric"><span class="metric__label">Net PnL</span><span class="metric__value">${fmtPct(forwardPnlPct(stream))}</span></div>

      <h3>Verdict progress</h3>
      ${renderVerdictProgress(stream.verdict_progress)}

      <h3>Open positions</h3>
      ${renderPositionsTable(stream.open_positions)}

      <section class="cone-section" id="cone-section">
        <p class="empty-state">Loading verdict cone…</p>
      </section>
    </section>
  `;
}
