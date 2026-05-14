import { z } from "zod";

import { apiError, apiSuccess, withApiHandler } from "@/lib/api";
import { AuthError, ForbiddenError, NotFoundError, OrderStateError } from "@/lib/errors";
import { createClient, createServiceClient } from "@/lib/supabase/server";

const schema = z.object({
  action: z.enum(["approve", "reject"]),
  note:   z.string().max(500).optional(),
});

// PATCH /api/admin/returns/[id]  — approve or reject a return request
export const PATCH = withApiHandler(
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
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

    const { id: returnId } = await context.params;

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
    const { action, note } = parsed.data;

    if (action === "approve") {
      if (!note && action === "approve") {
        // note is optional for approval
      }
      const { error } = await db.rpc("approve_return", {
        p_return_id: returnId,
        p_admin_id:  user.id,
        p_note:      note ?? null,
      });

      if (error) {
        const msg = error.message ?? "";
        if (error.code === "P0005" || msg.includes("not found")) {
          throw new NotFoundError("Return request not found");
        }
        if (error.code === "P0006" || msg.includes("not in requested state")) {
          throw new OrderStateError(msg || "Return cannot be approved in its current state");
        }
        throw new Error(msg || "Failed to approve return");
      }
    } else {
      if (!note) {
        return apiError("A reason is required when rejecting a return", 400, "VALIDATION_ERROR");
      }
      const { error } = await db.rpc("reject_return", {
        p_return_id: returnId,
        p_admin_id:  user.id,
        p_reason:    note,
      });

      if (error) {
        const msg = error.message ?? "";
        if (error.code === "P0005" || msg.includes("not found")) {
          throw new NotFoundError("Return request not found");
        }
        if (error.code === "P0006" || msg.includes("not in requested state")) {
          throw new OrderStateError(msg || "Return cannot be rejected in its current state");
        }
        throw new Error(msg || "Failed to reject return");
      }
    }

    return apiSuccess({ success: true });
  },
);

// GET /api/admin/returns/[id]  — get a single return request with items
export const GET = withApiHandler(
  async (_request: Request, context: { params: Promise<{ id: string }> }) => {
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

    const { id: returnId } = await context.params;

    const { data, error } = await db
      .from("order_returns")
      .select("*, items:order_return_items(*)")
      .eq("id", returnId)
      .single();

    if (error || !data) throw new NotFoundError("Return request not found");

    return apiSuccess(data);
  },
);
