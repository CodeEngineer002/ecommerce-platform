/**
 * Design token constants for use in JavaScript/TypeScript (e.g., animations,
 * dynamic styles, tests). All visual tokens must mirror globals.css and
 * tailwind.config.ts — never diverge from those sources of truth.
 */

export const tokens = {
  // ── Z-index scale ──────────────────────────────────────────────────────
  zIndex: {
    base: 0,
    raised: 10,
    dropdown: 1000,
    sticky: 1020,
    fixed: 1030,
    modalBackdrop: 1040,
    modal: 1050,
    popover: 1060,
    tooltip: 1070,
    toast: 1080,
  },

  // ── Border radius ──────────────────────────────────────────────────────
  borderRadius: {
    sm: "calc(var(--radius) - 4px)",
    md: "calc(var(--radius) - 2px)",
    lg: "var(--radius)",
    full: "9999px",
  },

  // ── Transition durations ───────────────────────────────────────────────
  transition: {
    fast: "150ms ease",
    normal: "200ms ease-out",
    slow: "300ms ease-out",
  },

  // ── Layout ─────────────────────────────────────────────────────────────
  layout: {
    sidebarWidth: "16rem",    // --sidebar-width
    headerHeight: "4rem",     // --header-height
    containerMaxWidth: "1400px",
    containerPadding: "2rem",
  },

  // ── Brand palette ──────────────────────────────────────────────────────
  brand: {
    50: "#fdf4ff",
    100: "#fae8ff",
    200: "#f5d0fe",
    300: "#f0abfc",
    400: "#e879f9",
    500: "#d946ef",
    600: "#c026d3",
    700: "#a21caf",
    800: "#86198f",
    900: "#701a75",
    950: "#4a044e",
  },

  // ── Animation presets ──────────────────────────────────────────────────
  animation: {
    fadeIn: "fade-in 0.3s ease-out",
    fadeInScale: "fade-in-scale 0.2s ease-out",
    slideInRight: "slide-in-right 0.3s ease-out",
    slideInLeft: "slide-in-left 0.3s ease-out",
    spin: "spin 1s linear infinite",
  },
} as const;

export type DesignTokens = typeof tokens;

// ── Breakpoints (must match tailwind screens) ──────────────────────────────
export const breakpoints = {
  sm: "640px",
  md: "768px",
  lg: "1024px",
  xl: "1280px",
  "2xl": "1400px",
} as const;

export type Breakpoint = keyof typeof breakpoints;
