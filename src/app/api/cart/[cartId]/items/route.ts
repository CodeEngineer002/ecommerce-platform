/**
 * POST /api/cart/[cartId]/items
 * Add an item to the cart (or merge if variant already exists).
 *
 * Body: { variant_id: string, quantity: number }
 *
 * Rate limited: 30 req/min per IP (add-to-cart is a common button-spam target).
 */

import { z } from "zod";

import { addCartItem } from "@/domain/cart/cart-service";
import { apiSuccess, withApiHandler } from "@/lib/api";
import { resolveCartIdentity } from "@/lib/cart/resolve-identity";
import { withRateLimit } from "@/lib/rate-limit";

const schema = z.object({
  variant_id: z.string().uuid(),
  quantity: z.number().int().min(1).max(10),
});

export const POST = withRateLimit(
  withApiHandler(async (request: Request, { params }: { params: Promise<{ cartId: string }> }) => {
    const { cartId } = await params;
    const ctx = await resolveCartIdentity(request);
    const body = schema.parse(await request.json());

    const cart = await addCartItem(cartId, ctx, {
      variant_id: body.variant_id,
      quantity: body.quantity,
    });

    return apiSuccess(cart, 201);
  }),
  { limit: 30, windowMs: 60_000, routeKey: "cart:add-item" },
);
