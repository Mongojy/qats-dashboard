/* =========================================================================
   Outline icon set (Tabler-style, stroke-only, 24x24 viewBox)
   Usage: Icon.name   -> returns SVG string
          Icon.render(name, {cls, size}) -> inline-ready markup
   Each path uses stroke="currentColor" so color is inherited.

   Wrapped in an IIFE so top-level declarations (P, ICONS, Icon) stay scoped
   to this script and never leak into the global lexical scope of sibling
   classic <script> files (which would cause SyntaxError redeclarations).
   Only `window.Icon` is exported.
   ========================================================================= */
(function () {
  "use strict";

  const P = (d, extra = "") =>
    `<path d="${d}" fill="none" stroke="currentColor" stroke-width="1.6" ` +
    `stroke-linecap="round" stroke-linejoin="round"${extra ? " " + extra : ""}/>`;

  const ICONS = {
    // nav — Operations
    bolt:      `${P("M13 2 4.5 13.5H11l-1 8.5L19.5 10H13z")}`,
    briefcase: `${P("M3 7h18v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z")}${P("M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2")}${P("M3 12h18")}`,
    chart:     `${P("M4 20V4")}${P("M4 20h16")}${P("M8 17v-4")}${P("M12 17V8")}${P("M16 17v-6")}`,
    // nav — Research
    flask:     `${P("M9 3h6")}${P("M10 3v6.5L5.2 18a1.5 1.5 0 0 0 1.3 2.3h11a1.5 1.5 0 0 0 1.3-2.3L14 9.5V3")}${P("M7.5 15h9")}`,
    grid:      `${P("M4 4h6v6H4z")}${P("M14 4h6v6h-6z")}${P("M4 14h6v6H4z")}${P("M14 14h6v6h-6z")}`,
    calendar:  `${P("M4 6a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z")}${P("M4 9h16")}${P("M8 3v4")}${P("M16 3v4")}${P("M8 13h3v3H8z")}`,
    // nav — System
    heartbeat: `${P("M3 12h4l2-5 3 9 2-5 1 1h6")}`,
    archive:   `${P("M4 5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v3H4z")}${P("M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8")}${P("M10 12h4")}`,
    // topbar / health / misc
    sun:       `${P("M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z")}${P("M12 2v2")}${P("M12 20v2")}${P("M4.9 4.9l1.4 1.4")}${P("M17.7 17.7l1.4 1.4")}${P("M2 12h2")}${P("M20 12h2")}${P("M4.9 19.1l1.4-1.4")}${P("M17.7 6.3l1.4-1.4")}`,
    moon:      `${P("M21 12.8A8.5 8.5 0 1 1 11.2 3a6.5 6.5 0 0 0 9.8 9.8z")}`,
    check:     `${P("M5 12l5 5 9-10")}`,
    alert:     `${P("M12 3 2 20h20z")}${P("M12 10v4")}${P("M12 17.5h.01")}`,
    x:         `${P("M6 6l12 12")}${P("M18 6 6 18")}`,
    robot:     `${P("M7 7h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z")}${P("M12 3v4")}${P("M9 3h6")}${P("M9.5 12h.01")}${P("M14.5 12h.01")}${P("M9 16h6")}${P("M3 11v4")}${P("M21 11v4")}`,
  };

  const Icon = {
    get(name) { return ICONS[name] || ""; },
    render(name, { cls = "", size = 16 } = {}) {
      const body = ICONS[name] || "";
      return `<svg class="${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" ` +
             `fill="none" aria-hidden="true">${body}</svg>`;
    },
    has(name) { return Object.prototype.hasOwnProperty.call(ICONS, name); },
  };

  if (typeof window !== "undefined") window.Icon = Icon;
  if (typeof module !== "undefined") module.exports = { Icon, ICONS };
})();
