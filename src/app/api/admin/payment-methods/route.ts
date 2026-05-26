import { z } from "zod";

import { apiError, apiSuccess, withApiHandler } from "@/lib/api";
import { PERMISSIONS } from "@/lib/admin/permissions";
import { requireAdminPermission } from "@/lib/admin/with-admin-permission";

const querySchema = z.object({
  country: z.string().min(2).max(3).optional(),
});

/**
 * GET /api/admin/payment-methods?country=IN
 *
 * Admin read endpoint. Returns ALL methods (enabled + disabled) so the
 * admin page can render toggles. Optional `country` filter; without it,
 * returns rows for all countries grouped by country in the response.
 */
export const GET = withApiHandler(async (request: Request) => {
  const { db } = await requireAdminPermission(PERMISSIONS.ORDERS_READ);

  const url    = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) return apiError("Invalid query", 400, "VALIDATION_ERROR");

  let query = db
    .from("country_payment_methods")
    .select("*")
    .order("country_code", { ascending: true })
    .order("sort_order",   { ascending: true });

  if (parsed.data.country) {
    query = query.eq("country_code", parsed.data.country.toUpperCase());
  }

  const { data, error } = await query;
  if (error) return apiError(error.message, 500, "DB_ERROR");

  return apiSuccess({ rows: data ?? [] });
});

// ── POST — add a new (country, method) row ─────────────────────────────────
// Method type must be one of the platform's supported providers (the DB CHECK
// constraint enforces this — see migration 00069). Adding a wholly new
// provider type is a developer task: update the CHECK + ship integration code.

const createSchema = z.object({
  country_code:   z.string().min(2).max(3),
  method:         z.enum(["cod", "stripe", "razorpay"]),
  is_enabled:     z.boolean().default(true),
  label:          z.string().min(1).max(120),
  description:    z.string().max(500).nullable().optional(),
  sort_order:     z.number().int().min(0).max(1000).default(0),
  /** COD-only: ignored for non-cod methods. null = no cap. */
  cod_max_amount: z.number().nonnegative().nullable().optional(),
});

export const POST = withApiHandler(async (request: Request) => {
  const { db } = await requireAdminPermission(PERMISSIONS.ORDERS_MANAGE);

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

  const row = { ...parsed.data, country_code: parsed.data.country_code.toUpperCase() };
  const { data, error } = await db
    .from("country_payment_methods")
    .insert(row)
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return apiError(
        `${row.method} is already configured for ${row.country_code}. Edit the existing entry instead.`,
        409,
        "DUPLICATE",
      );
    }
    return apiError(error.message, 500, "DB_ERROR");
  }

  return apiSuccess({ row: data }, 201);
});
