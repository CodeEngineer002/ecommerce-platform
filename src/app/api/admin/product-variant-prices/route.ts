import { z } from "zod";

import { apiError, apiSuccess, withApiHandler } from "@/lib/api";
import { PERMISSIONS } from "@/lib/admin/permissions";
import { requireAdminPermission } from "@/lib/admin/with-admin-permission";

// ── GET /api/admin/product-variant-prices?product_id=… ────────────────────────
// Returns all per-currency price rows for every variant of a product.

const querySchema = z.object({
  product_id: z.string().uuid().optional(),
  variant_id: z.string().uuid().optional(),
}).refine((q) => q.product_id || q.variant_id, {
  message: "Either product_id or variant_id must be provided",
});

export const GET = withApiHandler(async (request: Request) => {
  const { db } = await requireAdminPermission(PERMISSIONS.CATALOG_READ);

  const url    = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) return apiError("Invalid query", 400, "VALIDATION_ERROR");

  // Resolve target variant ids — either the one passed in, or all variants
  // of the given product (the more common admin flow).
  let variantIds: string[];
  if (parsed.data.variant_id) {
    variantIds = [parsed.data.variant_id];
  } else {
    const { data: variants, error: vErr } = await db
      .from("product_variants")
      .select("id")
      .eq("product_id", parsed.data.product_id!);
    if (vErr) return apiError(vErr.message, 500, "DB_ERROR");
    variantIds = (variants ?? []).map((v) => v.id);
  }

  if (variantIds.length === 0) return apiSuccess({ rows: [] });

  const { data, error } = await db
    .from("product_variant_prices")
    .select("*")
    .in("variant_id", variantIds)
    .order("variant_id", { ascending: true })
    .order("currency_code", { ascending: true });

  if (error) return apiError(error.message, 500, "DB_ERROR");
  return apiSuccess({ rows: data ?? [] });
});

// ── POST — add a new (variant, currency) price ────────────────────────────────
// Unique constraint on (variant_id, currency_code) gives us conflict-as-error.

const createSchema = z.object({
  variant_id:    z.string().uuid(),
  currency_code: z.string().length(3),
  price:         z.number().nonnegative(),
  compare_price: z.number().nonnegative().nullable().optional(),
  is_active:     z.boolean().default(true),
});

export const POST = withApiHandler(async (request: Request) => {
  const { db } = await requireAdminPermission(PERMISSIONS.CATALOG_WRITE);

  const body: unknown = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(
      "Invalid request",
      400,
      "VALIDATION_ERROR",
      parsed.error.flatten().fieldErrors as Record<string, string[]>,
    );
  }

  // Reject compare_price < price up front so the user gets a useful 400 instead
  // of a generic DB CHECK violation.
  if (
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

  const row = { ...parsed.data, currency_code: parsed.data.currency_code.toUpperCase() };
  const { data, error } = await db
    .from("product_variant_prices")
    .insert(row)
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return apiError(
        `${row.currency_code} price is already configured for this variant. Edit the existing row instead.`,
        409,
        "DUPLICATE",
      );
    }
    return apiError(error.message, 500, "DB_ERROR");
  }

  return apiSuccess({ row: data }, 201);
});
