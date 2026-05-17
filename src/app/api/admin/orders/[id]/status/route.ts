import { z } from "zod";

import { apiSuccess, withApiHandler } from "@/lib/api";
import { PERMISSIONS } from "@/lib/admin/permissions";
import { logAdminAction, requireAdminPermission } from "@/lib/admin/with-admin-permission";
import { sendOrderCancelledEmail, sendOrderShippedEmail } from "@/lib/email";
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
      p_source:     "admin_override",
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

    // ── COD: cancel payment when order cancelled/failed before delivery ───────
    // If the order is cancelled or failed and payment method is COD, the payment
    // should be set to 'cancelled' — no cash was collected, no refund needed.
    if (status === "cancelled" || status === "failed") {
      void db.rpc("cancel_cod_payment", {
        p_order_id: id,
        p_actor_id: user.id,
        p_reason:   reason ?? `Order ${status} before COD collection`,
      }).then(({ error: rpcErr }) => {
        if (rpcErr) {
          console.error("[admin/orders/status] cancel_cod_payment failed:", rpcErr.message);
        }
      });
    }

    // ── Fire-and-forget emails for shipped / cancelled ────────────────────────
    if (status === "shipped" || status === "cancelled") {
      void (async () => {
        try {
          const { data: order } = await db
            .from("orders")
            .select("order_number, user_id, total")
            .eq("id", id)
            .single();

          if (!order?.user_id) return;

          const { data: profile } = await db
            .from("profiles")
            .select("full_name, email")
            .eq("id", order.user_id)
            .maybeSingle();

          const toEmail = profile?.email ?? "";
          if (!toEmail) return;
          const customerName = profile?.full_name ?? toEmail;

          if (status === "shipped") {
            // Fetch the latest fulfillment to get tracking details
            const { data: fulfillment } = await db
              .from("order_fulfillments")
              .select("tracking_number, tracking_url, carrier, estimated_delivery")
              .eq("order_id", id)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();

            await sendOrderShippedEmail({
              to: toEmail,
              customerName,
              orderId: id,
              orderNumber: order.order_number,
              trackingNumber:    fulfillment?.tracking_number ?? null,
              trackingUrl:       fulfillment?.tracking_url ?? null,
              carrier:           fulfillment?.carrier ?? null,
              estimatedDelivery: fulfillment?.estimated_delivery ?? null,
            });
          } else {
            await sendOrderCancelledEmail({
              to: toEmail,
              customerName,
              orderId: id,
              orderNumber: order.order_number,
              reason: reason ?? null,
            });
          }
        } catch (emailErr) {
          console.error("[admin/orders/status] email failed:", emailErr);
        }
      })();
    }

    return apiSuccess({ success: true });
  },
);
