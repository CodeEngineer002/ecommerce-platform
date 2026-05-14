import "server-only";

import type { CouponData } from "@/domain/pricing/types";
import { AppError } from "@/lib/errors";
import { createServiceClient } from "@/lib/supabase/server";


export class CouponError extends AppError {
  constructor(message: string, code = "COUPON_INVALID") {
    super(message, code, 422);
  }
}

/**
 * Validates a coupon code against live DB state and per-user usage history.
 * Does NOT consume the coupon — consumption happens inside create_order_atomic.
 *
 * Throws CouponError with a human-readable reason on any validation failure.
 */
export async function validateCoupon(
  code: string,
  subtotal: number,
  userId: string,
): Promise<CouponData> {
  const db = createServiceClient();

  const { data: coupon } = await db
    .from("coupons")
    .select(
      "id, code, type, value, min_order_value, max_discount, usage_limit, used_count, valid_from, valid_until, is_active",
    )
    .eq("code", code.toUpperCase())
    .eq("is_active", true)
    .single();

  if (!coupon) throw new CouponError("Coupon not found or inactive");

  const now = new Date();

  if (coupon.valid_from && new Date(coupon.valid_from) > now) {
    throw new CouponError("Coupon is not yet valid");
  }
  if (coupon.valid_until && new Date(coupon.valid_until) < now) {
    throw new CouponError("Coupon has expired");
  }
  if (coupon.usage_limit !== null && coupon.used_count >= coupon.usage_limit) {
    throw new CouponError("Coupon usage limit reached");
  }
  if (coupon.min_order_value !== null && subtotal < coupon.min_order_value) {
    throw new CouponError(
      `Minimum order value of ₹${coupon.min_order_value} required to use this coupon`,
    );
  }

  const { count } = await db
    .from("coupon_usage")
    .select("*", { count: "exact", head: true })
    .eq("coupon_id", coupon.id)
    .eq("user_id", userId);

  if ((count ?? 0) > 0) {
    throw new CouponError("You have already used this coupon");
  }

  return {
    id: coupon.id,
    code: coupon.code,
    type: coupon.type as "percentage" | "fixed",
    value: coupon.value,
    maxDiscount: coupon.max_discount,
    minOrderValue: coupon.min_order_value,
  };
}
