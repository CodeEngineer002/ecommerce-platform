/**
 * DELETE /api/cart/[cartId]/clear
 * Remove all items from the cart and clear the applied coupon.
 */

import { clearCart } from "@/domain/cart/cart-service";
import { apiSuccess, withApiHandler } from "@/lib/api";
import { resolveCartIdentity } from "@/lib/cart/resolve-identity";

type RouteParams = { params: Promise<{ cartId: string }> };

export const DELETE = withApiHandler(
  async (request: Request, { params }: RouteParams) => {
    const { cartId } = await params;
    const ctx = await resolveCartIdentity(request);
    const cart = await clearCart(cartId, ctx);
    return apiSuccess(cart);
  },
);
