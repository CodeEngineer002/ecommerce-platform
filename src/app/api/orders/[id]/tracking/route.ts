import { apiSuccess, withApiHandler } from "@/lib/api";
import { AuthError, NotFoundError, UnauthorizedOrderAccessError } from "@/lib/errors";
import { createClient, createServiceClient } from "@/lib/supabase/server";

/**
 * GET /api/orders/[id]/tracking
 *
 * Returns enriched tracking info for a customer's order:
 * - Latest fulfillment details (carrier, tracking number, estimated delivery)
 * - Full tracking event timeline (carrier milestones)
 * - Current order + fulfillment status
 *
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

    // Fetch most-recent fulfillment + its tracking events in parallel
    const { data: fulfillment } = await db
      .from("order_fulfillments")
      .select(
        "id, carrier, tracking_number, tracking_url, estimated_delivery, status, shipped_at, delivered_at",
      )
      .eq("order_id", orderId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Fetch tracking events for this fulfillment (newest first)
    let trackingEvents: Array<{
      id: string;
      carrier_status: string;
      internal_status: string;
      location: string | null;
      description: string | null;
      event_time: string;
      source: string;
    }> = [];

    if (fulfillment?.id) {
      const { data: events } = await db
        .from("tracking_events")
        .select("id, carrier_status, internal_status, location, description, event_time, source")
        .eq("fulfillment_id", fulfillment.id)
        .order("event_time", { ascending: false });

      trackingEvents = events ?? [];
    }

    // If no tracking events, synthesize one from fulfillment status
    // so the customer always sees at least one timeline entry
    if (trackingEvents.length === 0 && fulfillment) {
      trackingEvents = [
        {
          id:              "synthetic",
          carrier_status:  fulfillment.status,
          internal_status: fulfillment.status,
          location:        null,
          description:     statusToDescription(fulfillment.status),
          event_time:      fulfillment.shipped_at ?? new Date().toISOString(),
          source:          "admin",
        },
      ];
    }

    return apiSuccess({
      order_number:   order.order_number,
      order_status:   order.status,
      fulfillment:    fulfillment ?? null,
      tracking_events: trackingEvents,
    });
  },
);

function statusToDescription(status: string): string {
  const map: Record<string, string> = {
    processing:       "Your order is being processed",
    packed:           "Your order has been packed",
    shipped:          "Your order has been shipped",
    out_for_delivery: "Your order is out for delivery",
    delivered:        "Your order has been delivered",
    failed:           "Delivery attempted — please contact support",
  };
  return map[status] ?? "Status updated";
}
