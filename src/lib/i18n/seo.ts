// ─────────────────────────────────────────────────────────────────────────────
// INTERNATIONAL SEO HELPERS
// Generates hreflang tags, canonical URLs, and locale-aware metadata
// per the Google international targeting spec:
// https://developers.google.com/search/docs/specialty/international/localized-versions
// ─────────────────────────────────────────────────────────────────────────────

import type { Metadata } from 'next';

import {
  COUNTRIES,
  LANGUAGES,
  type LanguageCode,
} from './config';
import { localeRoute, type LocaleParams } from './routing';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:4000';

// ── hreflang helpers ──────────────────────────────────────────────────────────

export interface HreflangEntry {
  hreflang: string;   // BCP-47 tag: 'de', 'en-DE', 'x-default'
  href: string;       // Absolute URL
}

/**
 * Build the full hreflang set for a given page path.
 * Iterates all active locales across all countries.
 */
export function buildHreflangEntries(barePath: string): HreflangEntry[] {
  const entries: HreflangEntry[] = [];

  for (const country of Object.values(COUNTRIES)) {
    for (const lang of country.supportedLangs as LanguageCode[]) {
      const params: LocaleParams = { country: country.id, lang };
      const absoluteUrl = `${APP_URL}${localeRoute(params, barePath)}`;
      // hreflang: 'de' for default, 'en-DE' for non-default language
      const hreflang =
        lang === country.defaultLang
          ? LANGUAGES[lang].bcp47
          : `${LANGUAGES[lang].bcp47}-${country.iso}`;
      entries.push({ hreflang, href: absoluteUrl });
    }
  }

  // x-default points to the global default locale
  entries.push({
    hreflang: 'x-default',
    href: `${APP_URL}/`,
  });

  return entries;
}

// ── Locale-aware Next.js Metadata ─────────────────────────────────────────────

export interface LocalizedMetadataInput {
  params: LocaleParams;
  barePath: string;        // bare path without locale prefix, e.g. '/products/my-slug'
  title: string;
  description?: string;
  ogImage?: string;
}

export function buildLocalizedMetadata({
  params,
  barePath,
  title,
  description,
  ogImage,
}: LocalizedMetadataInput): Metadata {
  const canonicalUrl = `${APP_URL}${localeRoute(params, barePath)}`;
  const hreflang = buildHreflangEntries(barePath);

  const languages: Record<string, string> = {};
  for (const entry of hreflang) {
    languages[entry.hreflang] = entry.href;
  }

  return {
    title,
    description,
    alternates: {
      canonical: canonicalUrl,
      languages,
    },
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      ...(ogImage && { images: [{ url: ogImage }] }),
    },
  };
}

// ── Sitemap entry helpers ─────────────────────────────────────────────────────

export interface SitemapEntry {
  url: string;
  lastModified?: Date;
  changeFrequency?: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
  priority?: number;
  alternates?: HreflangEntry[];
}

export function buildSitemapEntries(
  paths: Array<{ barePath: string; lastModified?: Date; priority?: number }>,
): SitemapEntry[] {
  const entries: SitemapEntry[] = [];

  for (const { barePath, lastModified, priority } of paths) {
    for (const country of Object.values(COUNTRIES)) {
      for (const lang of country.supportedLangs as LanguageCode[]) {
        const params: LocaleParams = { country: country.id, lang };
        entries.push({
          url: `${APP_URL}${localeRoute(params, barePath)}`,
          lastModified,
          changeFrequency: 'weekly',
          priority: priority ?? 0.7,
          alternates: buildHreflangEntries(barePath),
        });
      }
    }
  }

  return entries;
}

// ── Structured data / JSON-LD ─────────────────────────────────────────────────

export function buildBreadcrumbJsonLd(
  params: LocaleParams,
  crumbs: Array<{ name: string; path: string }>,
) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((crumb, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: crumb.name,
      item: `${APP_URL}${localeRoute(params, crumb.path)}`,
    })),
  };
}
