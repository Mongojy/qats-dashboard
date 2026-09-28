// Masthead: brand, as-of date, glossary trigger, templated briefing line and
// the four KPI tiles (D1–D3). Input is the precomputed stream rows plus
// bookStats/briefing output — no payload access here.

import { escapeHtml, fmtDay, fmtPct } from "../format.js";
import { ICONS } from "./ui.js";

function kpi(label, value, sub, tone = "") {
  return `
    <div class="kpi">
      <dt class="eyebrow">${escapeHtml(label)}</dt>
      <dd class="kpi__value tabular ${tone ? `tone--${tone}` : ""}">${escapeHtml(value)}</dd>
      ${sub ? `<dd class="kpi__sub">${escapeHtml(sub)}</dd>` : ""}
    </div>`;
}

// ctx: { asOfDate, stats (bookStats), briefing (string), conesState }
export function renderHeader({ asOfDate, stats, briefing, conesState }) {
  const top = stats.top;
  const topValue = top ? fmtPct(top.livePnlPct, 1) : "—";
  const topTone = top ? (top.livePnlPct >= 0 ? "up" : "down") : "";
  const topSub = top ? `${top.name} · day ${top.index ?? "—"}` : "—";

  return `
    <div class="masthead__bar">
      <p class="brand"><span class="brand__mark">QATS</span><span class="brand__sep" aria-hidden="true">·</span><span class="brand__name">Forward tests</span></p>
      <div class="masthead__tools">
        ${asOfDate ? `<p class="masthead__asof">As of ${escapeHtml(fmtDay(asOfDate))}</p>` : ""}
        <button type="button" class="ghost-btn" data-glossary-open aria-haspopup="dialog" aria-controls="glossary">
          ${ICONS.book}<span class="ghost-btn__label">Glossary</span>
        </button>
      </div>
    </div>
    <p class="briefing">${escapeHtml(briefing)}</p>
    <dl class="kpis">
      ${kpi("Live streams", String(stats.count), stats.underTest !== null ? `${stats.underTest} under test` : conesState === "loading" ? "…" : "— under test")}
      ${kpi("Top live P&L", topValue, topSub, topTone)}
      ${kpi("Attention", String(stats.attentionCount), stats.attentionReasons, stats.attentionCount > 0 ? "warn" : "")}
      ${kpi("Open positions", String(stats.openPositions), "")}
    </dl>`;
}
