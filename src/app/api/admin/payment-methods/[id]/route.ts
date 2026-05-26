import { z } from "zod";

import { apiError, apiSuccess, withApiHandler } from "@/lib/api";
import { PERMISSIONS } from "@/lib/admin/permissions";
import { requireAdminPermission } from "@/lib/admin/with-admin-permission";
import { NotFoundError } from "@/lib/errors";

const patchSchema = z.object({
  is_enabled: z.boolean().optional(),
  label:      z.string().min(1).max(120).optional(),
  description: z.string().max(500).nullable().optional(),
  sort_order: z.number().int().min(0).max(1000).optional(),
});

/**
 * PATCH /api/admin/payment-methods/[id]
 *
 * Allows admin to:
 *   - Toggle is_enabled on/off for a given (country, method) row
 *   - Update the customer-facing label / description (per-region copy)
 *   - Reorder via sort_order
 *
 * Country + method are NOT editable (composite PK); admins delete + re-add
 * via DB migration if they truly want a different pair (rare).
 */
export const PATCH = withApiHandler(
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    const { db } = await requireAdminPermission(PERMISSIONS.ORDERS_MANAGE);
    const { id } = await context.params;

    const body: unknown = await request.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(
        "Invalid request",
        400,
        "VALIDATION_ERROR",
        parsed.error.flatten().fieldErrors as Record<string, string[]>,
      );
    }

    const { data, error } = await db
      .from("country_payment_methods")
      .update(parsed.data)
      .eq("id", id)
      .select()
      .single();

    if (error) return apiError(error.message, 500, "DB_ERROR");
    if (!data)  throw new NotFoundError("Payment method row not found");

    return apiSuccess({ row: data });
  },
);

export const DELETE = withApiHandler(
  async (_request: Request, context: { params: Promise<{ id: string }> }) => {
    const { db } = await requireAdminPermission(PERMISSIONS.ORDERS_MANAGE);
    const { id } = await context.params;

    const { error } = await db.from("country_payment_methods").delete().eq("id", id);
    if (error) return apiError(error.message, 500, "DB_ERROR");

    return apiSuccess({ id, deleted: true });
  },
);
