// Entry point: fetches /api/summary and /api/verdicts in parallel, owns the
// UI state and the hash router, and wires DOM events. Everything payload-
// shaped goes through data.js / cones.js; markup comes from views/*.

import {
  getAsOfDate,
  findStream,
  openPositions,
  bookStats,
  briefing,
  matchesFilter,
  matchesUniverse,
  hasUnpinned,
  defaultUniverse,
  sortForList,
  firstSelectable,
} from "./data.js";
import { loadCones, coneFor, readsWrittenCount } from "./cones.js";
import { buildRows } from "./rows.js";
import { escapeHtml } from "./format.js";
import { renderHeader } from "./views/header.js";
import { renderList } from "./views/list.js";
import { renderDetail, renderUnknownStream } from "./views/detail.js";
import { renderPositions } from "./views/positions.js";
import { renderGlossary } from "./views/glossary.js";

const headerEl = document.getElementById("masthead");
const panesEl = document.getElementById("panes");
const listEl = document.getElementById("list");
const detailEl = document.getElementById("detail");
const glossaryEl = document.getElementById("glossary");

// Narrow screens get a narrower cone viewBox so its in-SVG labels stay
// legible; re-rendered only when this breakpoint flips.
const narrowQuery = window.matchMedia("(max-width: 639px)");
const splitQuery = window.matchMedia("(min-width: 1024px)");

const state = {
  summary: null,
  conesPayload: null,
  conesState: "loading", // "loading" | "ready" | "failed"
  universe: null, // "v1" | "v2"; set from the summary on first render
  filter: "all",
  positionsMode: "ranked",
  animateList: true,
  listScrollY: 0,
};

// ---------------------------------------------------------------------------
// Derived rows
// ---------------------------------------------------------------------------

// undefined while cones are not loaded; null = no cone (reference stream).
function coneHandle(id) {
  return state.conesState === "ready" ? coneFor(state.conesPayload, id) : undefined;
}

function allRows() {
  return buildRows(state.summary, state.conesState, state.conesPayload);
}

// ---------------------------------------------------------------------------
// Routing: #/ -> first non-reference card of the current tab + filter;
// #/stream/{id} -> that one (and its universe tab). The route also decides
// list vs detail on narrow screens.
// ---------------------------------------------------------------------------

