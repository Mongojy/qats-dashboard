// Open positions (D7): Ranked (bars, expandable rows) and Table modes.
// Input: data.js openPositions(stream). Vote is shown exactly as stored
// (integer, or "—" for null) — never relabeled (A7).

import { escapeHtml, fmtDay, fmtLevelPct, fmtPct, fmtPrice, fmtVote, fmtOrDash } from "../format.js";
import { hint } from "./ui.js";
import { glossaryBody } from "./glossary.js";

// Unrealized P&L descending; unknown values last.
function ranked(positions) {
  return [...positions].sort((a, b) => {
    if (a.unrealPnlPct === null) return 1;
    if (b.unrealPnlPct === null) return -1;
    return b.unrealPnlPct - a.unrealPnlPct;
  });
}

function toneOf(value) {
  if (value === null) return "";
  return value >= 0 ? "tone--up" : "tone--down";
}

function meta(k, v, hintText) {
  const label = hintText ? hint(escapeHtml(k), hintText, { className: "hint--inline", withIcon: false }) : `<span class="meta__k">${escapeHtml(k)}</span>`;
  return `<div class="meta">${label}<p class="meta__v">${escapeHtml(v)}</p></div>`;
}

function rankedRow(p, maxSize, i) {
  const up = p.unrealPnlPct === null || p.unrealPnlPct >= 0;
  const width = p.sizePct === null ? 0 : Math.max(8, (Math.abs(p.sizePct) / maxSize) * 100);
  const id = `pos-meta-${i}`;
  return `
    <li class="pos">
      <button type="button" class="pos__row" data-position-toggle aria-expanded="false" aria-controls="${id}">
        <span class="pos__asset">${escapeHtml(fmtOrDash(p.asset))}</span>
        <span class="pos__side">${escapeHtml(fmtOrDash(p.side))}</span>
        <span class="pos__bar" aria-hidden="true"><span class="pos__bar-fill pos__bar-fill--${up ? "up" : "down"}" style="width:${width.toFixed(1)}%"></span></span>
        <span class="pos__pnl tabular ${toneOf(p.unrealPnlPct)}">${escapeHtml(fmtPct(p.unrealPnlPct))}</span>
      </button>
      <div class="pos__meta" id="${id}" hidden>
        ${meta("Opened", `${fmtDay(p.openDate)}${p.openTime ? ` ${p.openTime} UTC` : ""}`)}
        ${meta("Held", p.daysHeld === null ? "—" : `${p.daysHeld} ${p.daysHeld === 1 ? "day" : "days"}`)}
        ${meta("Open price", fmtPrice(p.openPrice))}
        ${meta("Size", fmtLevelPct(p.sizePct))}
        ${meta("Vote", fmtVote(p.vote), glossaryBody("Vote"))}
      </div>
    </li>`;
}

function table(rows) {
  return `
    <div class="table-wrap">
      <table class="pos-table">
        <thead>
          <tr>
            <th scope="col">Asset</th><th scope="col">Side</th><th scope="col">Vote</th><th scope="col">Opened</th>
            <th scope="col" class="num">Days</th><th scope="col" class="num">Open</th><th scope="col" class="num">Size</th><th scope="col" class="num">Unreal</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (p) => `
            <tr>
              <td class="pos-table__asset">${escapeHtml(fmtOrDash(p.asset))}</td>
              <td class="muted cap">${escapeHtml(fmtOrDash(p.side))}</td>
              <td class="muted">${escapeHtml(fmtVote(p.vote))}</td>
              <td class="muted">
                <div>${escapeHtml(fmtDay(p.openDate))}</div>
                ${p.openTime ? `<div class="cell-sub">${escapeHtml(p.openTime)} UTC</div>` : ""}
              </td>
              <td class="num muted tabular">${escapeHtml(fmtOrDash(p.daysHeld))}</td>
              <td class="num muted tabular">${escapeHtml(fmtPrice(p.openPrice))}</td>
              <td class="num muted tabular">${escapeHtml(fmtLevelPct(p.sizePct))}</td>
              <td class="num tabular ${toneOf(p.unrealPnlPct)}">${escapeHtml(fmtPct(p.unrealPnlPct))}</td>
            </tr>`,
            )
            .join("")}
        </tbody>
      </table>
    </div>`;
}

function modeToggle(mode) {
  const btn = (id, label) =>
    `<button type="button" class="seg__btn${mode === id ? " is-active" : ""}" data-positions-mode="${id}" aria-pressed="${mode === id}">${label}</button>`;
  return `<div class="seg" role="group" aria-label="Positions view">${btn("ranked", "Ranked")}${btn("table", "Table")}</div>`;
}

// mode: "ranked" | "table"
export function renderPositions(positions, mode) {
  const rows = ranked(positions);
  const maxSize = Math.max(...positions.map((p) => Math.abs(p.sizePct ?? 0)), 1);
  const body =
    rows.length === 0
      ? `<p class="empty-state">No open positions.</p>`
      : mode === "table"
        ? table(rows)
        : `<ul class="pos-list">${rows.map((p, i) => rankedRow(p, maxSize, i)).join("")}</ul>`;

  return `
    <section class="section" id="positions-section">
      <div class="section__head section__head--split">
        <div>
          <h2 class="section__title">Open positions</h2>
          <p class="section__sub">${rows.length} open · ranked by unrealized P&amp;L</p>
        </div>
        ${rows.length ? modeToggle(mode) : ""}
      </div>
      ${body}
    </section>`;
}
