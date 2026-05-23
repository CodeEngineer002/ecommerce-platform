import { z } from "zod";

import { apiError, apiSuccess, withApiHandler } from "@/lib/api";
import { idempotencyCheck, idempotencyStore } from "@/lib/api/idempotency";
import { PERMISSIONS } from "@/lib/admin/permissions";
import { logAdminAction, requireAdminPermission } from "@/lib/admin/with-admin-permission";
import { NotFoundError, OrderStateError } from "@/lib/errors";

const schema = z.object({
  notes: z.string().max(500).optional(),
});

/**
 * POST /api/admin/orders/[id]/complete-rto
 *
 * Closes out the refusal lifecycle. Allowed from delivery_refused or
 * return_to_origin. Transitions order → cancelled (auto-releasing inventory
 * via update_order_status) and cancels the pending COD payment.
 *
 * Since the order never delivered, commit_inventory_for_order never ran —
 * no restock movement is needed.
 */
export const POST = withApiHandler(
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    const ctx = await requireAdminPermission(PERMISSIONS.ORDERS_MANAGE);
    const { user, db } = ctx;
    const { id: orderId } = await context.params;

    // Phase 3.2 — idempotency: this cancels the order + the COD payment.
    // Replaying is safe at the RPC layer but we cache the response so retries
    // see the same payload.
    const idempKey = request.headers.get("Idempotency-Key");
    const cached   = await idempotencyCheck(db, "complete-rto", idempKey);
    if (cached) return apiSuccess(cached);

    const body: unknown = await request.json().catch(() => ({}));
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return apiError("Invalid request", 400, "VALIDATION_ERROR");
    }
    const { notes } = parsed.data;

    const { data: order } = await db
      .from("orders")
      .select("id, order_number, status")
      .eq("id", orderId)
      .maybeSingle();

    if (!order) throw new NotFoundError("Order not found");

    if (!["delivery_refused", "return_to_origin"].includes(order.status)) {
      throw new OrderStateError(
        `RTO completion only allowed from delivery_refused or return_to_origin, current: '${order.status}'`,
      );
    }

    const { error: rpcError } = await db.rpc("complete_rto", {
      p_order_id: orderId,
      p_actor_id: user.id,
      p_notes:    notes ?? null,
    });

    if (rpcError) {
      const msg = rpcError.message ?? "Failed to complete RTO";
      if (rpcError.code === "P0006") throw new OrderStateError(msg);
      throw new Error(msg);
    }

    await logAdminAction(ctx, request, {
      action:     "rto_completed",
      entityType: "order",
      entityId:   orderId,
      metadata:   { order_number: order.order_number, notes: notes ?? null },
    });

    const result = { orderId, status: "cancelled" };
    await idempotencyStore(db, "complete-rto", idempKey, result);
    return apiSuccess(result);
  },
);
