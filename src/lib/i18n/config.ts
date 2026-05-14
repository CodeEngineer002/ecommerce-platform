// ─────────────────────────────────────────────────────────────────────────────
// GLOBALIZATION CONFIG
// Single source of truth for all country, language, and locale definitions.
// These are compile-time constants — no DB call needed for routing/middleware.
// ─────────────────────────────────────────────────────────────────────────────

export const COUNTRY_CODES = ['us', 'uk', 'de', 'fr', 'it', 'es', 'in', 'ae'] as const;
export type CountryCode = (typeof COUNTRY_CODES)[number];

export const LANGUAGE_CODES = ['en', 'de', 'fr', 'it', 'es', 'hi', 'ar'] as const;
export type LanguageCode = (typeof LANGUAGE_CODES)[number];

// Locale ID = BCP-47-ish: {lang}-{ISO_COUNTRY} e.g. 'de-DE', 'en-DE', 'hi-IN'
export type LocaleId =
  | 'en-US' | 'en-GB'
  | 'de-DE' | 'en-DE'
  | 'fr-FR' | 'en-FR'
  | 'it-IT' | 'en-IT'
  | 'es-ES' | 'en-ES'
  | 'hi-IN' | 'en-IN'
  | 'ar-AE' | 'en-AE';

export interface LanguageConfig {
  id: LanguageCode;
  name: string;
  nativeName: string;
  dir: 'ltr' | 'rtl';
  bcp47: string;
}

export interface CountryConfig {
  id: CountryCode;
  name: string;
  nativeName: string;
  iso: string;                      // ISO alpha-2 (used in locale IDs)
  defaultLang: LanguageCode;
  fallbackLang: LanguageCode;
  supportedLangs: readonly LanguageCode[];
  currency: string;
  timezone: string;
}

// ── Language definitions ──────────────────────────────────────────────────────

export const LANGUAGES: Record<LanguageCode, LanguageConfig> = {
  en: { id: 'en', name: 'English',  nativeName: 'English',   dir: 'ltr', bcp47: 'en' },
  de: { id: 'de', name: 'German',   nativeName: 'Deutsch',   dir: 'ltr', bcp47: 'de' },
  fr: { id: 'fr', name: 'French',   nativeName: 'Français',  dir: 'ltr', bcp47: 'fr' },
  it: { id: 'it', name: 'Italian',  nativeName: 'Italiano',  dir: 'ltr', bcp47: 'it' },
  es: { id: 'es', name: 'Spanish',  nativeName: 'Español',   dir: 'ltr', bcp47: 'es' },
  hi: { id: 'hi', name: 'Hindi',    nativeName: 'हिन्दी',     dir: 'ltr', bcp47: 'hi' },
  ar: { id: 'ar', name: 'Arabic',   nativeName: 'العربية',   dir: 'rtl', bcp47: 'ar' },
};

// ── Country definitions ───────────────────────────────────────────────────────

export const COUNTRIES: Record<CountryCode, CountryConfig> = {
  us: {
    id: 'us', name: 'United States', nativeName: 'United States',
    iso: 'US', defaultLang: 'en', fallbackLang: 'en',
    supportedLangs: ['en'], currency: 'USD', timezone: 'America/New_York',
  },
  uk: {
    id: 'uk', name: 'United Kingdom', nativeName: 'United Kingdom',
    iso: 'GB', defaultLang: 'en', fallbackLang: 'en',
    supportedLangs: ['en'], currency: 'GBP', timezone: 'Europe/London',
  },
  de: {
    id: 'de', name: 'Germany', nativeName: 'Deutschland',
    iso: 'DE', defaultLang: 'de', fallbackLang: 'en',
    supportedLangs: ['de', 'en'], currency: 'EUR', timezone: 'Europe/Berlin',
  },
  fr: {
    id: 'fr', name: 'France', nativeName: 'France',
    iso: 'FR', defaultLang: 'fr', fallbackLang: 'en',
    supportedLangs: ['fr', 'en'], currency: 'EUR', timezone: 'Europe/Paris',
  },
  it: {
    id: 'it', name: 'Italy', nativeName: 'Italia',
    iso: 'IT', defaultLang: 'it', fallbackLang: 'en',
    supportedLangs: ['it', 'en'], currency: 'EUR', timezone: 'Europe/Rome',
  },
  es: {
    id: 'es', name: 'Spain', nativeName: 'España',
    iso: 'ES', defaultLang: 'es', fallbackLang: 'en',
    supportedLangs: ['es', 'en'], currency: 'EUR', timezone: 'Europe/Madrid',
  },
  in: {
    id: 'in', name: 'India', nativeName: 'भारत',
    iso: 'IN', defaultLang: 'hi', fallbackLang: 'en',
    supportedLangs: ['hi', 'en'], currency: 'INR', timezone: 'Asia/Kolkata',
  },
  ae: {
    id: 'ae', name: 'United Arab Emirates', nativeName: 'الإمارات',
    iso: 'AE', defaultLang: 'ar', fallbackLang: 'en',
    supportedLangs: ['ar', 'en'], currency: 'AED', timezone: 'Asia/Dubai',
  },
};

// ── Locale ID helpers ─────────────────────────────────────────────────────────

export function toLocaleId(country: CountryCode, lang: LanguageCode): LocaleId {
  return `${lang}-${COUNTRIES[country].iso}` as LocaleId;
}

export function parseLocaleId(localeId: LocaleId): { lang: LanguageCode; iso: string } {
  const [lang, iso] = localeId.split('-') as [LanguageCode, string];
  return { lang, iso };
}

// ── Validation helpers ────────────────────────────────────────────────────────

export function isValidCountry(code: string): code is CountryCode {
  return (COUNTRY_CODES as readonly string[]).includes(code);
}

export function isValidLanguage(code: string): code is LanguageCode {
  return (LANGUAGE_CODES as readonly string[]).includes(code);
}

export function isLanguageSupportedInCountry(lang: LanguageCode, country: CountryCode): boolean {
  return (COUNTRIES[country].supportedLangs as readonly string[]).includes(lang);
}

// ── Defaults ──────────────────────────────────────────────────────────────────

export const DEFAULT_COUNTRY: CountryCode = 'in';
export const DEFAULT_LANGUAGE: LanguageCode = 'en';
export const DEFAULT_LOCALE: LocaleId = toLocaleId(DEFAULT_COUNTRY, DEFAULT_LANGUAGE);

// Geo/IP country code → our CountryCode mapping
export const GEO_TO_COUNTRY: Record<string, CountryCode> = {
  US: 'us', GB: 'uk', DE: 'de', FR: 'fr',
  IT: 'it', ES: 'es', IN: 'in', AE: 'ae',
};

export const LOCALE_COOKIE = 'x-locale-pref';
export const COUNTRY_COOKIE = 'x-country-pref';
export const LANGUAGE_COOKIE = 'x-lang-pref';
