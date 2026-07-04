/* =========================================================================
   Reusable component library — pure render functions returning HTML strings.
   Components (per inventory):
     MetricCard, Badge, Tag, MiniBar, HealthCell, StatusPill,
     HonestBanner, LLMDisclaimer, EquityChart, DrawdownChart,
     TrialCard, ForwardProgress
   Plus small helpers (Card, CardHead) used internally.

   Wrapped in an IIFE so top-level declarations stay scoped to this script
   and never collide with sibling classic <script> files' global lexical
   bindings. Only `window.Components` is exported. The icon dependency is read
   from window.Icon (set by icons.js).
   ========================================================================= */
(function () {
  "use strict";

  /* cross-script dependency: icons.js exposes window.Icon */
  const Icon = (typeof window !== "undefined" && window.Icon)
    ? window.Icon
    : (typeof require === "function" ? require("./icons.js").Icon : null);

  /* escape user-facing strings defensively */
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  /* format USD with thin separators */
  function usd(n) {
    if (!n) return "—";
    return "$" + Number(n).toLocaleString("en-US");
  }
  function holdDays(n) {
    if (!n) return "—";
    return n + (n === 1 ? " day" : " days");
  }

  /* ---------- card shell ---------- */
  function Card({ title, sub, right = "", body = "", cls = "" } = {}) {
    const head = (title || right)
      ? `<div class="card__head">
           <div>${title ? `<div class="card__title">${esc(title)}</div>` : ""}</div>
           ${right || ""}
         </div>`
      : "";
    return `<section class="card ${cls}">
      ${head}
      ${sub ? `<div class="card__sub card__sub--offset">${esc(sub)}</div>` : ""}
      ${body}
    </section>`;
  }

  /* ---------- MetricCard ---------- */
  // variant: neutral | positive | negative | muted
  function MetricCard({ label, value, sub = "", variant = "neutral", subVariant = "" } = {}) {
    const vCls =
      variant === "negative" ? "is-neg" :
      variant === "positive" ? "is-pos" :
      variant === "muted"    ? "is-mute" : "";
    const subCls = subVariant === "negative" ? "is-neg" : "";
    return `<div class="metric">
      <div class="metric__label">${esc(label)}</div>
      <div class="metric__value num ${vCls}">${esc(value)}</div>
      ${sub ? `<div class="metric__sub num ${subCls}">${esc(sub)}</div>` : ""}
    </div>`;
  }

  /* ---------- Badge ---------- */
  // variant: long | short | flat | bull | bear | chop | pass | fail | warn | neutral
  function Badge({ variant = "neutral", children } = {}) {
    return `<span class="badge badge--${variant}">${esc(children)}</span>`;
  }

  /* direction badge from a raw dir string */
  function DirBadge(dir) {
    if (dir === "long")  return Badge({ variant: "long",  children: "long" });
    if (dir === "short") return Badge({ variant: "short", children: "short" });
    return Badge({ variant: "flat", children: "flat" });
  }
  function RegimeBadge(regime) {
    const map = { bull: "bull", bear: "bear", chop: "chop" };
    return Badge({ variant: map[regime] || "neutral", children: regime || "—" });
  }

  /* ---------- Tag (categorical pill) ---------- */
  function Tag({ children, dash = false } = {}) {
    return `<span class="tag ${dash ? "tag--dash" : ""}">${esc(children)}</span>`;
  }
  function LegTag(leg) {
    if (leg === "spot" || leg === "perp") return Tag({ children: leg });
    return Tag({ children: "—", dash: true });
  }

  /* ---------- MiniBar ---------- */
  function MiniBar({ value = 0, max = 1, color = "var(--green)", fmt = null } = {}) {
    const pct = Math.max(0, Math.min(1, value / max)) * 100;
    const label = fmt ? fmt(value) : Math.round(value * 100) + "%";
    return `<div class="minibar">
      <div class="minibar__track">
        <div class="minibar__fill" style="width:${pct}%;background:${color}"></div>
      </div>
      <div class="minibar__val num">${esc(label)}</div>
    </div>`;
  }

  /* ---------- StatusPill ---------- */
  // variant: live | paused | error
  function StatusPill({ variant = "live", children } = {}) {
    return `<span class="statuspill statuspill--${variant}">
      <span class="statuspill__dot"></span>${esc(children)}
    </span>`;
  }

  /* ---------- HonestBanner ---------- */
  function HonestBanner({ text } = {}) {
    return `<div class="banner" role="note">
      ${Icon.render("alert", { size: 20 })}
      <div><span class="banner__label">Honest negative:</span> ${esc(text)}</div>
    </div>`;
  }

  /* ---------- HealthCell ---------- */
  // status: ok | warn | err
  function HealthCell({ status, label, sub } = {}) {
    const iconName = status === "ok" ? "check" : status === "warn" ? "alert" : "x";
    const cls = status === "ok" ? "health-cell--ok"
              : status === "warn" ? "health-cell--warn"
              : "health-cell--err";
    return `<div class="health-cell ${cls}">
      <span class="health-cell__icon">${Icon.render(iconName, { size: 16 })}</span>
      <div class="health-cell__body">
        <div class="health-cell__label">${esc(label)}</div>
        <div class="health-cell__sub">${esc(sub)}</div>
      </div>
    </div>`;
  }

  /* ---------- LLMDisclaimer (footer row) ---------- */
  function LLMDisclaimer() {
    return `<div class="llm-foot">
      ${Icon.render("robot", { size: 15 })}
      <span>LLM-generated draft — not a trading decision · operator review required</span>
    </div>`;
  }

  /* ---------- equity chart (SVG, three line styles) ---------- */
  function EquityChart({ series = [] } = {}) {
    const W = 760, H = 220, padL = 8, padR = 8, padT = 12, padB = 12;
    const innerW = W - padL - padR;
    const innerH = H - padT - padB;

    // global min/max across all series so lines share a scale
    let min = Infinity, max = -Infinity, n = 0;
    for (const s of series) {
      n = Math.max(n, s.data.length);
      for (const v of s.data) { if (v < min) min = v; if (v > max) max = v; }
    }
    if (!isFinite(min) || !isFinite(max)) { min = 0; max = 1; }
    if (max === min) max = min + 1;
    const pad = (max - min) * 0.08;
    min -= pad; max += pad;

    const x = (i) => padL + (n <= 1 ? 0 : (i / (n - 1)) * innerW);
    const y = (v) => padT + (1 - (v - min) / (max - min)) * innerH;

    const lines = series.map((s) => {
      const pts = s.data.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
      const dash = s.dash ? `stroke-dasharray="${s.dash}"` : "";
      return `<polyline points="${pts}" fill="none"
                stroke="${s.color}" stroke-width="1.8"
                stroke-linecap="round" stroke-linejoin="round" ${dash}/>`;
    }).join("");

    // baseline at y of starting value (1.0) for visual reference
    let baseline = "";
    const startVal = series.length ? series[0].data[0] : null;
    if (startVal != null && startVal >= min && startVal <= max) {
      baseline = `<line x1="${padL}" y1="${y(startVal).toFixed(1)}"
                  x2="${W - padR}" y2="${y(startVal).toFixed(1)}"
                  stroke="var(--border-strong)" stroke-width="0.5"
                  stroke-dasharray="2 3"/>`;
    }

    return `<svg class="chart-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Equity curve">
      ${baseline}${lines}
    </svg>`;
  }

  /* legend tags below the equity chart */
  function Legend({ series = [] } = {}) {
    const items = series.map((s) => {
      let lineStyle = "solid";
      if (s.dash) {
        const dashLen = parseFloat(String(s.dash).split(/\s+/)[0]);
        lineStyle = dashLen < 3 ? "dotted" : "dashed";
      }
      const style = `border-top-style:${lineStyle};border-top-color:${s.color};`;
      return `<span class="legend__item">
        <span class="legend__swatch" style="${style}"></span>${esc(s.label)}
      </span>`;
    }).join("");
    return `<div class="legend">${items}</div>`;
  }

  /* ---------- DrawdownChart (negative filled area) ---------- */
  function DrawdownChart({ series = [] } = {}) {
    // expects series like equity; derive a representative drawdown from first series
    const W = 760, H = 80, padL = 8, padR = 8, padT = 8, padB = 8;
    const innerW = W - padL - padR;
    const innerH = H - padT - padB;
    const s = series[0];
    if (!s || !s.data.length) return "";
    const data = s.data;
    let peak = data[0];
    const dd = data.map((v) => { if (v > peak) peak = v; return v - peak; }); // <= 0
    let minDd = 0;
    for (const v of dd) if (v < minDd) minDd = v;
    if (minDd === 0) minDd = -0.01;
    const x = (i) => padL + (data.length <= 1 ? 0 : (i / (data.length - 1)) * innerW);
    const y = (v) => padT + (1 - (v - minDd) / (0 - minDd)) * innerH;
    const top = padT; // y of 0 line
    const path = dd.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
    const area = `${path} L${x(data.length - 1).toFixed(1)},${top} L${x(0).toFixed(1)},${top} Z`;
    return `<svg class="chart-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Drawdown">
      <line x1="${padL}" y1="${top}" x2="${W - padR}" y2="${top}"
            stroke="var(--border)" stroke-width="0.5"/>
      <path d="${area}" class="drawdown-fill" fill="var(--danger)" stroke="none"/>
      <path d="${path}" fill="none" stroke="var(--red)" stroke-width="1.4"/>
    </svg>`;
  }

  /* ---------- TrialCard (Research page — built for reuse, not yet mounted) ---------- */
  function TrialCard({ name, stage, status, summary = "", trialCount = null } = {}) {
    const stageTag = Tag({ children: stage });
    const statusVariant =
      status === "pass" ? "pass" :
      status === "fail" ? "fail" :
      status === "negative" ? "neutral" :
      status === "running" ? "warn" : "neutral";
    const statusBadge = Badge({ variant: statusVariant, children: status });
    return `<article class="card trial-card">
      <div class="card__head">
        <div class="trial-card__name">${esc(name)} ${stageTag}</div>
        ${statusBadge}
      </div>
      ${summary ? `<div class="brief__body trial-card__summary">${esc(summary)}</div>` : ""}
      ${trialCount != null
        ? `<div class="card__sub trial-card__trials">Trials run: <span class="num">${esc(trialCount)}</span></div>`
        : ""}
    </article>`;
  }

  /* ---------- ForwardProgress (Performance page — built for reuse) ---------- */
  function ForwardProgress({ current, target, label = "closes" } = {}) {
    const ratio = Math.max(0, Math.min(1, current / target));
    const gate = ratio >= 1 ? "met" : ratio >= 0.8 ? "approaching" : "not yet";
    return `<div class="forward-progress">
      ${MiniBar({ value: current, max: target, color: "var(--blue)",
                  fmt: () => `${current} / ${target} ${label}` })}
      <span class="tag forward-progress__gate">${gate}</span>
    </div>`;
  }

  if (typeof window !== "undefined") {
    window.Components = {
      Card, MetricCard, Badge, Tag, MiniBar, HealthCell, StatusPill,
      HonestBanner, LLMDisclaimer, EquityChart, DrawdownChart, Legend,
      TrialCard, ForwardProgress,
      DirBadge, RegimeBadge, LegTag, usd, holdDays, esc,
    };
  }
  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      Components: {
        Card, MetricCard, Badge, Tag, MiniBar, HealthCell, StatusPill,
        HonestBanner, LLMDisclaimer, EquityChart, DrawdownChart, Legend,
        TrialCard, ForwardProgress,
        DirBadge, RegimeBadge, LegTag, usd, holdDays, esc,
      },
    };
  }
})();
