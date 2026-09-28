// "Plain language" glossary (D8). Static copy; the same bodies feed the
// tooltips on the detail view's stat labels via glossaryBody().

import { escapeHtml } from "../format.js";
import { ICONS } from "./ui.js";

const TERMS = [
  {
    term: "Book value",
    was: "Equity",
    body: "Mark-to-market value of the stream's paper book, started at a nominal $10,000. Includes the anchor-day move, so it can differ from Live P&L.",
  },
  {
    term: "Live P&L",
    was: "net_pnl_pct",
    body: "Return since the anchor close, open positions marked to market. The number the expected range is read against.",
  },
  {
    term: "Day",
    was: "equity row",
    body: "Daily closes since the anchor close. 4-hour streams can run one day ahead of daily streams.",
  },
  {
    term: "Deployed",
    was: "Gross",
    body: "Longs plus shorts, as a share of the book. Can exceed 100%.",
  },
  {
    term: "Net exposure",
    was: "Net",
    body: "Longs minus shorts, as a share of the book. Equals deployed when every open position is long.",
  },
  {
    term: "Scheduled read",
    was: "Verdict read",
    body: "A verdict is issued only at scheduled reads: the first once a stream has at least 90 daily closes and 20 closed trades, on the 30-close grid (90, 120, 150 …), then every 30 closes. Between reads the dashboard is monitoring, not evidence. A stream that reaches 180 closes with fewer than 20 closed trades is read on the cone only; its cost leg is inconclusive, so it cannot be On track.",
  },
  {
    term: "On track",
    was: "ON_TRACK",
    body: "At the last scheduled read the live path was inside p5–p95 and every leg was measured and clean. Weak evidence against a dead edge, not evidence of a live one.",
  },
  {
    term: "Watch",
    was: "WATCH",
    body: "One breach at a scheduled read: below p5, above p95, or a cost breach. A second consecutive Watch on the same leg is Kill.",
  },
  {
    term: "Kill",
    was: "KILL",
    body: "Below p1 at a scheduled read, a hard cost breach, or two consecutive Watches on the same leg.",
  },
  {
    term: "Incomplete",
    was: "INCOMPLETE",
    body: "A leg could not be measured and no measured leg breached.",
  },
  {
    term: "Suspended",
    was: "SUSPEND",
    body: "Integrity failure. The stream is fixed and restarts with a new anchor.",
  },
  {
    term: "Reference",
    was: "no cone",
    body: "A passive stream kept for comparison. Not under test, no expected range.",
  },
  {
    term: "Monitoring flags",
    was: "drawdown / drift / edge_decay",
    body: "Diagnostics from the daily run, not verdict inputs.",
    items: [
      {
        term: "Edge decay",
        body: "Needs at least 10 trades opened since the anchor and since closed. Raised when the later half of those trades wins less than 70% as often as the earlier half.",
      },
      {
        term: "Drift",
        body: "Raised when the annualized Sharpe of daily returns since the anchor is below half the stream's pre-registered backtest Sharpe. The reference Sharpe comes from a different backtest basis per stream.",
      },
      {
        term: "Drawdown",
        body: "Raised when the stream's equity is more than 50% below its highest daily close since the anchor.",
      },
    ],
  },
  {
    term: "Expected range",
    was: "Verdict cone",
    body: "Percentile bands of cumulative return from the frozen backtest, drawn only at the read grid (90 … 360 closes). Below p5 at a scheduled read is a breach; below p1 is Kill.",
  },
  {
    term: "Underpowered",
    was: "cone_underpowered",
    body: "At this horizon even a dead edge rarely breaches the band, so passing says little.",
  },
  {
    term: "Cost leg",
    was: "Shadow replay",
    body: "Implementation drift against a shadow replay of the same orders, with zero slippage on both sides — not market execution cost.",
  },
  {
    term: "Vote",
    was: "vote",
    body: "The strategy's recorded vote, shown as stored. TSMOM v1: the current signal vote, recomputed daily. The TSMOM v3 streams (incl. gross cap and long-only): the vote at entry. Amihud and Bitcoin hold record none (dash).",
  },
];

export function glossaryBody(term) {
  return TERMS.find((t) => t.term === term)?.body ?? "";
}

function renderItems(items) {
  return `<ul class="glossary__sub">${items
    .map((i) => `<li><p class="glossary__term">${escapeHtml(i.term)}</p><p class="glossary__body">${escapeHtml(i.body)}</p></li>`)
    .join("")}</ul>`;
}

// Inner markup of the <dialog id="glossary">.
export function renderGlossary() {
  return `
    <div class="glossary__panel">
      <header class="glossary__header">
        <div>
          <h2 class="glossary__title" id="glossary-title">Plain language</h2>
          <p class="glossary__desc">Research terms, rewritten so the desk is readable.</p>
        </div>
        <button type="button" class="icon-btn" data-glossary-close aria-label="Close glossary">${ICONS.close}</button>
      </header>
      <div class="glossary__scroll">
        <ul class="glossary__list">
          ${TERMS.map(
            (t) => `
            <li>
              <p class="glossary__term">${escapeHtml(t.term)}</p>
              <p class="glossary__was">${escapeHtml(t.was)}</p>
              <p class="glossary__body">${escapeHtml(t.body)}</p>
              ${t.items ? renderItems(t.items) : ""}
            </li>`,
          ).join("")}
        </ul>
      </div>
    </div>`;
}
