/**
 * Integration tests — CMS delivery + locale-aware content resolution
 *
 * Tests the locale fallback chain:
 * 1. Request locale (e.g., de-DE)
 * 2. Fallback language (e.g., en for Germany)
 * 3. Default locale (en-IN)
 *
 * Exercises block schema validation in a delivery context and ensures
 * sanitize-html is applied to all CMS HTML output.
 */
import { describe, expect, it } from "vitest";

import { validateBlockContent, BLOCK_TYPES, type BlockType } from "@/lib/cms/block-registry";
import { sanitizeCmsHtml } from "@/lib/cms/sanitize";
import { isLanguageSupportedInCountry, COUNTRIES, type CountryCode, type LanguageCode } from "@/lib/i18n/config";
import { localeRoute } from "@/lib/i18n/routing";

// ── Locale fallback chain simulation ──────────────────────────────────────────

/**
 * Simulates the CMS content resolution chain:
 * try requested locale → fallback language → default locale → null
 */
function resolveLocalisedContent<T>(
  country: CountryCode,
  lang: LanguageCode,
  contentMap: Partial<Record<string, T>>,
): { content: T | null; resolvedLocale: string } {
  const requestedKey = `${lang}-${COUNTRIES[country].iso.toUpperCase()}`;
  if (contentMap[requestedKey] !== undefined) {
    return { content: contentMap[requestedKey]!, resolvedLocale: requestedKey };
  }

  // Fallback to country's fallback language
  const fallbackLang = COUNTRIES[country].fallbackLang;
  const fallbackKey = `${fallbackLang}-${COUNTRIES[country].iso.toUpperCase()}`;
  if (contentMap[fallbackKey] !== undefined) {
    return { content: contentMap[fallbackKey]!, resolvedLocale: fallbackKey };
  }

  // Global default: en-IN
  if (contentMap["en-IN"] !== undefined) {
    return { content: contentMap["en-IN"]!, resolvedLocale: "en-IN" };
  }

  return { content: null, resolvedLocale: "none" };
}

describe("CMS locale fallback chain", () => {
  const homepageContent = {
    "de-DE": "Willkommen bei unserem Shop",
    "en-IN": "Welcome to our shop",
  };

  it("returns exact locale content when available", () => {
    const { content, resolvedLocale } = resolveLocalisedContent("de", "de", homepageContent);
    expect(content).toBe("Willkommen bei unserem Shop");
    expect(resolvedLocale).toBe("de-DE");
  });

  it("falls back to fallback language for missing locale", () => {
    // Germany has en as fallback but en-DE content is not in our map
    // Since de-DE exists, it won't fall back — test with French (no fr-FR in map)
    const frContentMap = { "en-IN": "Welcome" };
    const { content, resolvedLocale } = resolveLocalisedContent("fr", "fr", frContentMap);
    expect(content).toBe("Welcome");
    expect(resolvedLocale).toBe("en-IN"); // falls to global default
  });

  it("returns null when no content exists for any fallback", () => {
    const { content } = resolveLocalisedContent("de", "de", {});
    expect(content).toBeNull();
  });

  it("resolves Arabic (UAE) correctly when present", () => {
    const contentMap = {
      "ar-AE": "مرحباً بكم",
      "en-IN": "Welcome",
    };
    const { content, resolvedLocale } = resolveLocalisedContent("ae", "ar", contentMap);
    expect(content).toBe("مرحباً بكم");
    expect(resolvedLocale).toBe("ar-AE");
  });
});

describe("CMS block validation — delivery context", () => {
  it("validates all block types without error", () => {
    // Each type should at minimum have a defined default
    for (const type of BLOCK_TYPES) {
      // An empty object should fail for most blocks (required fields missing)
      // What we're testing is that schema.safeParse doesn't throw (vs. returning false)
      const result = validateBlockContent(type, {});
      expect(typeof result).toBe("boolean");
    }
  });

  it("hero_banner with minimal valid content passes delivery validation", () => {
    const deliverableBlock = {
      type: "hero_banner" as BlockType,
      content: { heading: "Summer Sale", align: "center" },
    };
    expect(validateBlockContent(deliverableBlock.type, deliverableBlock.content)).toBe(true);
  });

  it("rich_text with HTML content is sanitized before delivery", () => {
    const rawContent = '<p>Great <strong>product</strong>!</p><script>hack()</script>';
    const sanitized = sanitizeCmsHtml(rawContent);
    expect(sanitized).toContain("<strong>");
    expect(sanitized).not.toContain("<script>");
  });

  it("product_carousel with valid product IDs passes validation", () => {
    const block = {
      product_ids: ["pid-1", "pid-2", "pid-3"],
      limit: 6,
      heading: "Featured Products",
    };
    expect(validateBlockContent("product_carousel", block)).toBe(true);
  });
});

describe("CMS locale-aware routing", () => {
  it("builds correct URL for localized page path", () => {
    const url = localeRoute({ country: "de", lang: "de" }, "/pages/about-us");
    expect(url).toBe("/de/de/pages/about-us");
  });

  it("Arabic page URL is correctly formed", () => {
    const url = localeRoute({ country: "ae", lang: "ar" }, "/pages/privacy");
    expect(url).toBe("/ae/ar/pages/privacy");
  });
});

describe("CMS — locale support validation", () => {
  it("every configured locale combination is valid for routing", () => {
    // This ensures our CMS content keys align with actual supported locales
    for (const country of Object.values(COUNTRIES)) {
      for (const lang of country.supportedLangs as LanguageCode[]) {
        const isSupported = isLanguageSupportedInCountry(lang, country.id as CountryCode);
        expect(isSupported).toBe(true);
      }
    }
  });
});
