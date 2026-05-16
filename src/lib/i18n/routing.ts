// ─────────────────────────────────────────────────────────────────────────────
// LOCALE-AWARE ROUTING HELPERS
// All internal links in localized pages must go through these helpers so
// the /{country}/{lang}/ prefix is automatically injected.
// ─────────────────────────────────────────────────────────────────────────────

import { COUNTRIES, LANGUAGES, type CountryCode, type LanguageCode } from './config';

export interface LocaleParams {
  country: CountryCode;
  lang: LanguageCode;
}

/** Base prefix for a locale: /de/de */
export function localePath({ country, lang }: LocaleParams): string {
  return `/${country}/${lang}`;
}

/** Build a fully-prefixed path: localePath(de,de) + /products → /de/de/products */
export function localeRoute(
  params: LocaleParams,
  path: string,
): string {
  const prefix = localePath(params);
  const normalised = path.startsWith('/') ? path : `/${path}`;
  return `${prefix}${normalised}`;
}

// ── Typed locale-aware ROUTES ─────────────────────────────────────────────────
// Mirror of the global ROUTES constant but prefixed with /{country}/{lang}

export function buildLocaleRoutes(params: LocaleParams) {
  const r = (path: string) => localeRoute(params, path);

  return {
    home:          localePath(params),
    products:      r('/products'),
    product:       (slug: string) => r(`/products/${slug}`),
    category:      (slug: string) => r(`/categories/${slug}`),
    cart:          r('/cart'),
    checkout:      r('/checkout'),
    orders:        r('/orders'),
    order:         (id: string) => r(`/orders/${id}`),
    orderReturn:   (id: string) => r(`/orders/${id}/return`),
    orderSuccess:  (id: string) => r(`/orders/${id}/success`),
    profile:       r('/profile'),
    search:        r('/search'),
    wishlist:      r('/wishlist'),
    page:          (slug: string) => r(`/pages/${slug}`),
    // Auth and Admin are not locale-prefixed
    login:         '/login',
    register:      '/register',
    admin:         '/admin',
  } as const;
}

// ── Alternate locale links (for hreflang / language switcher) ─────────────────

export interface AlternateLocale {
  country: CountryCode;
  lang: LanguageCode;
  href: string;
  label: string;
  nativeLabel: string;
}

export function buildAlternates(
  currentPath: string,
  currentParams: LocaleParams,
): AlternateLocale[] {
  const { supportedLangs } = COUNTRIES[currentParams.country];
  // Strip the /{country}/{lang} prefix from currentPath to get the bare path
  const prefix = localePath(currentParams);
  const barePath = currentPath.startsWith(prefix)
    ? currentPath.slice(prefix.length) || '/'
    : currentPath;

  return (supportedLangs as readonly LanguageCode[]).map((lang) => ({
    country: currentParams.country,
    lang,
    href: localeRoute({ country: currentParams.country, lang }, barePath),
    label: LANGUAGES[lang].name,
    nativeLabel: LANGUAGES[lang].nativeName,
  }));
}

// ── Country switcher ──────────────────────────────────────────────────────────

export interface CountryOption {
  country: CountryCode;
  lang: LanguageCode;    // the default lang for that country
  href: string;
  label: string;
  nativeLabel: string;
  flag?: string;
}

export function buildCountryOptions(barePath = '/'): CountryOption[] {
  return Object.values(COUNTRIES).map((c) => ({
    country: c.id,
    lang: c.defaultLang,
    href: localeRoute({ country: c.id, lang: c.defaultLang }, barePath),
    label: c.name,
    nativeLabel: c.nativeName,
  }));
}
