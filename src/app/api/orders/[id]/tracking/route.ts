import { apiSuccess, withApiHandler } from "@/lib/api";
import { AuthError, NotFoundError, UnauthorizedOrderAccessError } from "@/lib/errors";
import { createClient, createServiceClient } from "@/lib/supabase/server";

/**
 * GET /api/orders/[id]/tracking
 * Returns the latest fulfillment tracking info for a customer's order.
 * Auth: session cookie — must be the order owner.
 */
export const GET = withApiHandler(
  async (_request: Request, context: { params: Promise<{ id: string }> }) => {
    const userClient = await createClient();
    const {
      data: { user },
    } = await userClient.auth.getUser();
    if (!user) throw new AuthError();

    const { id: orderId } = await context.params;

    const db = createServiceClient();

    // Verify ownership
    const { data: order } = await db
      .from("orders")
      .select("id, user_id, order_number, status")
      .eq("id", orderId)
      .single();

    if (!order) throw new NotFoundError("Order not found");
    if (order.user_id !== user.id) throw new UnauthorizedOrderAccessError();

    // Fetch most-recent fulfillment
    const { data: fulfillment } = await db
      .from("order_fulfillments")
      .select(
        "id, carrier, tracking_number, tracking_url, estimated_delivery, status, shipped_at, delivered_at",
      )
      .eq("order_id", orderId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return apiSuccess({
      order_number:  order.order_number,
      order_status:  order.status,
      tracking:      fulfillment ?? null,
    });
  },
);
