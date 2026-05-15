import { z } from "zod";

import { apiSuccess, withApiHandler } from "@/lib/api";
import { PERMISSIONS } from "@/lib/admin/permissions";
import { logAdminAction, requireAdminPermission } from "@/lib/admin/with-admin-permission";
import { NotFoundError, OrderStateError } from "@/lib/errors";

const schema = z.object({
  status: z.enum([
    "draft",
    "pending",
    "pending_payment",
    "confirmed",
    "processing",
    "packed",
    "shipped",
    "out_for_delivery",
    "delivered",
    "cancelled",
    "failed",
    "return_requested",
    "return_approved",
    "return_rejected",
    "return_in_transit",
    "returned",
    "replacement_requested",
    "replacement_approved",
    "replacement_rejected",
    "replacement_shipped",
    "replacement_delivered",
    "refund_requested",
    "refund_processing",
    "partially_returned",
    "partially_refunded",
    "refunded",
  ]),
  reason: z.string().max(500).optional(),
});

export const PATCH = withApiHandler(
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    const ctx = await requireAdminPermission(PERMISSIONS.ORDERS_MANAGE);
    const { user, db } = ctx;

    const { id } = await context.params;
    const { status, reason } = schema.parse(await request.json());

    const { error } = await db.rpc("update_order_status", {
      p_order_id:   id,
      p_new_status: status,
      p_changed_by: user.id,
      p_reason:     reason ?? undefined,
    });

    if (error) {
      const msg = error.message ?? "";
      if (error.code === "P0006" || msg.includes("Invalid status transition")) {
        throw new OrderStateError(msg || `Invalid status transition to '${status}'`);
      }
      if (error.code === "P0005" || msg.includes("not found")) {
        throw new NotFoundError("Order not found");
      }
      throw new Error(msg || "Failed to update order status");
    }

    await logAdminAction(ctx, request, {
      action: "update_order_status",
      entityType: "order",
      entityId: id,
      metadata: { status, reason },
    });

    return apiSuccess({ success: true });
  },
);
