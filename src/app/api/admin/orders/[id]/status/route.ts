import { z } from "zod";

import { apiSuccess, withApiHandler } from "@/lib/api";
import { PERMISSIONS } from "@/lib/admin/permissions";
import { logAdminAction, requireAdminPermission } from "@/lib/admin/with-admin-permission";
import {
  sendOrderCancelledEmail,
  sendOrderDeliveredEmail,
  sendOrderOutForDeliveryEmail,
  sendOrderShippedEmail,
} from "@/lib/email";
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

    // ── ARCH-6: Use cancel_order RPC for cancellations (consistent audit trail)
    // cancel_order is atomic — handles inventory release, COD payment cancellation,
    // and writes order_events with proper actor_type, giving a uniform audit trail
    // identical to the customer-cancel path. For non-cancel status changes we still
    // use update_order_status which handles all other lifecycle transitions.
    if (status === "cancelled") {
      const { error: cancelErr } = await db.rpc("cancel_order", {
        p_order_id:   id,
        p_user_id:    user.id,
        p_reason:     reason ?? "Cancelled by admin",
        p_actor_type: "admin",
      });

      if (cancelErr) {
        const msg = cancelErr.message ?? "";
        if (cancelErr.code === "P0006" || msg.includes("cannot be cancelled")) {
          throw new OrderStateError(msg || "Order cannot be cancelled");
        }
        if (cancelErr.code === "P0005" || msg.includes("not found")) {
          throw new NotFoundError("Order not found");
        }
        throw new Error(msg || "Failed to cancel order");
      }
    } else {
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

      // cancel_failed path: COD payment cleanup for failed orders
      // (cancel_order already handles this for cancelled; only needed for failed)
      if (status === "failed") {
        void db.rpc("cancel_cod_payment", {
          p_order_id: id,
          p_actor_id: user.id,
          p_reason:   reason ?? "Order failed before COD collection",
        }).then(({ error: rpcErr }) => {
          if (rpcErr) {
            console.error("[admin/orders/status] cancel_cod_payment (failed) error:", rpcErr.message);
          }
        });
      }
    }

    await logAdminAction(ctx, request, {
      action: status === "cancelled" ? "cancel_order" : "update_order_status",
      entityType: "order",
      entityId: id,
      metadata: { status, reason },
    });

    // ── Fire-and-forget emails for key order lifecycle stages ────────────────
    const EMAIL_STATUSES = ["shipped", "out_for_delivery", "delivered", "cancelled"] as const;
    type EmailStatus = typeof EMAIL_STATUSES[number];

    if ((EMAIL_STATUSES as readonly string[]).includes(status)) {
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

          const s = status as EmailStatus;

          if (s === "shipped" || s === "out_for_delivery") {
            // Fetch latest fulfillment for tracking details
            const { data: fulfillment } = await db
              .from("order_fulfillments")
              .select("tracking_number, tracking_url, carrier, estimated_delivery")
              .eq("order_id", id)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();

            if (s === "shipped") {
              await sendOrderShippedEmail({
                to:                toEmail,
                customerName,
                orderId:           id,
                orderNumber:       order.order_number,
                trackingNumber:    fulfillment?.tracking_number ?? null,
                trackingUrl:       fulfillment?.tracking_url    ?? null,
                carrier:           fulfillment?.carrier          ?? null,
                estimatedDelivery: fulfillment?.estimated_delivery ?? null,
              });
            } else {
              await sendOrderOutForDeliveryEmail({
                to:            toEmail,
                customerName,
                orderId:       id,
                orderNumber:   order.order_number,
                trackingNumber: fulfillment?.tracking_number ?? null,
                trackingUrl:    fulfillment?.tracking_url    ?? null,
                carrier:        fulfillment?.carrier         ?? null,
              });
            }
          } else if (s === "delivered") {
            await sendOrderDeliveredEmail({
              to:           toEmail,
              customerName,
              orderId:      id,
              orderNumber:  order.order_number,
              deliveredAt:  new Date().toISOString(),
            });
          } else {
            await sendOrderCancelledEmail({
              to:          toEmail,
              customerName,
              orderId:     id,
              orderNumber: order.order_number,
              reason:      reason ?? null,
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
