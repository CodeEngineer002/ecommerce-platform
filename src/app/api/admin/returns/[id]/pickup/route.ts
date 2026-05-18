import { z } from "zod";

import { apiError, apiSuccess, withApiHandler } from "@/lib/api";
import { PERMISSIONS } from "@/lib/admin/permissions";
import { logAdminAction, requireAdminPermission } from "@/lib/admin/with-admin-permission";
import { NotFoundError, OrderStateError } from "@/lib/errors";

const schema = z.object({
  /**
   * schedule  — admin books pickup with courier (approved → pickup_scheduled)
   * collected — delivery agent / admin marks item collected from customer
   *             (pickup_scheduled | approved → in_transit)
   * received  — warehouse marks item received; triggers auto-restock
   *             (in_transit | pickup_scheduled | approved → received)
   */
  action: z.enum(["schedule", "collected", "received"]),
  note:   z.string().max(500).optional(),
});

/**
 * PATCH /api/admin/returns/[id]/pickup
 *
 * Advance the return pickup lifecycle:
 *   approved ──► pickup_scheduled ──► in_transit ──► received
 *
 * "received" automatically restocks inventory via restock_returned_items().
 */
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

    let dbError: { message?: string; code?: string } | null = null;

    if (action === "schedule") {
      const { error } = await db.rpc("mark_return_pickup_scheduled", {
        p_return_id: returnId,
        p_actor_id:  user.id,
        p_note:      note,
      });
      dbError = error;
    } else if (action === "collected") {
      const { error } = await db.rpc("mark_return_collected", {
        p_return_id:  returnId,
        p_actor_id:   user.id,
        p_actor_type: "admin",
        p_note:       note,
      });
      dbError = error;
    } else {
      const { error } = await db.rpc("mark_return_received", {
        p_return_id: returnId,
        p_actor_id:  user.id,
        p_note:      note,
      });
      dbError = error;
    }

    const error = dbError;

    if (error) {
      const msg = error.message ?? "";
      if (error.code === "P0005" || msg.includes("not found")) {
        throw new NotFoundError("Return request not found");
      }
      if (error.code === "P0006" || msg.includes("only be")) {
        throw new OrderStateError(msg || "Invalid state transition for pickup action");
      }
      throw new Error(msg || `Failed to perform pickup action: ${action}`);
    }

    await logAdminAction(ctx, request, {
      action:     `return_pickup_${action}`,
      entityType: "return",
      entityId:   returnId,
      metadata:   { note },
    });

    const successMessages: Record<typeof action, string> = {
      schedule:  "Pickup scheduled",
      collected: "Item marked as collected",
      received:  "Item received at warehouse — inventory restocked",
    };

    return apiSuccess({ success: true, message: successMessages[action] });
  },
);
