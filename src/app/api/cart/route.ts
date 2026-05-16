/**
 * GET /api/cart
 * Returns the active cart for the current user or guest session.
 * Creates a cart if one doesn't exist yet.
 *
 * POST /api/cart/items is the add-item endpoint.
 */

import { apiSuccess, withApiHandler } from "@/lib/api";
import { buildGuestSessionCookieOptions } from "@/lib/cart/guest-session";
import { resolveCartIdentity } from "@/lib/cart/resolve-identity";
import { getOrCreateCart } from "@/domain/cart/cart-service";
import { perfMark } from "@/lib/perf";

export const GET = withApiHandler(async (request: Request) => {
  const end = perfMark("GET /api/cart");
  const ctx = await resolveCartIdentity(request);
  const cart = await getOrCreateCart(ctx);
  end();

  const response = apiSuccess(cart);

  // Set guest session cookie if a new one was generated
  if (ctx.newSessionToken) {
    const { name, options } = buildGuestSessionCookieOptions();
    response.headers.set(
      "Set-Cookie",
      `${name}=${encodeURIComponent(ctx.newSessionToken)}; Max-Age=${options.maxAge}; Path=${options.path}; SameSite=${options.sameSite}${options.httpOnly ? "; HttpOnly" : ""}${options.secure ? "; Secure" : ""}`,
    );
  }

  return response;
});
