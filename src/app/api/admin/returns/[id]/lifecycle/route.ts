import { z } from "zod";

import { apiError, apiSuccess, withApiHandler } from "@/lib/api";
import { PERMISSIONS } from "@/lib/admin/permissions";
import { logAdminAction, requireAdminPermission } from "@/lib/admin/with-admin-permission";

const schema = z.object({
  action: z.enum(["inspected", "accepted", "rejected_after_inspection", "closed"]),
  notes:         z.string().max(1000).optional(),
  refund_amount: z.number().positive().optional(),
});

// PATCH /api/admin/returns/[id]/lifecycle
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

    const { action, notes, refund_amount } = parsed.data;

    let rpcError;

    if (action === "inspected") {
      ({ error: rpcError } = await db.rpc("mark_return_inspected" as never, {
        p_return_id: returnId,
        p_admin_id:  user.id,
        p_notes:     notes ?? null,
      } as never));
    } else if (action === "accepted") {
      ({ error: rpcError } = await db.rpc("mark_return_accepted" as never, {
        p_return_id:    returnId,
        p_admin_id:     user.id,
        p_notes:        notes ?? null,
        p_refund_amount: refund_amount ?? null,
      } as never));
    } else if (action === "rejected_after_inspection") {
      if (!notes) {
        return apiError("Rejection reason (notes) is required", 400, "VALIDATION_ERROR");
      }
      ({ error: rpcError } = await db.rpc("mark_return_rejected_after_inspection" as never, {
        p_return_id: returnId,
        p_admin_id:  user.id,
        p_reason:    notes,
      } as never));
    } else {
      ({ error: rpcError } = await db.rpc("close_return" as never, {
        p_return_id: returnId,
        p_admin_id:  user.id,
        p_notes:     notes ?? null,
      } as never));
    }

    if (rpcError) {
      return apiError(rpcError.message ?? `Failed to mark as ${action}`, 400, "RPC_ERROR");
    }

    await logAdminAction(ctx, request, {
      action: `return_${action}`,
      entityType: "return",
      entityId: returnId,
      metadata: { notes, refund_amount },
    });

    return apiSuccess({ action, returnId });
  },
);
