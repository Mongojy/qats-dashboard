// Left pane: filter chips + one card per stream (D4). Cards use the
// stretched-link pattern: the whole card is clickable through the title
// link, while flag badges stay separately focusable for their tooltip.

import { escapeHtml, fmtPct } from "../format.js";
import { sparklineSvg } from "../chart.js";
import { flagBadges, statusChip } from "./ui.js";

const FILTERS = [
  ["all", "All"],
  ["attention", "Attention"],
  ["on_track", "On track"],
  ["reference", "Reference"],
];

function filterChips(current) {
  return `
    <div class="chips" role="toolbar" aria-label="Filter streams">
      ${FILTERS.map(
        ([id, label]) =>
          `<button type="button" class="chip${id === current ? " is-active" : ""}" data-filter="${id}" aria-pressed="${id === current}">${label}</button>`,
      ).join("")}
    </div>`;
}

// row: see data.js header, plus { grossPct, series, barPct }
function card(row, active, animate) {
  const pnl = row.livePnlPct;
  const tone = pnl === null ? "" : pnl >= 0 ? "up" : "down";
  const isReference = row.status.kind === "reference";
  const nextText = row.next ? row.next.text : row.status.kind === "pending" ? "…" : null;

  return `
    <article class="card${active ? " is-active" : ""}${animate ? " desk-enter" : ""}">
      <div class="card__head">
        <div class="card__title">
          <a class="card__link" href="#/stream/${escapeHtml(encodeURIComponent(row.id))}"${active ? ' aria-current="true"' : ""}>${escapeHtml(row.name)}</a>
          <p class="card__id mono">${escapeHtml(row.id)}</p>
        </div>
        ${statusChip(row.status)}
      </div>
      ${row.flags.length ? `<div class="card__flags">${flagBadges(row.flags)}</div>` : ""}
      <div class="card__pnl">
        <div>
          <p class="eyebrow">Live P&amp;L</p>
          <p class="card__value tabular ${tone ? `tone--${tone}` : ""}">${escapeHtml(fmtPct(pnl))}</p>
        </div>
        <div class="card__spark">${sparklineSvg(row.series)}</div>
      </div>
      <div class="card__meta">
        <span>${row.openCount} open · ${escapeHtml(row.grossPct.toFixed(0))}% deployed</span>
        <span class="tabular">Day ${row.index ?? "—"}</span>
      </div>
      ${
        isReference
          ? ""
          : `<div class="card__progress">
              ${row.barPct === null ? "" : `<div class="bar"><div class="bar__fill" style="width:${row.barPct.toFixed(1)}%"></div></div>`}
              ${nextText ? `<p class="card__next">${escapeHtml(nextText)}</p>` : ""}
            </div>`
      }
    </article>`;
}

// rows: already filtered + sorted by the caller.
export function renderList({ rows, filter, selectedId, animate }) {
  const body = rows.length
    ? rows.map((r) => card(r, r.id === selectedId, animate)).join("")
    : `<p class="empty-state">Nothing in this filter.</p>`;
  return `${filterChips(filter)}<div class="cards">${body}</div>`;
}
