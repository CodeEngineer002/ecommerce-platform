import "server-only";

import { createServiceClient } from "@/lib/supabase/server";

export interface ReviewEligibilityResult {
  eligible: boolean;
  reason?: string;
  existingReviewId?: string;
}

/**
 * Checks whether a user can review a product.
 *
 * Rules:
 * - User must have a verified purchase (delivered order containing this product)
 * - User has not already reviewed this product
 */
export async function checkReviewEligibility(
  productId: string,
  userId: string,
): Promise<ReviewEligibilityResult> {
  const db = createServiceClient();

  // Check for existing review first (fast path)
  const { data: existing } = await db
    .from("reviews")
    .select("id")
    .eq("product_id", productId)
    .eq("user_id", userId)
    .maybeSingle();

  if (existing) {
    return {
      eligible: false,
      reason: "You have already reviewed this product",
      existingReviewId: existing.id,
    };
  }

  // Verify the user has a delivered order containing this product
  // Joins: orders → order_items → product_variants → products
  const { data: purchase } = await db
    .from("orders")
    .select(
      `
      id,
      items:order_items!inner(
        variant:product_variants!inner(
          product:products!inner(id)
        )
      )
    `,
    )
    .eq("user_id", userId)
    .eq("status", "delivered")
    .eq("items.variant.product.id", productId)
    .limit(1)
    .maybeSingle();

  if (!purchase) {
    return {
      eligible: false,
      reason: "You can only review products you have purchased and received",
    };
  }

  return { eligible: true };
}
