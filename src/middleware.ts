import { type NextRequest, NextResponse } from "next/server";

import {
  COUNTRIES,
  COUNTRY_COOKIE,
  LANGUAGE_COOKIE,
  LANGUAGES,
  LOCALE_COOKIE,
  isLanguageSupportedInCountry,
  isValidCountry,
  isValidLanguage,
  toLocaleId,
  type CountryCode,
  type LanguageCode,
} from "@/lib/i18n/config";
import { resolveLocaleFromRequest } from "@/lib/i18n/locale-resolver";
import { updateSession } from "@/lib/supabase/middleware";

// Paths that bypass locale handling entirely
const LOCALE_SKIP_PREFIXES = [
  "/admin", "/api", "/_next", "/login", "/register", "/forgot-password",
];

function shouldSkipLocale(pathname: string): boolean {
  return LOCALE_SKIP_PREFIXES.some((p) => pathname.startsWith(p));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Always refresh Supabase session
  const sessionResponse = await updateSession(request);

  if (shouldSkipLocale(pathname)) {
    return sessionResponse;
  }

  const segments = pathname.split("/").filter(Boolean);
  const [seg0, seg1] = segments;

  // ── Case 1: URL has /{country}/{lang}/... prefix ──────────────────────────
  if (seg0 && seg1 && isValidCountry(seg0) && isValidLanguage(seg1)) {
    const country = seg0 as CountryCode;
    const lang = seg1 as LanguageCode;

    // If language not supported in this country, redirect to country default
    if (!isLanguageSupportedInCountry(lang, country)) {
      const defaultLang = COUNTRIES[country].defaultLang;
      const rest = segments.slice(2).join("/");
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = `/${country}/${defaultLang}${rest ? `/${rest}` : ""}`;
      return NextResponse.redirect(redirectUrl);
    }

    // Valid — annotate response with locale context headers
    const response = sessionResponse ?? NextResponse.next();
    const localeId = toLocaleId(country, lang);
    response.headers.set("x-country", country);
    response.headers.set("x-language", lang);
    response.headers.set("x-locale-id", localeId);
    response.headers.set("x-text-direction", LANGUAGES[lang].dir);

    const cookieOpts = { maxAge: 60 * 60 * 24 * 365, path: "/", sameSite: "lax" as const };
    response.cookies.set(COUNTRY_COOKIE, country, cookieOpts);
    response.cookies.set(LANGUAGE_COOKIE, lang, cookieOpts);
    response.cookies.set(LOCALE_COOKIE, localeId, cookieOpts);

    return response;
  }

  // ── Case 2: Root path — redirect to detected locale ───────────────────────
  if (pathname === "/") {
    const resolved = resolveLocaleFromRequest(request);
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = `/${resolved.country}/${resolved.language}`;

    const redirect = NextResponse.redirect(redirectUrl);
    const cookieOpts = { maxAge: 60 * 60 * 24 * 365, path: "/", sameSite: "lax" as const };
    redirect.cookies.set(COUNTRY_COOKIE, resolved.country, cookieOpts);
    redirect.cookies.set(LANGUAGE_COOKIE, resolved.language, cookieOpts);
    redirect.cookies.set(LOCALE_COOKIE, resolved.localeId, cookieOpts);

    return redirect;
  }

  // ── Case 3: Storefront paths — redirect to detected locale prefix ────────────
  const STOREFRONT_PREFIXES = [
    "/products", "/categories", "/cart", "/checkout",
    "/orders", "/search", "/wishlist", "/profile", "/pages",
  ];
  const isStorefrontPath = STOREFRONT_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );

  if (isStorefrontPath) {
    const resolved = resolveLocaleFromRequest(request);
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = `/${resolved.country}/${resolved.language}${pathname}`;

    const redirect = NextResponse.redirect(redirectUrl);
    const cookieOpts = { maxAge: 60 * 60 * 24 * 365, path: "/", sameSite: "lax" as const };
    redirect.cookies.set(COUNTRY_COOKIE, resolved.country, cookieOpts);
    redirect.cookies.set(LANGUAGE_COOKIE, resolved.language, cookieOpts);
    redirect.cookies.set(LOCALE_COOKIE, resolved.localeId, cookieOpts);
    return redirect;
  }

  return sessionResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
