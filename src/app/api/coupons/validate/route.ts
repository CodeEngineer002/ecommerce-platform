import { z } from "zod";

import { CouponError, validateCoupon } from "@/domain/coupon/coupon-engine";
import { calculateDiscount } from "@/domain/pricing/pricing-engine";
import { apiSuccess, withApiHandler } from "@/lib/api";
import { AuthError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  couponCode: z.string().min(1).max(30),
  subtotal: z.number().positive(),
});

/**
 * Validates a coupon without consuming it.
 * Returns the discount amount so the checkout UI can preview the savings.
 * The actual coupon is consumed atomically inside create_order_atomic.
 */
export const POST = withApiHandler(async (request: Request) => {
  const userClient = await createClient();
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) throw new AuthError();

  const { couponCode, subtotal } = schema.parse(await request.json());

  const coupon = await validateCoupon(couponCode, subtotal, user.id);
  const discount = calculateDiscount(subtotal, coupon);

  return apiSuccess({
    valid: true,
    coupon: { code: coupon.code, type: coupon.type, value: coupon.value },
    discount,
  });
});
