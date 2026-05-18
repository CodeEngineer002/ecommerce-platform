import { z } from "zod";

import { apiError, apiSuccess, withApiHandler } from "@/lib/api";
import { PERMISSIONS } from "@/lib/admin/permissions";
import { logAdminAction, requireAdminPermission } from "@/lib/admin/with-admin-permission";
import { NotFoundError, OrderStateError } from "@/lib/errors";

const schema = z.object({
  /**
   * approve        — approve as-is (replacement creates replacement order; return starts return flow)
   * approve_forced — replacement only; override OOS block and create replacement order anyway
   * reject         — reject the request (note required)
   */
  action:       z.enum(["approve", "approve_forced", "reject"]),
  note:         z.string().max(500).optional(),
});

// PATCH /api/admin/returns/[id]  — approve or reject a return request
export const PATCH = withApiHandler(
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    const ctx = await requireAdminPermission(PERMISSIONS.ORDERS_MANAGE);
    const { user, db } = ctx;

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

    if (action === "approve" || action === "approve_forced") {
      const forceCreate = action === "approve_forced";

      const { error } = await db.rpc("approve_return", {
        p_return_id:    returnId,
        p_admin_id:     user.id,
        p_note:         note ?? undefined,
        p_force_create: forceCreate,
      });

      if (error) {
        const msg = error.message ?? "";
        if (error.code === "P0005" || msg.includes("not found")) {
          throw new NotFoundError("Return request not found");
        }
        if (error.code === "P0006" || msg.includes("not in requested state")) {
          throw new OrderStateError(msg || "Return cannot be approved in its current state");
        }
        // P0012 = out of stock; surface a clean message to the UI
        if (error.code === "P0012" || msg.toLowerCase().includes("out of stock")) {
          return apiError(
            msg || "One or more replacement items are out of stock",
            409,
            "REPLACEMENT_OOS",
          );
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

    await logAdminAction(ctx, request, {
      action: action === "reject" ? "reject_return" : "approve_return",
      entityType: "return",
      entityId: returnId,
      metadata: { note, forced: action === "approve_forced" },
    });

    return apiSuccess({ success: true });
  },
);

// GET /api/admin/returns/[id]  — get a single return request with items
export const GET = withApiHandler(
  async (_request: Request, context: { params: Promise<{ id: string }> }) => {
    const { db } = await requireAdminPermission(PERMISSIONS.ORDERS_READ);

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
