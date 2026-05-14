import { describe, expect, it } from "vitest";

import {
  BLOCK_TYPES,
  getBlockEntry,
  validateBlockContent,
} from "@/lib/cms/block-registry";
import { sanitizeCmsHtml } from "@/lib/cms/sanitize";
import {
  COUNTRIES,
  DEFAULT_COUNTRY,
  DEFAULT_LANGUAGE,
  LANGUAGE_CODES,
  LANGUAGES,
  isLanguageSupportedInCountry,
  isValidCountry,
  isValidLanguage,
  toLocaleId,
} from "@/lib/i18n/config";

// ── Block registry ─────────────────────────────────────────────────────────────

describe("BLOCK_TYPES", () => {
  it("contains expected types", () => {
    expect(BLOCK_TYPES).toContain("hero_banner");
    expect(BLOCK_TYPES).toContain("rich_text");
    expect(BLOCK_TYPES).toContain("custom_html");
    expect(BLOCK_TYPES).toHaveLength(10);
  });
});

describe("getBlockEntry", () => {
  it("returns the registry entry for a known type", () => {
    const entry = getBlockEntry("hero_banner");
    expect(entry.type).toBe("hero_banner");
    expect(entry.label).toBe("Hero Banner");
    expect(entry.schema).toBeDefined();
  });

  it("includes a defaultContent for every type", () => {
    for (const type of BLOCK_TYPES) {
      const entry = getBlockEntry(type);
      expect(entry.defaultContent).toBeDefined();
    }
  });
});

describe("validateBlockContent", () => {
  it("accepts valid hero_banner content", () => {
    expect(validateBlockContent("hero_banner", { heading: "Welcome" })).toBe(true);
  });

  it("rejects hero_banner missing required heading", () => {
    expect(validateBlockContent("hero_banner", {})).toBe(false);
  });

  it("accepts valid rich_text content", () => {
    expect(validateBlockContent("rich_text", { content: "Hello world" })).toBe(true);
  });

  it("rejects rich_text missing content field", () => {
    expect(validateBlockContent("rich_text", {})).toBe(false);
  });

  it("accepts minimal cta_strip content", () => {
    expect(
      validateBlockContent("cta_strip", { text: "Offer", cta_text: "Buy", cta_url: "/shop" })
    ).toBe(true);
  });

  it("rejects custom_html with missing html field", () => {
    expect(validateBlockContent("custom_html", {})).toBe(false);
  });

  it("accepts faq with empty items array", () => {
    expect(validateBlockContent("faq", { items: [] })).toBe(true);
  });

  it("rejects completely wrong data shape", () => {
    expect(validateBlockContent("newsletter", "invalid")).toBe(false);
  });
});

// ── i18n config ────────────────────────────────────────────────────────────────

describe("toLocaleId", () => {
  it("produces BCP-47 locale from country + lang", () => {
    expect(toLocaleId("de", "de")).toBe("de-DE");
    expect(toLocaleId("de", "en")).toBe("en-DE");
    expect(toLocaleId("in", "hi")).toBe("hi-IN");
    expect(toLocaleId("in", "en")).toBe("en-IN");
    expect(toLocaleId("ae", "ar")).toBe("ar-AE");
    expect(toLocaleId("ae", "en")).toBe("en-AE");
  });
});

describe("isValidCountry", () => {
  it("accepts valid country codes", () => {
    expect(isValidCountry("de")).toBe(true);
    expect(isValidCountry("in")).toBe(true);
    expect(isValidCountry("ae")).toBe(true);
  });

  it("rejects unknown country codes", () => {
    expect(isValidCountry("xx")).toBe(false);
    expect(isValidCountry("")).toBe(false);
    expect(isValidCountry("DE")).toBe(false);
  });
});

describe("isValidLanguage", () => {
  it("accepts valid language codes", () => {
    expect(isValidLanguage("de")).toBe(true);
    expect(isValidLanguage("ar")).toBe(true);
    expect(isValidLanguage("hi")).toBe(true);
  });

  it("rejects unknown language codes", () => {
    expect(isValidLanguage("xx")).toBe(false);
    expect(isValidLanguage("zh")).toBe(false);
  });
});

