/* =========================================================================
   App shell: sidebar nav, topbar, and Signal overview page composition.
   Future pages (Positions, Performance, Experiments, Features, Seasonality,
   Health, Reports) exist in nav as inactive links — not built per spec.

   Wrapped in an IIFE so top-level declarations stay scoped to this script
   and never collide with sibling classic <script> files' global lexical
   bindings. Only `window.App` is exported. Dependencies are read from window:
   icons.js -> window.Icon, components.js -> window.Components,
   data.js  -> window.STATE.
   ========================================================================= */
(function () {
  "use strict";

  const Icon = (typeof window !== "undefined" && window.Icon)
    ? window.Icon
    : (typeof require === "function" ? require("./icons.js").Icon : null);
  const Comps = (typeof window !== "undefined" && window.Components)
    ? window.Components
    : (typeof require === "function" ? require("./components.js").Components : null);
  const STATE = (typeof window !== "undefined" && window.STATE)
    ? window.STATE
    : (typeof require === "function" ? require("./data.js").STATE : null);

  /* local aliases — keeps call sites short and stable */
  const {
    Card, MetricCard, Badge, MiniBar, HealthCell, StatusPill,
    HonestBanner, LLMDisclaimer, EquityChart, Legend,
    DirBadge, RegimeBadge, LegTag, usd, holdDays, esc,
  } = Comps;

  /* ---------- sidebar nav definition ---------- */
  // active: "signals". pending items render as inactive, no click target.
  const NAV = [
    {
      group: "Operations",
      items: [
        { id: "signals",    label: "Signals",    icon: "bolt",      active: true },
        { id: "positions",  label: "Positions",  icon: "briefcase", pending: true },
        { id: "performance",label: "Performance",icon: "chart",     pending: true },
      ],
    },
    {
      group: "Research",
      items: [
        { id: "experiments",label: "Experiments",icon: "flask",     pending: true },
        { id: "features",   label: "Features",   icon: "grid",      pending: true },
        { id: "seasonality",label: "Seasonality",icon: "calendar",  pending: true },
      ],
    },
    {
      group: "System",
      items: [
        { id: "health",     label: "Health",     icon: "heartbeat", pending: true },
        { id: "reports",    label: "Reports",    icon: "archive",   pending: true },
      ],
    },
  ];

  function Sidebar() {
    const groups = NAV.map((g) => {
      const items = g.items.map((it) => {
        const cls = it.active ? "nav-item" : "nav-item is-pending";
        const attrs = it.active
          ? 'aria-current="page"'
          : 'aria-disabled="true"';
        const title = it.pending ? ' title="Not built yet"' : "";
        return `<span class="${cls}" ${attrs}${title}>
          ${Icon.render(it.icon, { size: 17 })}
          <span>${esc(it.label)}</span>
        </span>`;
      }).join("");
      return `<div class="nav-group">
        <div class="nav-group__label">${esc(g.group)}</div>
        ${items}
      </div>`;
    }).join("");

    return `<aside class="sidebar">
      <div class="sidebar__brand">
        <span class="mark">QATS</span>
        <span class="ver">v0.4 · dashboard</span>
      </div>
      ${groups}
    </aside>`;
  }

  /* ---------- topbar ---------- */
  function statusLabel(s) {
    if (s === "live") return "Live";
    if (s === "paused") return "Paused";
    if (s === "error") return "Error";
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function Topbar({ title, timestamp, status, regime }) {
    const statusPill = StatusPill({
      variant: status, children: statusLabel(status),
    });
    const regimeBadge = Badge({
      variant: regime, children: "Regime: " + regime.charAt(0).toUpperCase() + regime.slice(1),
    });
    return `<header class="topbar">
      <div class="topbar__title">
        <h1>${esc(title)}</h1>
        <div class="topbar__meta">${esc(timestamp)}</div>
      </div>
      <div class="topbar__right">
        ${statusPill}
        ${regimeBadge}
        <button class="icon-btn" id="theme-toggle" title="Toggle theme"
                aria-label="Toggle color theme">
          ${Icon.render("moon", { size: 16 })}
        </button>
      </div>
    </header>`;
  }

  /* ---------- Section 3: active signals table ---------- */
  function SignalsTable(rows) {
    const body = rows.map((r) => {
      const confColor =
        r.dir === "long" ? "var(--green)" :
        r.dir === "short" ? "var(--red)" : "var(--gray)";
      return `<tr>
        <td class="cell-asset">${esc(r.asset)}</td>
        <td>${DirBadge(r.dir)}</td>
        <td>${LegTag(r.leg)}</td>
        <td>${RegimeBadge(r.regime)}</td>
        <td>${MiniBar({ value: r.conf, max: 1, color: confColor,
                        fmt: (v) => Math.round(v * 100) + "%" })}</td>
        <td class="${r.sizeUsd ? "" : "cell-muted"}">${usd(r.sizeUsd)}</td>
        <td class="${r.hold ? "" : "cell-muted"}">${holdDays(r.hold)}</td>
      </tr>`;
    }).join("");

    return `<div class="table-wrap"><table class="signals">
      <colgroup>
        <col class="col-asset"/><col class="col-dir"/><col class="col-leg"/>
        <col class="col-regime"/><col class="col-conf"/><col class="col-size"/>
        <col class="col-hold"/>
      </colgroup>
      <thead><tr>
        <th>Asset</th><th>Direction</th><th>Leg</th><th>Regime</th>
        <th>Confidence</th><th>Size USD</th><th>Hold</th>
      </tr></thead>
      <tbody>${body}</tbody>
    </table></div>`;
  }

  /* ---------- Signal overview page ---------- */
  function SignalOverview() {
    const s = STATE;

    // 1 — metric strip
    const metrics = s.metrics.map((m) => MetricCard({
      label: m.label, value: m.value, sub: m.sub,
      variant: m.variant, subVariant: m.subVariant,
    })).join("");

    // 4 — health grid
    const health = s.health.map((h) => HealthCell(h)).join("");

    // 5 — LLM brief
    const briefBody = s.brief.body.map((p) => `<p>${esc(p)}</p>`).join("");
    const briefRight = `<span class="card__sub">${esc(s.brief.track)} · ${esc(s.brief.state)} · ${esc(s.brief.date)}</span>`;

    return `
      <!-- 1 — metric strip -->
      <div class="metric-strip">${metrics}</div>

      <!-- 2 — honest negative banner -->
      ${HonestBanner({ text: s.banner.text })}

      <!-- 3 — active signals -->
      ${Card({
        title: "Active signals",
        right: `<span class="card__sub">Updated at close · ${esc(s.signals.updatedAt)} · ${s.signals.tracked} assets tracked</span>`,
        body: SignalsTable(s.signals.rows),
      })}

      <!-- 4 — system health -->
      ${Card({
        title: "System health",
        body: `<div class="health-grid">${health}</div>`,
      })}

      <!-- 5 — weekly LLM brief -->
      ${Card({
        title: "Weekly LLM brief",
        right: briefRight,
        body: `<div class="brief__body">${briefBody}</div>${LLMDisclaimer()}`,
      })}

      <!-- 6 — equity curve -->
      ${Card({
        title: "Equity curve",
        body: EquityChart({ series: s.equity.series }) + Legend({ series: s.equity.series }),
      })}
    `;
  }

  /* ---------- mount + theme ---------- */
  function mount() {
    const root = document.getElementById("app");
    if (!root) return;
    const s = STATE.topbar;
    root.innerHTML = `<div class="app">
      ${Sidebar()}
      <div class="main">
        ${Topbar(s)}
        <main class="content">${SignalOverview()}</main>
      </div>
    </div>`;

    initThemeToggle();
  }

  /* theme: respect saved pref, else system; flip <html data-theme> */
  function initThemeToggle() {
    const root = document.documentElement;
    const saved = localStorage.getItem("qats-theme");
    const prefersDark = window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches;
    const theme = saved || (prefersDark ? "dark" : "light");
    root.setAttribute("data-theme", theme);
    updateThemeIcon(theme);

    const btn = document.getElementById("theme-toggle");
    if (btn) {
      btn.addEventListener("click", () => {
        const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
        root.setAttribute("data-theme", next);
        localStorage.setItem("qats-theme", next);
        updateThemeIcon(next);
      });
    }
  }
  function updateThemeIcon(theme) {
    const btn = document.getElementById("theme-toggle");
    if (!btn) return;
    btn.innerHTML = Icon.render(theme === "dark" ? "sun" : "moon", { size: 16 });
  }

  if (typeof window !== "undefined") {
    window.App = { Sidebar, Topbar, SignalOverview, mount };
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", mount);
    } else {
      mount();
    }
  }
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { App: { Sidebar, Topbar, SignalOverview, mount } };
  }
})();
