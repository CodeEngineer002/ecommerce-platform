import { z } from "zod";

import { apiError, apiSuccess, withApiHandler } from "@/lib/api";
import { PERMISSIONS } from "@/lib/admin/permissions";
import { logAdminAction, requireAdminPermission } from "@/lib/admin/with-admin-permission";
import { NotFoundError, OrderStateError } from "@/lib/errors";

const schema = z.object({
  note: z.string().max(500).optional(),
});

/**
 * POST /api/admin/orders/[id]/rto-in-transit
 *
 * Marks a refused order as in return-to-origin transit. Transitions
 * delivery_refused → return_to_origin. Use this when the carrier confirms
 * the RTO scan / pickup. Inventory is NOT yet released — that happens on
 * complete-rto.
 */
export const POST = withApiHandler(
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    const ctx = await requireAdminPermission(PERMISSIONS.ORDERS_MANAGE);
    const { user, db } = ctx;
    const { id: orderId } = await context.params;

    const body: unknown = await request.json().catch(() => ({}));
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return apiError("Invalid request", 400, "VALIDATION_ERROR");
    }
    const { note } = parsed.data;

    const { data: order } = await db
      .from("orders")
      .select("id, order_number, status")
      .eq("id", orderId)
      .maybeSingle();

    if (!order) throw new NotFoundError("Order not found");

    if (order.status !== "delivery_refused") {
      throw new OrderStateError(
        `RTO transit only allowed from delivery_refused, current: '${order.status}'`,
      );
    }

    const { error: rpcError } = await db.rpc("mark_rto_in_transit", {
      p_order_id: orderId,
      p_actor_id: user.id,
      p_note:     note ?? null,
    });

    if (rpcError) {
      const msg = rpcError.message ?? "Failed to mark RTO in transit";
      if (rpcError.code === "P0006") throw new OrderStateError(msg);
      throw new Error(msg);
    }

    await logAdminAction(ctx, request, {
      action:     "rto_in_transit",
      entityType: "order",
      entityId:   orderId,
      metadata:   { order_number: order.order_number, note: note ?? null },
    });

    return apiSuccess({ orderId, status: "return_to_origin" });
  },
);
