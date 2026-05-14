/**
 * POST /api/cart/merge
 * Merge a guest cart into the authenticated user's cart after login.
 *
 * Called automatically after successful login from the client.
 * The guest session token is read from the httpOnly cookie — never from the body.
 *
 * Body: {} (empty — all identity is from cookies/session)
 *
 * Returns the merged CartSummary with merge_warnings.
 */

import { mergeGuestCart } from "@/domain/cart/cart-service";
import { apiSuccess, withApiHandler } from "@/lib/api";
import { AuthError } from "@/lib/errors";
import { resolveCartIdentity } from "@/lib/cart/resolve-identity";
import { GUEST_CART_COOKIE } from "@/lib/cart/guest-session";
import { createClient } from "@/lib/supabase/server";

export const POST = withApiHandler(async (request: Request) => {
  // Must be authenticated
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new AuthError();

  // Extract guest session from cookie (server-only, never from body)
  const cookieHeader = request.headers.get("cookie") ?? "";
  const match = cookieHeader.match(new RegExp(`(?:^|; )${GUEST_CART_COOKIE}=([^;]+)`));
  const guestSessionId = match ? decodeURIComponent(match[1]) : null;

  if (!guestSessionId) {
    // No guest cart — just return the current user cart
    const ctx = await resolveCartIdentity(request);
    const { getOrCreateCart } = await import("@/domain/cart/cart-service");
    const cart = await getOrCreateCart(ctx);
    return apiSuccess({ ...cart, merge_warnings: [] });
  }

  const ctx = await resolveCartIdentity(request);
  const result = await mergeGuestCart(guestSessionId, user.id, ctx);

  // Clear the guest session cookie now that it's merged
  const response = apiSuccess(result);
  response.headers.set(
    "Set-Cookie",
    `${GUEST_CART_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax; HttpOnly`,
  );
  return response;
});
