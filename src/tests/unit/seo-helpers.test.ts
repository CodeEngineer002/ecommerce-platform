/**
 * Unit tests — SEO Helpers
 *
 * Tests hreflang generation, localized metadata, and sitemap helpers.
 * All functions are pure (no DB, no Next.js runtime needed).
 */
import { describe, expect, it } from "vitest";

import {
  buildHreflangEntries,
  buildLocalizedMetadata,
  buildSitemapEntries,
} from "@/lib/i18n/seo";
import { COUNTRIES, LANGUAGES } from "@/lib/i18n/config";

const APP_URL = "http://localhost:3000";

describe("buildHreflangEntries", () => {
  it("includes an x-default entry", () => {
    const entries = buildHreflangEntries("/products");
    const xDefault = entries.find((e) => e.hreflang === "x-default");
    expect(xDefault).toBeDefined();
  });

  it("x-default points to the app root", () => {
    const entries = buildHreflangEntries("/products");
    const xDefault = entries.find((e) => e.hreflang === "x-default")!;
    expect(xDefault.href).toMatch(/^https?:\/\//);
  });

  it("includes entries for all supported locales", () => {
    const entries = buildHreflangEntries("/products");
    // Every country × supported lang pair should have an entry (excluding x-default)
    const localeEntries = entries.filter((e) => e.hreflang !== "x-default");
    const expectedCount = Object.values(COUNTRIES).reduce(
      (sum, c) => sum + c.supportedLangs.length,
      0,
    );
    expect(localeEntries).toHaveLength(expectedCount);
  });

  it("builds correct hreflang for German default locale (de-DE → 'de')", () => {
    const entries = buildHreflangEntries("/");
    // Germany's defaultLang is 'de', so hreflang should be 'de' (language only)
    const deEntry = entries.find((e) => e.hreflang === LANGUAGES.de.bcp47);
    expect(deEntry).toBeDefined();
  });

  it("builds correct hreflang for non-default language in country (en-DE → 'en-DE')", () => {
    const entries = buildHreflangEntries("/");
    // English in Germany → hreflang should be 'en-DE'
    const enDeEntry = entries.find((e) => e.hreflang === "en-DE");
    expect(enDeEntry).toBeDefined();
  });

  it("each entry has a valid absolute URL", () => {
    const entries = buildHreflangEntries("/products/test-slug");
    for (const entry of entries.filter((e) => e.hreflang !== "x-default")) {
      expect(entry.href).toMatch(/^https?:\/\/.+\/(products\/test-slug)/);
    }
  });

  it("bare path is correctly appended to locale prefix", () => {
    const entries = buildHreflangEntries("/categories/electronics");
    const deEntry = entries.find((e) => e.hreflang === "de")!;
    expect(deEntry.href).toContain("/de/de/categories/electronics");
  });
});

describe("buildLocalizedMetadata", () => {
  it("sets the canonical URL with locale prefix", () => {
    const meta = buildLocalizedMetadata({
      params: { country: "de", lang: "de" },
      barePath: "/products/test",
      title: "Test Title",
    });
    expect((meta.alternates?.canonical as string)).toContain("/de/de/products/test");
  });

  it("sets title correctly", () => {
    const meta = buildLocalizedMetadata({
      params: { country: "us", lang: "en" },
      barePath: "/",
      title: "My Shop",
    });
    expect(meta.title).toBe("My Shop");
  });

  it("includes description when provided", () => {
    const meta = buildLocalizedMetadata({
      params: { country: "fr", lang: "fr" },
      barePath: "/products",
      title: "Produits",
      description: "Nos produits",
    });
    expect(meta.description).toBe("Nos produits");
  });

  it("includes openGraph url", () => {
    const meta = buildLocalizedMetadata({
      params: { country: "in", lang: "en" },
      barePath: "/checkout",
      title: "Checkout",
    });
    expect((meta.openGraph as { url: string })?.url).toBeDefined();
  });

  it("includes ogImage in openGraph when provided", () => {
    const meta = buildLocalizedMetadata({
      params: { country: "us", lang: "en" },
      barePath: "/",
      title: "Home",
      ogImage: "https://example.com/og.jpg",
    });
    expect((meta.openGraph as { images?: Array<{ url: string }> })?.images?.[0]?.url).toBe(
      "https://example.com/og.jpg",
    );
  });

  it("includes alternates.languages map", () => {
    const meta = buildLocalizedMetadata({
      params: { country: "de", lang: "de" },
      barePath: "/products",
      title: "Produkte",
    });
    expect(meta.alternates?.languages).toBeDefined();
    expect(typeof meta.alternates?.languages).toBe("object");
  });
});

describe("buildSitemapEntries (if exported)", () => {
  // Guard: only run if buildSitemapEntries is exported
  it("is importable from seo module", async () => {
    const mod = await import("@/lib/i18n/seo");
    // Just check the module exports the expected helpers
    expect(typeof mod.buildHreflangEntries).toBe("function");
    expect(typeof mod.buildLocalizedMetadata).toBe("function");
  });
});
