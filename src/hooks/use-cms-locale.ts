"use client";

import { useCallback, useState } from "react";

import {
  COUNTRIES,
  DEFAULT_COUNTRY,
  DEFAULT_LANGUAGE,
  toLocaleId,
  type CountryCode,
  type LanguageCode,
  type LocaleId,
} from "@/lib/i18n/config";

export interface CmsLocale {
  country: CountryCode;
  lang: LanguageCode;
  localeId: LocaleId;
}

const DEFAULT_CMS_LOCALE: CmsLocale = {
  country: DEFAULT_COUNTRY,
  lang: DEFAULT_LANGUAGE,
  localeId: toLocaleId(DEFAULT_COUNTRY, DEFAULT_LANGUAGE),
};

export function useCmsLocale(initial?: Partial<CmsLocale>) {
  const [locale, setLocale] = useState<CmsLocale>(() => {
    if (!initial) return DEFAULT_CMS_LOCALE;
    const country = (initial.country ?? DEFAULT_COUNTRY) as CountryCode;
    const lang = (initial.lang ?? COUNTRIES[country].defaultLang) as LanguageCode;
    return { country, lang, localeId: toLocaleId(country, lang) };
  });

  const setCountry = useCallback((country: CountryCode) => {
    const defaultLang = COUNTRIES[country].defaultLang;
    setLocale({ country, lang: defaultLang, localeId: toLocaleId(country, defaultLang) });
  }, []);

  const setLanguage = useCallback((lang: LanguageCode) => {
    setLocale((prev) => ({ ...prev, lang, localeId: toLocaleId(prev.country, lang) }));
  }, []);

  const supportedLanguages = COUNTRIES[locale.country].supportedLangs;

  return { locale, setCountry, setLanguage, supportedLanguages };
}
