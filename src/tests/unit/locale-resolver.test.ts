/**
 * Unit tests — Locale Resolver (pure functions only)
 *
 * Tests the resolution priority chain: URL → cookie → geo → accept-language → default.
 * All functions tested here are pure / do not call the DB.
 */
import { describe, expect, it } from "vitest";

import {
  DEFAULT_COUNTRY,
  DEFAULT_LANGUAGE,
  COUNTRIES,
  LANGUAGES,
  isValidCountry,
  isValidLanguage,
  isLanguageSupportedInCountry,
  toLocaleId,
  type CountryCode,
  type LanguageCode,
} from "@/lib/i18n/config";

import { resolveLocaleFromUrl } from "@/lib/i18n/locale-resolver";

// ── Config guard tests ─────────────────────────────────────────────────────────

describe("isValidCountry", () => {
  it("accepts known country codes", () => {
    expect(isValidCountry("de")).toBe(true);
    expect(isValidCountry("in")).toBe(true);
    expect(isValidCountry("us")).toBe(true);
    expect(isValidCountry("ae")).toBe(true);
  });

  it("rejects unknown country codes", () => {
    expect(isValidCountry("xx")).toBe(false);
    expect(isValidCountry("")).toBe(false);
    expect(isValidCountry("DE")).toBe(false); // case-sensitive
  });
});

describe("isValidLanguage", () => {
  it("accepts known language codes", () => {
    expect(isValidLanguage("en")).toBe(true);
    expect(isValidLanguage("de")).toBe(true);
    expect(isValidLanguage("ar")).toBe(true);
    expect(isValidLanguage("hi")).toBe(true);
  });

  it("rejects unknown language codes", () => {
    expect(isValidLanguage("xx")).toBe(false);
    expect(isValidLanguage("EN")).toBe(false);
    expect(isValidLanguage("")).toBe(false);
  });
});

describe("isLanguageSupportedInCountry", () => {
  it("German is supported in Germany", () => {
    expect(isLanguageSupportedInCountry("de", "de")).toBe(true);
  });

  it("English is supported in Germany (secondary)", () => {
    expect(isLanguageSupportedInCountry("en", "de")).toBe(true);
  });

  it("Arabic is supported in UAE", () => {
    expect(isLanguageSupportedInCountry("ar", "ae")).toBe(true);
  });

  it("Arabic is NOT supported in Germany", () => {
    expect(isLanguageSupportedInCountry("ar", "de")).toBe(false);
  });

  it("Hindi is supported in India", () => {
    expect(isLanguageSupportedInCountry("hi", "in")).toBe(true);
  });

  it("Hindi is NOT supported in US", () => {
    expect(isLanguageSupportedInCountry("hi", "us")).toBe(false);
  });
});

describe("toLocaleId", () => {
  it("builds correct locale ID for Germany / German", () => {
    expect(toLocaleId("de", "de")).toBe("de-DE");
  });

  it("builds correct locale ID for India / Hindi", () => {
    expect(toLocaleId("in", "hi")).toBe("hi-IN");
  });

  it("builds correct locale ID for UAE / Arabic", () => {
    expect(toLocaleId("ae", "ar")).toBe("ar-AE");
  });

  it("builds correct locale ID for US / English", () => {
    expect(toLocaleId("us", "en")).toBe("en-US");
  });
});

describe("resolveLocaleFromUrl", () => {
  it("returns resolved locale for valid country + lang pair", () => {
    const result = resolveLocaleFromUrl("de", "de");
    expect(result).not.toBeNull();
    expect(result!.country).toBe("de");
    expect(result!.language).toBe("de");
    expect(result!.source).toBe("url");
  });

  it("returns resolved locale for India English", () => {
    const result = resolveLocaleFromUrl("in", "en");
    expect(result).not.toBeNull();
    expect(result!.localeId).toBe("en-IN");
  });

  it("returns null for unsupported language in country", () => {
    // Arabic is not supported in Germany
    expect(resolveLocaleFromUrl("de", "ar")).toBeNull();
  });

  it("returns null for invalid country code", () => {
    expect(resolveLocaleFromUrl("xx", "en")).toBeNull();
  });

  it("returns null for invalid language code", () => {
    expect(resolveLocaleFromUrl("de", "xx" as LanguageCode)).toBeNull();
  });

  it("returns RTL direction for Arabic locale (UAE)", () => {
    const result = resolveLocaleFromUrl("ae", "ar");
    expect(result).not.toBeNull();
    expect(result!.dir).toBe("rtl");
  });

  it("returns LTR direction for non-RTL locale", () => {
    const result = resolveLocaleFromUrl("de", "de");
    expect(result!.dir).toBe("ltr");
  });
});

describe("COUNTRIES config invariants", () => {
  it("every country has a valid defaultLang in its supportedLangs", () => {
    for (const country of Object.values(COUNTRIES)) {
      expect(country.supportedLangs).toContain(country.defaultLang);
    }
  });

  it("every country has a valid fallbackLang in its supportedLangs", () => {
    for (const country of Object.values(COUNTRIES)) {
      expect(country.supportedLangs).toContain(country.fallbackLang);
    }
  });

  it("every supportedLang is a known language code", () => {
    for (const country of Object.values(COUNTRIES)) {
      for (const lang of country.supportedLangs) {
        expect(isValidLanguage(lang)).toBe(true);
      }
    }
  });
});

describe("LANGUAGES config invariants", () => {
  it("Arabic has RTL direction", () => {
    expect(LANGUAGES.ar.dir).toBe("rtl");
  });

  it("all non-Arabic languages have LTR direction", () => {
    for (const [code, lang] of Object.entries(LANGUAGES)) {
      if (code !== "ar") {
        expect(lang.dir).toBe("ltr");
      }
    }
  });

  it("every language has a non-empty bcp47 tag", () => {
    for (const lang of Object.values(LANGUAGES)) {
      expect(lang.bcp47.length).toBeGreaterThan(0);
    }
  });
});

describe("Default locale fallback", () => {
  it("default country is valid", () => {
    expect(isValidCountry(DEFAULT_COUNTRY)).toBe(true);
  });

  it("default language is valid", () => {
    expect(isValidLanguage(DEFAULT_LANGUAGE)).toBe(true);
  });

  it("default language is supported in default country", () => {
    expect(isLanguageSupportedInCountry(DEFAULT_LANGUAGE, DEFAULT_COUNTRY)).toBe(true);
  });
});
