import { z } from "zod";

import { apiError, apiSuccess, withApiHandler } from "@/lib/api";
import { idempotencyCheck, idempotencyStore } from "@/lib/api/idempotency";
import { PERMISSIONS } from "@/lib/admin/permissions";
import { logAdminAction, requireAdminPermission } from "@/lib/admin/with-admin-permission";
import { sendOrderRefusedEmail } from "@/lib/email";
import { NotFoundError, OrderStateError } from "@/lib/errors";
import { logger } from "@/lib/logger";

const schema = z.object({
  reason: z.string().min(3, "Reason must be at least 3 chars").max(500),
});

/**
 * POST /api/admin/orders/[id]/mark-refused
 *
 * Records that the customer refused the package at the door. Transitions the
 * order from shipped|out_for_delivery → delivery_refused and writes a
 * refusal event with the reason. Does NOT cancel — admin then runs the RTO
 * lifecycle (mark-rto-in-transit, complete-rto) to release inventory and
 * close the order.
 */
export const POST = withApiHandler(
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    const ctx = await requireAdminPermission(PERMISSIONS.ORDERS_MANAGE);
    const { user, db } = ctx;
    const { id: orderId } = await context.params;

    // Phase 3.2 — idempotency: critical here because we send an email on
    // success. Without it, a double-click could send 2 emails.
    const idempKey = request.headers.get("Idempotency-Key");
    const cached   = await idempotencyCheck(db, "mark-refused", idempKey);
    if (cached) return apiSuccess(cached);

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
    const { reason } = parsed.data;

    const { data: order } = await db
      .from("orders")
      .select("id, order_number, status, user_id, shipping_address")
      .eq("id", orderId)
      .maybeSingle();

    if (!order) throw new NotFoundError("Order not found");

    if (!["shipped", "out_for_delivery"].includes(order.status)) {
      throw new OrderStateError(
        `Delivery refusal only allowed from shipped or out_for_delivery, current: '${order.status}'`,
      );
    }

    const { error: rpcError } = await db.rpc("mark_delivery_refused", {
      p_order_id: orderId,
      p_actor_id: user.id,
      p_reason:   reason,
    });

    if (rpcError) {
      const msg = rpcError.message ?? "Failed to mark delivery refused";
      if (rpcError.code === "P0006") throw new OrderStateError(msg);
      throw new Error(msg);
    }

    await logAdminAction(ctx, request, {
      action:     "delivery_refused",
      entityType: "order",
      entityId:   orderId,
      metadata:   { order_number: order.order_number, reason },
    });

    // Notify customer (fire-and-forget, failure must not block the API).
    try {
      const { data: profile } = order.user_id
        ? await db
            .from("profiles")
            .select("email, full_name")
            .eq("id", order.user_id)
            .maybeSingle()
        : { data: null };

      const addr = (order.shipping_address ?? {}) as { name?: string };
      const customerName = profile?.full_name ?? addr.name ?? "Customer";

      if (profile?.email) {
        await sendOrderRefusedEmail({
          to:           profile.email,
          customerName,
          orderId,
          orderNumber:  order.order_number,
          reason,
        });
      }
    } catch (err) {
      logger.warn("sendOrderRefusedEmail failed", {
        orderId,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    const result = { orderId, status: "delivery_refused", reason };
    await idempotencyStore(db, "mark-refused", idempKey, result);
    return apiSuccess(result);
  },
);
