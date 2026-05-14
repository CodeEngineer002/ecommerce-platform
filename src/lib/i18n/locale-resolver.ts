import type { NextRequest } from 'next/server';

import {
  COUNTRIES,
  COUNTRY_COOKIE,
  DEFAULT_COUNTRY,
  DEFAULT_LANGUAGE,
  GEO_TO_COUNTRY,
  LANGUAGE_COOKIE,
  LANGUAGES,
  LOCALE_COOKIE,
  isLanguageSupportedInCountry,
  isValidCountry,
  isValidLanguage,
  toLocaleId,
  type CountryCode,
  type LanguageCode,
  type LocaleId,
} from './config';

export interface ResolvedLocale {
  country: CountryCode;
  language: LanguageCode;
  localeId: LocaleId;
  dir: 'ltr' | 'rtl';
  source: 'url' | 'cookie' | 'geo' | 'accept-language' | 'default';
}

// ── Resolution priority ───────────────────────────────────────────────────────
// 1. Explicit URL params  (/{country}/{lang}/)
// 2. Cookie preference    (set on previous visit / account save)
// 3. Geo / IP detection   (Cloudflare cf-ipcountry, Vercel x-vercel-ip-country)
// 4. Accept-Language      (browser header)
// 5. Default fallback     (India / English)

export function resolveLocaleFromUrl(
  country: string,
  lang: string,
): ResolvedLocale | null {
  if (!isValidCountry(country) || !isValidLanguage(lang)) return null;
  if (!isLanguageSupportedInCountry(lang, country)) return null;

  return buildResolved(country, lang, 'url');
}

export function resolveLocaleFromRequest(request: NextRequest): ResolvedLocale {
  // 1. Cookie preference
  const cookieCountry = request.cookies.get(COUNTRY_COOKIE)?.value;
  const cookieLang = request.cookies.get(LANGUAGE_COOKIE)?.value;
  if (
    cookieCountry && cookieLang &&
    isValidCountry(cookieCountry) &&
    isValidLanguage(cookieLang) &&
    isLanguageSupportedInCountry(cookieLang, cookieCountry)
  ) {
    return buildResolved(cookieCountry, cookieLang, 'cookie');
  }

  // 2. Geo / IP detection (Cloudflare + Vercel headers)
  const geoCountryCode =
    request.headers.get('cf-ipcountry') ??
    request.headers.get('x-vercel-ip-country') ??
    null;

  if (geoCountryCode && geoCountryCode in GEO_TO_COUNTRY) {
    const country = GEO_TO_COUNTRY[geoCountryCode as keyof typeof GEO_TO_COUNTRY];
    const lang = COUNTRIES[country].defaultLang;
    return buildResolved(country, lang, 'geo');
  }

  // 3. Accept-Language header
  const acceptLang = request.headers.get('accept-language') ?? '';
  const resolved = parseAcceptLanguage(acceptLang);
  if (resolved) return resolved;

  // 4. Default
  return buildResolved(DEFAULT_COUNTRY, DEFAULT_LANGUAGE, 'default');
}

function parseAcceptLanguage(header: string): ResolvedLocale | null {
  if (!header) return null;
  const tags = header
    .split(',')
    .map((s) => s.trim().split(';')[0].trim().toLowerCase());

  for (const tag of tags) {
    // e.g. 'de-de', 'fr-fr', 'en-us'
    const [rawLang, rawRegion] = tag.split('-');

    if (rawLang && rawRegion) {
      // Match by region code
      const matchedCountry = Object.values(COUNTRIES).find(
        (c) => c.iso.toLowerCase() === rawRegion,
      );
      if (matchedCountry && isValidLanguage(rawLang) && isLanguageSupportedInCountry(rawLang, matchedCountry.id)) {
        return buildResolved(matchedCountry.id, rawLang, 'accept-language');
      }
    }

    if (rawLang && isValidLanguage(rawLang)) {
      // Find a country where this is the default language
      const country = Object.values(COUNTRIES).find((c) => c.defaultLang === rawLang);
      if (country) {
        return buildResolved(country.id, rawLang, 'accept-language');
      }
    }
  }
  return null;
}

function buildResolved(
  country: CountryCode,
  language: LanguageCode,
  source: ResolvedLocale['source'],
): ResolvedLocale {
  const dir = LANGUAGES[language].dir;
  return {
    country,
    language,
    localeId: toLocaleId(country, language),
    dir,
    source,
  };
}

// ── Cookie helpers ────────────────────────────────────────────────────────────

export function buildLocaleCookies(resolved: ResolvedLocale): Record<string, string> {
  return {
    [LOCALE_COOKIE]: resolved.localeId,
    [COUNTRY_COOKIE]: resolved.country,
    [LANGUAGE_COOKIE]: resolved.language,
  };
}