describe("isLanguageSupportedInCountry", () => {
  it("Germany supports de and en", () => {
    expect(isLanguageSupportedInCountry("de", "de")).toBe(true);
    expect(isLanguageSupportedInCountry("en", "de")).toBe(true);
  });

  it("Germany does not support Arabic", () => {
    expect(isLanguageSupportedInCountry("ar", "de")).toBe(false);
  });

  it("UAE supports ar and en", () => {
    expect(isLanguageSupportedInCountry("ar", "ae")).toBe(true);
    expect(isLanguageSupportedInCountry("en", "ae")).toBe(true);
  });

  it("India supports hi and en", () => {
    expect(isLanguageSupportedInCountry("hi", "in")).toBe(true);
    expect(isLanguageSupportedInCountry("en", "in")).toBe(true);
  });

  it("US only supports en", () => {
    expect(isLanguageSupportedInCountry("en", "us")).toBe(true);
    expect(isLanguageSupportedInCountry("de", "us")).toBe(false);
  });
});

describe("Locale fallback chain (COUNTRIES config)", () => {
  it("Germany's fallback is English", () => {
    expect(COUNTRIES["de"].fallbackLang).toBe("en");
    expect(COUNTRIES["de"].defaultLang).toBe("de");
  });

  it("India's fallback is English, default is Hindi", () => {
    expect(COUNTRIES["in"].fallbackLang).toBe("en");
    expect(COUNTRIES["in"].defaultLang).toBe("hi");
  });

  it("UAE's fallback is English, default is Arabic", () => {
    expect(COUNTRIES["ae"].fallbackLang).toBe("en");
    expect(COUNTRIES["ae"].defaultLang).toBe("ar");
  });

  it("DEFAULT_COUNTRY and DEFAULT_LANGUAGE produce a valid locale", () => {
    const localeId = toLocaleId(DEFAULT_COUNTRY, DEFAULT_LANGUAGE);
    expect(localeId).toBe("en-IN");
  });
});

describe("Arabic RTL config", () => {
  it("Arabic language is marked RTL", () => {
    expect(LANGUAGES["ar"].dir).toBe("rtl");
  });

  it("All other supported languages are LTR", () => {
    for (const code of LANGUAGE_CODES) {
      if (code !== "ar") {
        expect(LANGUAGES[code].dir).toBe("ltr");
      }
    }
  });
});

// ── HTML sanitizer ─────────────────────────────────────────────────────────────

describe("sanitizeCmsHtml", () => {
  it("returns null for null input", () => {
    expect(sanitizeCmsHtml(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(sanitizeCmsHtml(undefined)).toBeNull();
  });

  it("strips <script> tags", () => {
    const result = sanitizeCmsHtml('<p>Hello</p><script>alert("xss")</script>');
    expect(result).not.toContain("<script>");
    expect(result).not.toContain("alert");
    expect(result).toContain("<p>Hello</p>");
  });

  it("strips on* event attributes", () => {
    const result = sanitizeCmsHtml('<a href="/shop" onclick="steal()">Click</a>');
    expect(result).not.toContain("onclick");
    expect(result).toContain('href="/shop"');
  });

  it("strips javascript: hrefs", () => {
    const result = sanitizeCmsHtml('<a href="javascript:void(0)">Click</a>');
    expect(result).not.toContain("javascript:");
  });

  it("preserves safe HTML structure", () => {
    const safe = '<h1>Title</h1><p>Text with <strong>bold</strong> and <em>italic</em>.</p>';
    const result = sanitizeCmsHtml(safe);
    expect(result).toContain("<h1>Title</h1>");
    expect(result).toContain("<strong>bold</strong>");
    expect(result).toContain("<em>italic</em>");
  });

  it("preserves img with safe attributes", () => {
    const result = sanitizeCmsHtml('<img src="/image.jpg" alt="test" loading="lazy">');
    expect(result).toContain('src="/image.jpg"');
    expect(result).toContain('alt="test"');
  });

  it("preserves links with safe attributes", () => {
    const result = sanitizeCmsHtml('<a href="/page" target="_blank" rel="noopener">Link</a>');
    expect(result).toContain('href="/page"');
    expect(result).toContain('rel="noopener"');
  });
});
