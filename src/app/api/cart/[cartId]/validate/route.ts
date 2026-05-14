/**
 * GET /api/cart/[cartId]/validate
 * Validate cart readiness for checkout.
 *
 * Returns the current CartSummary with all warnings.
 * Does NOT mutate the cart.
 * Throws if cart is empty, expired, or not active.
 *
 * Client should call this before showing the checkout button.
 */

import { validateCartForCheckout } from "@/domain/cart/cart-service";
import { apiSuccess, withApiHandler } from "@/lib/api";
import { resolveCartIdentity } from "@/lib/cart/resolve-identity";

type RouteParams = { params: Promise<{ cartId: string }> };

export const GET = withApiHandler(
  async (request: Request, { params }: RouteParams) => {
    const { cartId } = await params;
    const ctx = await resolveCartIdentity(request);
    const cart = await validateCartForCheckout(cartId, ctx);
    return apiSuccess(cart);
  },
);
