// ─────────────────────────────────────────────────────────────────────────────
// RTL / LTR DIRECTION UTILITIES
// Arabic requires right-to-left layout. This module provides helpers for:
//   - setting the HTML dir attribute
//   - conditionally applying RTL-aware class names
//   - logical CSS property mapping for components
// ─────────────────────────────────────────────────────────────────────────────

import { LANGUAGES, type LanguageCode } from './config';

export type TextDirection = 'ltr' | 'rtl';

export function getDirection(lang: LanguageCode): TextDirection {
  return LANGUAGES[lang].dir;
}

export function isRtl(lang: LanguageCode): boolean {
  return LANGUAGES[lang].dir === 'rtl';
}

// ── Class name helpers ────────────────────────────────────────────────────────
// Tailwind supports rtl: and ltr: variants when darkMode = ["class"] and
// the `rtl` strategy is enabled. These helpers wrap common directional patterns.

/** Returns a space-separated string of directional Tailwind classes.
 *  Usage: dir('text-left', 'text-right', isRtl(lang))
 *  → 'text-right' when RTL, 'text-left' when LTR
 */
export function dir(ltrClass: string, rtlClass: string, rtl: boolean): string {
  return rtl ? rtlClass : ltrClass;
}

/**
 * Returns Tailwind logical-property class names that work in both LTR and RTL.
 * Prefer `ms-*` / `me-*` (margin-inline-start/end) over `ml-*` / `mr-*`.
 */
export const logical = {
  // Margins
  ms: (size: string) => `ms-${size}`,
  me: (size: string) => `me-${size}`,
  // Padding
  ps: (size: string) => `ps-${size}`,
  pe: (size: string) => `pe-${size}`,
  // Border radius (corner shortcuts not needed — use rounded-* directly)
  // Text alignment
  textStart: 'text-start',
  textEnd: 'text-end',
  // Flex
  justifyStart: 'justify-start',
  justifyEnd: 'justify-end',
} as const;

// ── HTML attributes helper ────────────────────────────────────────────────────

export interface DirectionAttributes {
  dir: TextDirection;
  lang: string;        // BCP-47 lang attribute for <html>
}

export function getHtmlAttributes(langCode: LanguageCode): DirectionAttributes {
  return {
    dir: getDirection(langCode),
    lang: LANGUAGES[langCode].bcp47,
  };
}

// ── Font family helpers ───────────────────────────────────────────────────────
// Arabic and Hindi need different fonts. This maps lang → Tailwind font class.

export const LANG_FONT_CLASS: Partial<Record<LanguageCode, string>> = {
  ar: 'font-arabic',   // Define in tailwind.config.ts: { 'arabic': ['Noto Sans Arabic', 'sans-serif'] }
  hi: 'font-hindi',    // Define: { 'hindi': ['Noto Sans Devanagari', 'sans-serif'] }
};

export function getFontClass(lang: LanguageCode): string {
  return LANG_FONT_CLASS[lang] ?? 'font-sans';
}
