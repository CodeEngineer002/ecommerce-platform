import { z } from "zod";

import { apiSuccess, withApiHandler } from "@/lib/api";
import { AuthError, ForbiddenError, NotFoundError, OrderStateError } from "@/lib/errors";
import { createClient, createServiceClient } from "@/lib/supabase/server";

const schema = z.object({
  status: z.enum([
    "pending",
    "confirmed",
    "processing",
    "shipped",
    "delivered",
    "cancelled",
    "refunded",
  ]),
  reason: z.string().max(500).optional(),
});

export const PATCH = withApiHandler(async (request: Request, context: { params: Promise<{ id: string }> }) => {
  const userClient = await createClient();
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) throw new AuthError();

  const db = createServiceClient();

  const { data: profile } = await db
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || !["admin", "super_admin"].includes(profile.role)) {
    throw new ForbiddenError();
  }

  const { id } = await context.params;
  const { status, reason } = schema.parse(await request.json());

  const { error } = await db.rpc("update_order_status", {
    p_order_id: id,
    p_new_status: status,
    p_changed_by: user.id,
    p_reason: reason ?? undefined,
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

  return apiSuccess({ success: true });
});
