import { type NextRequest, NextResponse } from "next/server";

import { buildCspWithNonce, generateNonce } from "@/lib/csp";
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
import { generateCorrelationId } from "@/lib/logger";
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

  // ── Correlation ID ────────────────────────────────────────────────────────
  const correlationId =
    request.headers.get("x-correlation-id") ?? generateCorrelationId();

  // ── Per-request nonce (for CSP) ───────────────────────────────────────────
  // Forward nonce to RSC via request headers so layout can read it via headers()
  const nonce = generateNonce();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("x-correlation-id", correlationId);

  // ── Session refresh (Supabase auth) ───────────────────────────────────────
  // updateSession refreshes the auth token and sets updated cookies on its response.
  // We create our own NextResponse.next() so that our custom request headers
  // (x-nonce, x-correlation-id) are forwarded to Server Components via headers().
  // Then we copy the auth cookies from sessionResponse to preserve the session.
  const sessionResponse = await updateSession(request);

  function buildPageResponse(): NextResponse {
    const res = NextResponse.next({ request: { headers: requestHeaders } });
    // Copy auth cookies from the Supabase session refresh
    sessionResponse?.cookies.getAll().forEach((c) => res.cookies.set(c));
    // Dynamic CSP with per-request nonce (replaces static next.config.ts CSP)
    res.headers.set("Content-Security-Policy", buildCspWithNonce(nonce));
    res.headers.set("x-correlation-id", correlationId);
    return res;
  }

  if (shouldSkipLocale(pathname)) {
    return buildPageResponse();
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

    // Valid — annotate locale context on requestHeaders FIRST so API routes
    // (which read from request.headers, not response.headers) receive the
    // correct country when the client calls /api/cart, /api/orders, etc.
    const localeId = toLocaleId(country, lang);
    requestHeaders.set("x-country", country);
    requestHeaders.set("x-language", lang);
    requestHeaders.set("x-locale-id", localeId);
    requestHeaders.set("x-text-direction", LANGUAGES[lang].dir);

    // buildPageResponse() passes requestHeaders into NextResponse.next() so
    // RSC / Server Components and API routes all see the locale headers.
    const response = buildPageResponse();
    // Also expose on the response so client code / browser can read them.
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

  return buildPageResponse();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
