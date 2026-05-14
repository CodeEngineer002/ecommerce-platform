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

  // Locale context from middleware
  const country_id = headers.get("x-country") ?? "in";
  const currency_code = "INR"; // TODO: derive from country when multi-currency is ready

  // Try authenticated user first
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    return { user_id: user.id, country_id, currency_code };
  }

  // Guest: read session from cookie header
  const cookieHeader = headers.get("cookie") ?? "";
  const match = cookieHeader.match(new RegExp(`(?:^|; )${GUEST_CART_COOKIE}=([^;]+)`));
  const existing = match ? decodeURIComponent(match[1]) : null;

  if (existing) {
    return { session_id: existing, country_id, currency_code };
  }

  // Generate new guest session token
  const newSessionToken = generateGuestSessionToken();
  return { session_id: newSessionToken, country_id, currency_code, newSessionToken };
}
