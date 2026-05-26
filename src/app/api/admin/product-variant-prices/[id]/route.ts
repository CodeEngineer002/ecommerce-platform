import { z } from "zod";

import { apiError, apiSuccess, withApiHandler } from "@/lib/api";
import { PERMISSIONS } from "@/lib/admin/permissions";
import { requireAdminPermission } from "@/lib/admin/with-admin-permission";
import { NotFoundError } from "@/lib/errors";

const patchSchema = z.object({
  price:         z.number().nonnegative().optional(),
  compare_price: z.number().nonnegative().nullable().optional(),
  is_active:     z.boolean().optional(),
});

/**
 * PATCH /api/admin/product-variant-prices/[id]
 *
 * Edit price / compare_price / is_active for an existing (variant, currency)
 * row. variant_id and currency_code are NOT editable — they're the natural
 * key; delete + re-add to change them.
 */
export const PATCH = withApiHandler(
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    const { db } = await requireAdminPermission(PERMISSIONS.CATALOG_WRITE);
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

    // If both fields are being updated, validate the relationship up front.
    // For partial updates we let the DB CHECK constraint enforce the invariant
    // (it has the existing row's other side).
    if (
      parsed.data.price !== undefined &&
      parsed.data.compare_price !== null &&
      parsed.data.compare_price !== undefined &&
      parsed.data.compare_price < parsed.data.price
    ) {
      return apiError(
        "compare_price must be greater than or equal to price",
        400,
        "VALIDATION_ERROR",
      );
    }

    const { data, error } = await db
      .from("product_variant_prices")
      .update(parsed.data)
      .eq("id", id)
      .select()
      .single();

    if (error) return apiError(error.message, 500, "DB_ERROR");
    if (!data)  throw new NotFoundError("Variant price row not found");

    return apiSuccess({ row: data });
  },
);

export const DELETE = withApiHandler(
  async (_request: Request, context: { params: Promise<{ id: string }> }) => {
    const { db } = await requireAdminPermission(PERMISSIONS.CATALOG_WRITE);
    const { id } = await context.params;

    const { error } = await db.from("product_variant_prices").delete().eq("id", id);
    if (error) return apiError(error.message, 500, "DB_ERROR");

    return apiSuccess({ id, deleted: true });
  },
);
