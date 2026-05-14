/**
 * PATCH /api/cart/[cartId]/items/[variantId]
 * Update the quantity of a cart item.
 * Setting quantity to 0 removes the item.
 *
 * DELETE /api/cart/[cartId]/items/[variantId]
 * Remove a specific item from the cart.
 */

import { z } from "zod";

import { removeCartItem, updateCartItemQuantity } from "@/domain/cart/cart-service";
import { apiSuccess, withApiHandler } from "@/lib/api";
import { resolveCartIdentity } from "@/lib/cart/resolve-identity";

type RouteParams = { params: Promise<{ cartId: string; variantId: string }> };

const updateSchema = z.object({
  quantity: z.number().int().min(0).max(10),
});

export const PATCH = withApiHandler(
  async (request: Request, { params }: RouteParams) => {
    const { cartId, variantId } = await params;
    const ctx = await resolveCartIdentity(request);
    const { quantity } = updateSchema.parse(await request.json());

    const cart = await updateCartItemQuantity(cartId, variantId, ctx, quantity);
    return apiSuccess(cart);
  },
);

export const DELETE = withApiHandler(
  async (request: Request, { params }: RouteParams) => {
    const { cartId, variantId } = await params;
    const ctx = await resolveCartIdentity(request);

    const cart = await removeCartItem(cartId, variantId, ctx);
    return apiSuccess(cart);
  },
);
