import { z } from "zod";

import { isOrderCancellable } from "@/domain/order/order-state-machine";
import { apiError, apiSuccess, withApiHandler } from "@/lib/api";
import { AuthError, NotFoundError, OrderStateError, UnauthorizedOrderAccessError } from "@/lib/errors";
import { createClient, createServiceClient } from "@/lib/supabase/server";

const schema = z.object({
  reason: z.string().max(500).optional(),
});

export const POST = withApiHandler(
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    const userClient = await createClient();
    const {
      data: { user },
    } = await userClient.auth.getUser();
    if (!user) throw new AuthError();

    const { id: orderId } = await context.params;

    const body: unknown = await request.json().catch(() => ({}));
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return apiError("Invalid request", 400, "VALIDATION_ERROR");
    }
    const { reason } = parsed.data;

    const db = createServiceClient();

    const { data: order } = await db
      .from("orders")
      .select("id, status, user_id")
      .eq("id", orderId)
      .single();

    if (!order) throw new NotFoundError("Order not found");
    if (order.user_id !== user.id) throw new UnauthorizedOrderAccessError();

    if (!isOrderCancellable(order.status as Parameters<typeof isOrderCancellable>[0])) {
      throw new OrderStateError(
        `Order cannot be cancelled in its current status: ${order.status}`,
      );
    }

    const { error } = await db.rpc("cancel_order", {
      p_order_id:   orderId,
      p_user_id:    user.id,
      p_reason:     reason ?? null,
      p_actor_type: "customer",
    });

    if (error) {
      const msg = error.message ?? "";
      if (error.code === "P0006" || msg.includes("cannot be cancelled")) {
        throw new OrderStateError(msg || "Order cannot be cancelled");
      }
      throw new Error(msg || "Failed to cancel order");
    }

    return apiSuccess({ success: true });
  },
);
