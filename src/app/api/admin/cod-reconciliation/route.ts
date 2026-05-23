import { z } from "zod";

import { apiError, apiSuccess, withApiHandler } from "@/lib/api";
import { PERMISSIONS } from "@/lib/admin/permissions";
import { requireAdminPermission } from "@/lib/admin/with-admin-permission";

const querySchema = z.object({
  from:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  status: z.enum(["pending", "reconciled", "variance", "all"]).default("all"),
});

/**
 * GET /api/admin/cod-reconciliation?from=YYYY-MM-DD&to=YYYY-MM-DD&status=…
 *
 * Returns daily COD rollup rows. Default range: last 30 days.
 */
export const GET = withApiHandler(async (request: Request) => {
  const { db } = await requireAdminPermission(PERMISSIONS.ORDERS_READ);

  const url    = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return apiError("Invalid query", 400, "VALIDATION_ERROR");
  }
  const { from, to, status } = parsed.data;

  const today  = new Date();
  const start  = from ?? new Date(today.getTime() - 30 * 86_400_000).toISOString().slice(0, 10);
  const end    = to   ?? today.toISOString().slice(0, 10);

  let query = db
    .from("cod_daily_reconciliation")
    .select("*")
    .gte("date", start)
    .lte("date", end)
    .order("date", { ascending: false })
    .order("created_at", { ascending: false });

  if (status !== "all") {
    query = query.eq("status", status);
  }

  const { data, error } = await query;
  if (error) {
    return apiError(error.message, 500, "DB_ERROR");
  }

  return apiSuccess({ rows: data ?? [], range: { from: start, to: end } });
});

// ── PATCH: update deposit info for a single rollup row ───────────────────────
const patchSchema = z.object({
  id:                  z.string().uuid(),
  bank_deposit_amount: z.number().nonnegative().nullable().optional(),
  bank_deposit_ref:    z.string().max(120).nullable().optional(),
  deposited_at:        z.string().datetime().nullable().optional(),
  notes:               z.string().max(1000).nullable().optional(),
  status:              z.enum(["pending", "reconciled", "variance"]).optional(),
});

export const PATCH = withApiHandler(async (request: Request) => {
  const { db } = await requireAdminPermission(PERMISSIONS.ORDERS_MANAGE);

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
  const { id, ...patch } = parsed.data;

  const { data, error } = await db
    .from("cod_daily_reconciliation")
    .update(patch)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return apiError(error.message, 500, "DB_ERROR");
  }

  return apiSuccess({ row: data });
});
