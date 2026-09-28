// Small shared view pieces: inline icons (lucide shapes, no library),
// tooltip hints and monitoring-flag badges. String builders only.

import { escapeHtml } from "../format.js";

function icon(paths, size = 16) {
  return `<svg class="icon" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
}

export const ICONS = {
  book: icon('<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>'),
  info: icon('<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>', 12),
  arrowLeft: icon('<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>'),
  close: icon('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'),
};

let hintSeq = 0;

// A focusable trigger with a tooltip bubble shown on hover and
// :focus-visible (CSS). `labelHtml` must already be escaped / trusted markup;
// `text` is plain text and is escaped here.
export function hint(labelHtml, text, { className = "", withIcon = true } = {}) {
  const id = `hint-${++hintSeq}`;
  return `
    <button type="button" class="hint ${className}" aria-describedby="${id}">
      <span class="hint__label">${labelHtml}${withIcon ? ICONS.info : ""}</span>
      <span class="hint__bubble" role="tooltip" id="${id}">${escapeHtml(text)}</span>
    </button>`;
}

export const FLAG_HINT = "Monitor — not a verdict";

// Monitoring-flag badges ({ key, label } from data.js raisedFlags). Never
// rendered in the status slot or in the status colour scale.
export function flagBadges(flags) {
  if (!flags.length) return "";
  return `<span class="flags">${flags
    .map((f) => hint(escapeHtml(f.label), FLAG_HINT, { className: "flag", withIcon: false }))
    .join("")}</span>`;
}

// Status label (C1) in its tone (C2). `status` from cones.js streamStatus.
export function statusChip(status) {
  return `<span class="status status--${escapeHtml(status.tone)}">${escapeHtml(status.label)}</span>`;
}
