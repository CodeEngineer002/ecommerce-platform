import { z } from "zod";

import { apiError, apiSuccess, withApiHandler } from "@/lib/api";
import { PERMISSIONS } from "@/lib/admin/permissions";
import { requireAdminPermission } from "@/lib/admin/with-admin-permission";
import { NotFoundError } from "@/lib/errors";

const patchSchema = z.object({
  city:           z.string().max(120).nullable().optional(),
  state:          z.string().max(120).nullable().optional(),
  is_deliverable: z.boolean().optional(),
  cod_enabled:    z.boolean().optional(),
  expected_days:  z.number().int().min(1).max(60).nullable().optional(),
  notes:          z.string().max(500).nullable().optional(),
});

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
      .from("serviceable_pincodes")
      .update(parsed.data)
      .eq("id", id)
      .select()
      .single();

    if (error) return apiError(error.message, 500, "DB_ERROR");
    if (!data)  throw new NotFoundError("Pincode row not found");

    return apiSuccess({ row: data });
  },
);

export const DELETE = withApiHandler(
  async (_request: Request, context: { params: Promise<{ id: string }> }) => {
    const { db } = await requireAdminPermission(PERMISSIONS.ORDERS_MANAGE);
    const { id } = await context.params;

    const { error } = await db.from("serviceable_pincodes").delete().eq("id", id);
    if (error) return apiError(error.message, 500, "DB_ERROR");

    return apiSuccess({ id, deleted: true });
  },
);
