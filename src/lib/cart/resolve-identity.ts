/**
 * Resolve cart identity from a Next.js App Router request.
 *
 * Returns CartIdentity with either:
 *   - user_id (authenticated) — read from Supabase session
 *   - session_id (guest) — read from httpOnly cookie
 *
 * Also handles locale context (country + currency) from middleware headers.
 */

import "server-only";

import { COUNTRY_COOKIE } from "@/lib/i18n/config";
import { REGION_CONFIGS } from "@/lib/i18n/region-config";
import { createClient } from "@/lib/supabase/server";

import {
  GUEST_CART_COOKIE,
  generateGuestSessionToken,
} from "./guest-session";
import type { CartIdentity } from "@/domain/cart/types";

export interface CartContext extends CartIdentity {
  /** True if a new guest session token was generated (must be set as cookie) */
  newSessionToken?: string;
}

export async function resolveCartIdentity(request: Request): Promise<CartContext> {
  const headers = request.headers;

  // Locale context — priority order:
  //   1. x-country header (set by middleware on page requests via requestHeaders)
  //   2. x-country-pref cookie (always sent by the browser; set by middleware on every
  //      page visit and persisted for 1 year) — this is the reliable source for client-side
  //      fetch("/api/...") calls since /api is in LOCALE_SKIP_PREFIXES and middleware
  //      does not inject locale headers for API routes.
  //   3. Fallback to "in"
  const cookieHeader = headers.get("cookie") ?? "";
  const countryCookieMatch = cookieHeader.match(
    new RegExp(`(?:^|; )${COUNTRY_COOKIE}=([^;]+)`)
  );
  const countryCookieValue = countryCookieMatch
    ? decodeURIComponent(countryCookieMatch[1]).toLowerCase()
    : null;

  const country_id = (headers.get("x-country") ?? countryCookieValue ?? "in").toLowerCase();

  // Derive currency from region config so each country uses its own currency.
  const regionConfig = REGION_CONFIGS[country_id as keyof typeof REGION_CONFIGS];
  const currency_code = regionConfig?.currencyCode ?? "INR";

  // Try authenticated user first
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    return { user_id: user.id, country_id, currency_code };
  }

  // Guest: read session from cookie header (cookieHeader already extracted above)
  const match = cookieHeader.match(new RegExp(`(?:^|; )${GUEST_CART_COOKIE}=([^;]+)`));
  const existing = match ? decodeURIComponent(match[1]) : null;

  if (existing) {
    return { session_id: existing, country_id, currency_code };
  }

  // Generate new guest session token
  const newSessionToken = generateGuestSessionToken();
  return { session_id: newSessionToken, country_id, currency_code, newSessionToken };
}
