import { z } from "zod";

import { apiError, apiSuccess, withApiHandler } from "@/lib/api";
import { AuthError, NotFoundError, ReturnNotEligibleError, UnauthorizedOrderAccessError } from "@/lib/errors";
import { createClient, createServiceClient } from "@/lib/supabase/server";

const returnItemSchema = z.object({
  order_item_id: z.string().uuid(),
  quantity:      z.number().int().min(1),
  reason:        z.string().max(200).optional(),
  condition:     z.enum(["unopened", "good", "damaged", "defective"]).optional(),
});

const createReturnSchema = z.object({
  reason: z.string().min(5).max(500),
  items:  z.array(returnItemSchema).min(1).max(20),
});

// GET /api/orders/[id]/returns  — list return requests for this order
export const GET = withApiHandler(
  async (_request: Request, context: { params: Promise<{ id: string }> }) => {
    const userClient = await createClient();
    const {
      data: { user },
    } = await userClient.auth.getUser();
    if (!user) throw new AuthError();

    const { id: orderId } = await context.params;

    const db = createServiceClient();

    const { data: order } = await db
      .from("orders")
      .select("id, user_id")
      .eq("id", orderId)
      .single();

    if (!order) throw new NotFoundError("Order not found");
    if (order.user_id !== user.id) throw new UnauthorizedOrderAccessError();

    const { data: returns, error } = await db
      .from("order_returns")
      .select("*, items:order_return_items(*)")
      .eq("order_id", orderId)
      .order("created_at", { ascending: false });

    if (error) throw new Error("Failed to fetch return requests");

    return apiSuccess(returns ?? []);
  },
);

// POST /api/orders/[id]/returns — create a return request
export const POST = withApiHandler(
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    const userClient = await createClient();
    const {
      data: { user },
    } = await userClient.auth.getUser();
    if (!user) throw new AuthError();

    const { id: orderId } = await context.params;

    const body: unknown = await request.json();
    const parsed = createReturnSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(
        "Invalid request",
        400,
        "VALIDATION_ERROR",
        parsed.error.flatten().fieldErrors as Record<string, string[]>,
      );
    }
    const { reason, items } = parsed.data;

    const db = createServiceClient();

    const { data: order } = await db
      .from("orders")
      .select("id, user_id, status")
      .eq("id", orderId)
      .single();

    if (!order) throw new NotFoundError("Order not found");
    if (order.user_id !== user.id) throw new UnauthorizedOrderAccessError();

    if (!["delivered", "partially_returned"].includes(order.status)) {
      throw new ReturnNotEligibleError(
        `Order must be delivered to request a return (current: ${order.status})`,
      );
    }

    const { data: returnId, error } = await db.rpc("request_return", {
      p_order_id: orderId,
      p_user_id:  user.id,
      p_reason:   reason,
      p_items:    items as unknown as string, // jsonb — Supabase client serialises array to JSON automatically
    });

    if (error) {
      const msg = error.message ?? "";
      if (error.code === "P0008" || msg.includes("must be delivered")) {
        throw new ReturnNotEligibleError(msg || "Order is not eligible for return");
      }
      if (error.code === "P0009" || msg.includes("Return window")) {
        throw new ReturnNotEligibleError(msg || "Return window has expired");
      }
      throw new Error(msg || "Failed to create return request");
    }

    return apiSuccess({ returnId }, 201);
  },
);
