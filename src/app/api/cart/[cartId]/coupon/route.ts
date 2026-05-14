/**
 * POST /api/cart/[cartId]/coupon
 * Apply a coupon to the cart.
 *
 * DELETE /api/cart/[cartId]/coupon
 * Remove the applied coupon from the cart.
 *
 * Rate limited: 10 req/min per IP to prevent coupon enumeration via cart.
 */

import { z } from "zod";

import { applyCoupon, removeCoupon } from "@/domain/cart/cart-service";
import { apiSuccess, withApiHandler } from "@/lib/api";
import { resolveCartIdentity } from "@/lib/cart/resolve-identity";
import { withRateLimit } from "@/lib/rate-limit";

type RouteParams = { params: Promise<{ cartId: string }> };

const applySchema = z.object({
  coupon_code: z.string().min(1).max(30),
});

export const POST = withRateLimit(
  withApiHandler(async (request: Request, { params }: RouteParams) => {
    const { cartId } = await params;
    const ctx = await resolveCartIdentity(request);
    const body = applySchema.parse(await request.json());

    const cart = await applyCoupon(cartId, ctx, { coupon_code: body.coupon_code });
    return apiSuccess(cart);
  }),
  { limit: 10, windowMs: 60_000, routeKey: "cart:coupon" },
);

export const DELETE = withApiHandler(
  async (request: Request, { params }: RouteParams) => {
    const { cartId } = await params;
    const ctx = await resolveCartIdentity(request);
    const cart = await removeCoupon(cartId, ctx);
    return apiSuccess(cart);
  },
);