function currentRoute() {
  const hash = window.location.hash.replace(/^#/, "") || "/";
  const match = hash.match(/^\/stream\/(.+)$/);
  if (!match) return { id: null };
  try {
    return { id: decodeURIComponent(match[1]) };
  } catch {
    return { id: match[1] };
  }
}

function tabRows(rows) {
  return rows.filter((r) => matchesUniverse(r, state.universe));
}

function visibleRows(rows) {
  return sortForList(tabRows(rows).filter((r) => matchesFilter(r, state.filter)));
}

function selectedId(rows) {
  const route = currentRoute();
  if (route.id !== null) return route.id;
  return (firstSelectable(visibleRows(rows)) ?? firstSelectable(sortForList(tabRows(rows))) ?? firstSelectable(sortForList(rows)))?.id ?? null;
}

// Deep link: the active tab follows the routed stream's universe. Pinned
// (reference) streams are in every tab, so they leave the tab alone; an id
// not in the summary changes nothing.
function syncUniverseToRoute(rows) {
  if (state.universe === null) state.universe = defaultUniverse(rows);
  const { id } = currentRoute();
  const row = id === null ? null : rows.find((r) => r.id === id);
  if (row && !row.pinned) state.universe = row.universe;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function renderMasthead(rows) {
  const known = state.conesState === "ready";
  headerEl.innerHTML = renderHeader({
    asOfDate: getAsOfDate(state.summary),
    stats: bookStats(rows, known),
    briefing: briefing(rows, known, known ? readsWrittenCount(state.conesPayload) : 0),
    conesState: state.conesState,
  });
}

function renderListPane(rows) {
  listEl.innerHTML = renderList({
    rows: visibleRows(rows),
    universe: state.universe,
    universeEmpty: !hasUnpinned(rows, state.universe),
    filter: state.filter,
    selectedId: selectedId(rows),
    animate: state.animateList,
  });
  state.animateList = false;
}

function renderDetailPane(rows) {
  const id = selectedId(rows);
  const stream = id === null ? null : findStream(state.summary, id);
  if (!stream) {
    detailEl.innerHTML = id === null ? `<p class="empty-state">No streams in summary.</p>` : renderUnknownStream(id);
    return;
  }
  const row = rows.find((r) => r.id === id);
  detailEl.innerHTML = renderDetail({
    stream,
    status: row.status,
    flags: row.flags,
    next: row.next,
    cone: coneHandle(id),
    conesPayload: state.conesPayload,
    asOfDate: getAsOfDate(state.summary),
    coneWidth: narrowQuery.matches ? 360 : 640,
    positionsMode: state.positionsMode,
  });
}

function renderAll() {
  if (!state.summary) return;
  const rows = allRows();
  if (state.universe === null) state.universe = defaultUniverse(rows);
  panesEl.dataset.route = currentRoute().id === null ? "list" : "detail";
  renderMasthead(rows);
  renderListPane(rows);
  renderDetailPane(rows);
}

function renderError(message) {
  panesEl.dataset.route = "list";
  listEl.innerHTML = `<p class="error-state">Failed to load summary: ${escapeHtml(message)}</p>`;
  detailEl.innerHTML = "";
}

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

function startCones() {
  state.conesState = "loading";
  loadCones()
    .then((payload) => {
      state.conesPayload = payload;
      state.conesState = "ready";
    })
    .catch(() => {
      state.conesPayload = null;
      state.conesState = "failed";
    })
    .finally(renderAll);
}

async function loadSummary() {
  const res = await fetch("/api/summary");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const summary = await res.json();
  if (summary.schema_version !== 2) {
    console.warn(`Unexpected schema_version: ${summary.schema_version}`);
  }
  return summary;
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

// Tab and chip changes re-render the list; the detail follows only on route
// #/ (its default card). On #/stream/{id} the detail stays as it is, even
// when the new tab does not hold that stream — no navigation.
function refreshListAndDefaultDetail() {
  const rows = allRows();
  renderListPane(rows);
  if (currentRoute().id === null) {
    renderDetailPane(rows);
    detailEl.scrollTop = 0;
  }
}

function selectUniverse(universe, { focus = false } = {}) {
  state.universe = universe;
  refreshListAndDefaultDetail();
  if (focus) listEl.querySelector(`[data-universe="${universe}"]`)?.focus();
}

// Tablist keyboard pattern: arrows / Home / End move and activate.
listEl.addEventListener("keydown", (event) => {
  const tab = event.target instanceof Element ? event.target.closest('[role="tab"]') : null;
  if (!tab) return;
  const tabs = [...listEl.querySelectorAll('[role="tab"]')];
  const i = tabs.indexOf(tab);
  const to = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[event.key];
  if (to === undefined) return;
  event.preventDefault();
  const next = tabs[(to + tabs.length) % tabs.length];
  selectUniverse(next.dataset.universe, { focus: true });
});

function onRouteChange(prevRouteWasList) {
  if (state.conesState === "failed") startCones();
  const route = currentRoute();
  if (state.summary) syncUniverseToRoute(allRows());
  renderAll();

  if (splitQuery.matches) {
    detailEl.scrollTop = 0;
  } else if (route.id !== null) {
    if (prevRouteWasList) state.listScrollY = window.scrollY;
    window.scrollTo(0, panesEl.offsetTop);
  } else {
    window.scrollTo(0, state.listScrollY);
  }
}

let lastRouteWasList = currentRoute().id === null;
window.addEventListener("hashchange", () => {
  const prev = lastRouteWasList;
  lastRouteWasList = currentRoute().id === null;
  onRouteChange(prev);
});

document.addEventListener("click", (event) => {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;

  const universeBtn = target.closest("[data-universe]");
  if (universeBtn) {
    // The re-render replaces the clicked button; keep focus on the tab.
    selectUniverse(universeBtn.dataset.universe, { focus: true });
    return;
  }

  const filterBtn = target.closest("[data-filter]");
  if (filterBtn) {
    state.filter = filterBtn.dataset.filter;
    refreshListAndDefaultDetail();
    return;
  }

  const modeBtn = target.closest("[data-positions-mode]");
  if (modeBtn) {
    state.positionsMode = modeBtn.dataset.positionsMode;
    const stream = findStream(state.summary, selectedId(allRows()));
    const section = document.getElementById("positions-section");
    if (stream && section) {
      section.outerHTML = renderPositions(openPositions(stream), state.positionsMode);
      document.querySelector(`[data-positions-mode="${state.positionsMode}"]`)?.focus();
    }
    return;
  }

  const posToggle = target.closest("[data-position-toggle]");
  if (posToggle) {
    const open = posToggle.getAttribute("aria-expanded") !== "true";
    posToggle.setAttribute("aria-expanded", String(open));
    const panel = document.getElementById(posToggle.getAttribute("aria-controls"));
    if (panel) panel.hidden = !open;
    return;
  }

  if (target.closest("[data-glossary-open]")) {
    glossaryEl.showModal();
    return;
  }
  if (target.closest("[data-glossary-close]")) {
    glossaryEl.close();
    return;
  }
  // Backdrop click: the dialog element itself is the only target outside
  // its panel.
  if (target === glossaryEl) glossaryEl.close();
});

// Esc closes <dialog> natively; either way focus goes back to the trigger.
glossaryEl.addEventListener("close", () => {
  headerEl.querySelector("[data-glossary-open]")?.focus();
});

narrowQuery.addEventListener("change", () => {
  if (state.summary) renderDetailPane(allRows());
});

// ---------------------------------------------------------------------------
// Boot: both fetches start together; list + KPIs render from the summary
// without waiting for verdicts.
// ---------------------------------------------------------------------------

async function init() {
  glossaryEl.innerHTML = renderGlossary();
  startCones();
  try {
    state.summary = await loadSummary();
    syncUniverseToRoute(allRows());
    renderAll();
  } catch (err) {
    renderError(err.message);
  }
}

init();
