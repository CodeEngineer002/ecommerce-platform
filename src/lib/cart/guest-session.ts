/**
 * Guest cart session token utilities.
 *
 * The session token is stored in an httpOnly, SameSite=Lax cookie.
 * This prevents:
 *   - XSS attacks from reading the token (httpOnly)
 *   - CSRF attacks (SameSite=Lax)
 *   - Cart enumeration (tokens are UUID-derived, not sequential)
 *
 * The token is generated server-side (in API routes) and never
 * accepted from client-supplied request bodies or query params.
 */

import "server-only";

import { cookies } from "next/headers";

export const GUEST_CART_COOKIE = "guest_cart_session";

const COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // 30 days

/**
 * Generates a cryptographically secure guest session token.
 * Format: two UUID4s concatenated (stripped of hyphens) = 256-bit token.
 */
export function generateGuestSessionToken(): string {
  // Use two UUIDs for ~256 bits of entropy
  const a = crypto.randomUUID().replace(/-/g, "");
  const b = crypto.randomUUID().replace(/-/g, "");
  return `${a}${b}`;
}

/**
 * Reads the guest cart session token from the request cookie.
 * Returns null if no valid cookie is present.
 */
export async function getGuestSessionToken(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(GUEST_CART_COOKIE)?.value ?? null;
}

/**
 * Writes the guest session token cookie.
 * Call this in API route responses after creating a guest cart.
 */
export function buildGuestSessionCookieOptions() {
  return {
    name: GUEST_CART_COOKIE,
    options: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax" as const,
      maxAge: COOKIE_MAX_AGE,
      path: "/",
    },
  };
}
