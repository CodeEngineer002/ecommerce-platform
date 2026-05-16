import "server-only";
import { z } from "zod";

import { apiSuccess, withApiHandler } from "@/lib/api";
import { PERMISSIONS } from "@/lib/admin/permissions";
import { logAdminAction, requireAdminPermission } from "@/lib/admin/with-admin-permission";
import { NotFoundError } from "@/lib/errors";

const resolveSchema = z.object({
  resolution_note: z.string().max(500).optional(),
});

// PATCH /api/admin/order-exceptions/[id] — resolve an exception
export const PATCH = withApiHandler(
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    const ctx = await requireAdminPermission(PERMISSIONS.ORDERS_MANAGE);
    const { db } = ctx;

    const { id } = await context.params;
    const body: unknown = await request.json();
    const { resolution_note } = resolveSchema.parse(body);

    const { data, error } = await db
      .from("order_exceptions")
      .update({
        status: "resolved",
        resolved_at: new Date().toISOString(),
        resolution_note: resolution_note ?? null,
      })
      .eq("id", id)
      .eq("status", "open")
      .select("id, order_id")
      .single();

    if (error || !data) {
      throw new NotFoundError("Exception not found or already resolved");
    }

    await logAdminAction(ctx, request, {
      action: "resolve_order_exception",
      entityType: "order",
      entityId: data.order_id,
      metadata: { exception_id: id, resolution_note },
    });

    return apiSuccess({ success: true });
  },
);
