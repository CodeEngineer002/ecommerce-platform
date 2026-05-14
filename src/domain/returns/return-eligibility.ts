import "server-only";

import { ReturnNotEligibleError } from "@/lib/errors";
import { createServiceClient } from "@/lib/supabase/server";

export const RETURN_WINDOW_DAYS = 30;

export interface ReturnEligibilityResult {
  eligible: boolean;
  reason?: string;
  windowExpiresAt: Date | null;
  orderDeliveredAt: Date | null;
}

/**
 * Checks whether an order is within its return window and eligible for return.
 *
 * Rules:
 * - Order must belong to the requesting user
 * - Order must be in 'delivered' or 'partially_returned' status
 * - Delivery must be within the return window
 */
export async function checkReturnEligibility(
  orderId: string,
  userId: string,
): Promise<ReturnEligibilityResult> {
  const db = createServiceClient();

  const { data: order } = await db
    .from("orders")
    .select("id, user_id, status, updated_at")
    .eq("id", orderId)
    .single();

  if (!order) {
    return { eligible: false, reason: "Order not found", windowExpiresAt: null, orderDeliveredAt: null };
  }

  if (order.user_id !== userId) {
    return { eligible: false, reason: "Access denied", windowExpiresAt: null, orderDeliveredAt: null };
  }

  const eligibleStatuses = ["delivered", "partially_returned"];
  if (!eligibleStatuses.includes(order.status)) {
    return {
      eligible: false,
      reason: `Order must be delivered before it can be returned (current status: ${order.status})`,
      windowExpiresAt: null,
      orderDeliveredAt: null,
    };
  }

  // Find the delivered transition in status history for the exact delivery timestamp
  const { data: deliveredEntry } = await db
    .from("order_status_history")
    .select("created_at")
    .eq("order_id", orderId)
    .eq("to_status", "delivered")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const deliveredAt = deliveredEntry
    ? new Date(deliveredEntry.created_at)
    : new Date(order.updated_at);

  const windowExpiresAt = new Date(deliveredAt);
  windowExpiresAt.setDate(windowExpiresAt.getDate() + RETURN_WINDOW_DAYS);

  const now = new Date();
  if (now > windowExpiresAt) {
    return {
      eligible: false,
      reason: `Return window of ${RETURN_WINDOW_DAYS} days has expired`,
      windowExpiresAt,
      orderDeliveredAt: deliveredAt,
    };
  }

  return { eligible: true, windowExpiresAt, orderDeliveredAt: deliveredAt };
}

/**
 * Throws ReturnNotEligibleError if the order cannot be returned.
 * Convenience wrapper for routes/services that want to assert eligibility.
 */
export async function assertReturnEligible(orderId: string, userId: string): Promise<void> {
  const result = await checkReturnEligibility(orderId, userId);
  if (!result.eligible) {
    throw new ReturnNotEligibleError(result.reason ?? "Order is not eligible for return");
  }
}
