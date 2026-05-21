import { z } from "zod";

import { apiError, apiSuccess, withApiHandler } from "@/lib/api";
import {
  AuthError,
  NotFoundError,
  ReturnCancelNotAllowedError,
  UnauthorizedOrderAccessError,
} from "@/lib/errors";
import { withRateLimit } from "@/lib/rate-limit";
import { createClient, createServiceClient } from "@/lib/supabase/server";

const cancelSchema = z.object({
  reason: z.string().max(300).optional(),
});

// DELETE /api/orders/[id]/returns/[requestId]  — customer cancels a return/replacement request
// Only allowed while request is still in 'requested' state.
// Rate limited: 5 cancellations per minute per IP (P2-9)
export const DELETE = withRateLimit(
  withApiHandler(
  async (request: Request, context: { params: Promise<{ id: string; requestId: string }> }) => {
    const userClient = await createClient();
    const {
      data: { user },
    } = await userClient.auth.getUser();
    if (!user) throw new AuthError();

    const { id: orderId, requestId } = await context.params;

    let reason: string | undefined;
    try {
      const body: unknown = await request.json();
      const parsed = cancelSchema.safeParse(body);
      if (parsed.success) reason = parsed.data.reason;
    } catch {
      // body is optional
    }

    const db = createServiceClient();

    // Verify order ownership
    const { data: order } = await db
      .from("orders")
      .select("id, user_id")
      .eq("id", orderId)
      .single();

    if (!order) throw new NotFoundError("Order not found");
    if (order.user_id !== user.id) throw new UnauthorizedOrderAccessError();

    // Verify request ownership and current status before calling RPC
    const { data: returnRequest } = await db
      .from("order_returns")
      .select("id, user_id, status")
      .eq("id", requestId)
      .eq("order_id", orderId)
      .single();

    if (!returnRequest) throw new NotFoundError("Return request not found");
    if (returnRequest.user_id !== user.id) throw new UnauthorizedOrderAccessError();

    if (returnRequest.status !== "requested") {
      throw new ReturnCancelNotAllowedError(
        `Request cannot be cancelled in its current state: ${returnRequest.status}`,
      );
    }

    // Delegate to DB function (also validates & enforces rules at DB level)
    const { error } = await db.rpc("cancel_return", {
      p_return_id: requestId,
      p_user_id:   user.id,
      p_reason:    reason ?? null,
    });

    if (error) {
      const msg = error.message ?? "";
      if (error.code === "P0005" || msg.includes("not found")) {
        throw new NotFoundError("Return request not found");
      }
      if (error.code === "P0007") throw new UnauthorizedOrderAccessError();
      if (error.code === "P0012" || msg.includes("cannot be cancelled")) {
        throw new ReturnCancelNotAllowedError(msg || "Request cannot be cancelled");
      }
      throw new Error(msg || "Failed to cancel return request");
    }

    return apiSuccess({ success: true });
  }),
  { limit: 5, windowMs: 60_000, routeKey: "orders:returns:cancel" },
);

// GET /api/orders/[id]/returns/[requestId]  — fetch a single return/replacement request
export const GET = withApiHandler(
  async (_request: Request, context: { params: Promise<{ id: string; requestId: string }> }) => {
    const userClient = await createClient();
    const {
      data: { user },
    } = await userClient.auth.getUser();
    if (!user) throw new AuthError();

    const { id: orderId, requestId } = await context.params;

    const db = createServiceClient();

    const { data: order } = await db
      .from("orders")
      .select("id, user_id")
      .eq("id", orderId)
      .single();

    if (!order) throw new NotFoundError("Order not found");
    if (order.user_id !== user.id) throw new UnauthorizedOrderAccessError();

    const { data, error } = await db
      .from("order_returns")
      .select("*, items:order_return_items(*)")
      .eq("id", requestId)
      .eq("order_id", orderId)
      .single();

    if (error || !data) throw new NotFoundError("Return request not found");

    return apiSuccess(data);
  },
);
