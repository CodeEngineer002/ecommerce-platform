import { z } from "zod";

import { isOrderCancellable } from "@/domain/order/order-state-machine";
import { sendOrderCancelledEmail } from "@/lib/email";
import { apiError, apiSuccess, withApiHandler } from "@/lib/api";
import { AuthError, NotFoundError, OrderStateError, UnauthorizedOrderAccessError } from "@/lib/errors";
import { withRateLimit } from "@/lib/rate-limit";
import { createClient, createServiceClient } from "@/lib/supabase/server";

const schema = z.object({
  reason: z.string().max(500).optional(),
});

/**
 * DELETE /api/orders/[id]
 * Customer-facing cancel endpoint. Validates ownership + cancellable state,
 * calls cancel_order RPC, then fires a cancellation email (fire-and-forget).
 * Rate limited: 5 cancellations per minute per IP (P2-9).
 */
export const DELETE = withRateLimit(
  withApiHandler(
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    const userClient = await createClient();
    const {
      data: { user },
    } = await userClient.auth.getUser();
    if (!user) throw new AuthError();

    const { id: orderId } = await context.params;

    // Parse optional reason from request body (graceful fallback for empty body)
    const body: unknown = await request.json().catch(() => ({}));
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return apiError("Invalid request body", 400, "VALIDATION_ERROR");
    }
    const { reason } = parsed.data;

    const db = createServiceClient();

    const { data: order } = await db
      .from("orders")
      .select("id, status, user_id, order_number")
      .eq("id", orderId)
      .single();

    if (!order) throw new NotFoundError("Order not found");
    if (order.user_id !== user.id) throw new UnauthorizedOrderAccessError();

    if (!isOrderCancellable(order.status as Parameters<typeof isOrderCancellable>[0])) {
      throw new OrderStateError(
        `Order cannot be cancelled in its current status: ${order.status}`,
      );
    }

    const { error: rpcError } = await db.rpc("cancel_order", {
      p_order_id:   orderId,
      p_user_id:    user.id,
      p_reason:     reason ?? null,
      p_actor_type: "customer",
    });

    if (rpcError) {
      const msg = rpcError.message ?? "";
      if (rpcError.code === "P0006" || msg.includes("cannot be cancelled")) {
        throw new OrderStateError(msg || "Order cannot be cancelled");
      }
      throw new Error(msg || "Failed to cancel order");
    }

    // BUG-3 fix: cancel COD payment when customer cancels.
    // cancel_cod_payment is idempotent and a no-op for non-COD orders
    // (it only acts when provider = 'cod' exists for the order), so it is
    // safe to call unconditionally without fetching the payment provider first.
    void db.rpc("cancel_cod_payment", {
      p_order_id: orderId,
      p_actor_id: user.id,
      p_reason:   reason ?? "Order cancelled by customer",
    }).then(({ error: codErr }) => {
      if (codErr) {
        console.error("[orders/cancel] cancel_cod_payment failed:", codErr.message);
      }
    });

    // Fire cancellation email — fetch customer profile for email + name
    const { data: profile } = await db
      .from("profiles")
      .select("email, full_name")
      .eq("id", user.id)
      .maybeSingle();

    const customerEmail = profile?.email ?? user.email;
    const customerName  = profile?.full_name ?? "Valued Customer";

    if (customerEmail) {
      void sendOrderCancelledEmail({
        to:          customerEmail,
        customerName,
        orderId,
        orderNumber: order.order_number,
        reason:      reason ?? null,
        currencyCode: "INR",
      });
    }

    return apiSuccess({ success: true });
  }),
  { limit: 5, windowMs: 60_000, routeKey: "orders:cancel" },
);
