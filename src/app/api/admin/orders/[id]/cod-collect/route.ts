import { z } from "zod";

import { apiError, apiSuccess, withApiHandler } from "@/lib/api";
import { PERMISSIONS } from "@/lib/admin/permissions";
import { logAdminAction, requireAdminPermission } from "@/lib/admin/with-admin-permission";
import { NotFoundError, OrderStateError } from "@/lib/errors";

const schema = z.object({
  amount_collected: z.number().positive("Amount must be positive"),
  notes: z.string().max(500).optional(),
});

/**
 * POST /api/admin/orders/[id]/cod-collect
 *
 * Confirms that COD cash was physically collected at delivery.
 * Only callable by admin/super_admin with ORDERS_MANAGE permission.
 *
 * Rules:
 * - Order must use COD payment provider
 * - Payment must be in cod_pending_collection state
 * - Order must be in out_for_delivery or delivered state
 * - Amount collected must equal order total (no partial COD)
 * - Idempotent: if already succeeded, returns success without error
 *
 * On success:
 * - Sets payment.status = 'succeeded'
 * - Creates payment_event record (audit trail)
 * - Logs admin action
 */
export const POST = withApiHandler(
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    const ctx = await requireAdminPermission(PERMISSIONS.ORDERS_MANAGE);
    const { user, db } = ctx;

    const { id: orderId } = await context.params;

    const body: unknown = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return apiError(
        "Invalid request",
        400,
        "VALIDATION_ERROR",
        parsed.error.flatten().fieldErrors as Record<string, string[]>,
      );
    }
    const { amount_collected, notes } = parsed.data;

    // Fetch order to verify it exists
    const { data: order } = await db
      .from("orders")
      .select("id, order_number, status, total")
      .eq("id", orderId)
      .maybeSingle();

    if (!order) throw new NotFoundError("Order not found");

    // Fetch COD payment record
    const { data: payment } = await db
      .from("payments")
      .select("id, provider, status, amount")
      .eq("order_id", orderId)
      .eq("provider", "cod")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!payment) {
      return apiError("No COD payment record found for this order", 422, "NOT_COD_ORDER");
    }

    // Guard: not a COD order
    if (payment.provider !== "cod") {
      return apiError("Order is not a Cash on Delivery order", 422, "NOT_COD_ORDER");
    }

    // Idempotency: already collected
    if (payment.status === "succeeded") {
      await logAdminAction(ctx, request, {
        action: "cod_collect_idempotent",
        entityType: "order",
        entityId: orderId,
        metadata: { order_number: order.order_number, notes: "Already collected — no-op" },
      });
      return apiSuccess({ orderId, paymentId: payment.id, alreadyCollected: true });
    }

    // Guard: order must be in eligible status
    const eligibleStatuses = ["out_for_delivery", "delivered"];
    if (!eligibleStatuses.includes(order.status)) {
      throw new OrderStateError(
        `COD collection not allowed for order in status '${order.status}'. Order must be out_for_delivery or delivered.`,
      );
    }

    // Guard: amount must match (no partial COD)
    const expectedAmount = Number(order.total);
    const collectedAmount = Number(amount_collected);
    if (Math.abs(collectedAmount - expectedAmount) > 0.01) {
      return apiError(
        `Amount mismatch: expected ${expectedAmount.toFixed(2)}, got ${collectedAmount.toFixed(2)}. Partial COD collection is not supported.`,
        422,
        "AMOUNT_MISMATCH",
      );
    }

    // Call DB function — atomic + creates payment_event
    const { error: rpcError } = await db.rpc("confirm_cod_cash_collected", {
      p_order_id:   orderId,
      p_amount:     collectedAmount,
      p_actor_id:   user.id,
      p_actor_role: "admin",
      p_notes:      notes ?? null,
    });

    if (rpcError) {
      const msg = rpcError.message ?? "";
      if (msg.includes("Amount mismatch") || rpcError.code === "P0014") {
        return apiError(msg, 422, "AMOUNT_MISMATCH");
      }
      if (msg.includes("not in a deliverable") || rpcError.code === "P0013") {
        throw new OrderStateError(msg);
      }
      throw new Error(msg || "Failed to confirm COD cash collection");
    }

    // Log admin action for backoffice audit trail
    await logAdminAction(ctx, request, {
      action: "cod_cash_collected",
      entityType: "order",
      entityId: orderId,
      metadata: {
        order_number:     order.order_number,
        amount_collected: collectedAmount,
        notes:            notes ?? null,
      },
    });

    return apiSuccess({
      orderId,
      paymentId:        payment.id,
      amountCollected:  collectedAmount,
      collectedAt:      new Date().toISOString(),
      collectedBy:      user.id,
    });
  },
);
