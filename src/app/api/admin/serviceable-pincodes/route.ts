import { z } from "zod";

import { apiError, apiSuccess, withApiHandler } from "@/lib/api";
import { PERMISSIONS } from "@/lib/admin/permissions";
import { requireAdminPermission } from "@/lib/admin/with-admin-permission";

// ── GET — list with filters + summary counts ────────────────────────────────

const listQuerySchema = z.object({
  country: z.string().min(2).max(3).optional(),
  /** Free-text search across pincode / city / state. */
  q:       z.string().max(120).optional(),
  /** Filter by COD flag — useful for "show me COD-disabled pincodes". */
  cod:     z.enum(["true", "false"]).optional(),
  /** Filter by deliverable flag — show only blocked, only allowed, etc. */
  deliverable: z.enum(["true", "false"]).optional(),
  page:    z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(200).default(50),
});

export const GET = withApiHandler(async (request: Request) => {
  const { db } = await requireAdminPermission(PERMISSIONS.ORDERS_READ);

  const url    = new URL(request.url);
  const parsed = listQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return apiError("Invalid query", 400, "VALIDATION_ERROR");
  }
  const { country, q, cod, deliverable, page, perPage } = parsed.data;

  let query = db
    .from("serviceable_pincodes")
    .select("*", { count: "exact" })
    .order("country_code", { ascending: true })
    .order("pincode",      { ascending: true });

  if (country) query = query.eq("country_code", country.toUpperCase());
  if (cod)         query = query.eq("cod_enabled",    cod === "true");
  if (deliverable) query = query.eq("is_deliverable", deliverable === "true");

  if (q?.trim()) {
    const term = `%${q.trim()}%`;
    query = query.or(
      `pincode.ilike.${term},city.ilike.${term},state.ilike.${term}`,
    );
  }

  const from = (page - 1) * perPage;
  query = query.range(from, from + perPage - 1);

  const { data, count, error } = await query;
  if (error) return apiError(error.message, 500, "DB_ERROR");

  // Lightweight per-country summary — same filters applied except the
  // country one (so the chips stay meaningful when a country is selected).
  // Cheap aggregate, runs against the same table.
  const { data: byCountry } = await db
    .from("serviceable_pincodes")
    .select("country_code, cod_enabled, is_deliverable");

  type Row = { country_code: string; cod_enabled: boolean; is_deliverable: boolean };
  const summaryMap = new Map<string, { total: number; cod_enabled: number; deliverable: number }>();
  for (const row of (byCountry ?? []) as Row[]) {
    const s = summaryMap.get(row.country_code) ?? { total: 0, cod_enabled: 0, deliverable: 0 };
    s.total += 1;
    if (row.cod_enabled)    s.cod_enabled += 1;
    if (row.is_deliverable) s.deliverable += 1;
    summaryMap.set(row.country_code, s);
  }
  const summary = Array.from(summaryMap.entries())
    .map(([country_code, counts]) => ({ country_code, ...counts }))
    .sort((a, b) => a.country_code.localeCompare(b.country_code));

  return apiSuccess({
    rows:    data ?? [],
    total:   count ?? 0,
    page,
    perPage,
    summary,
  });
});

// ── POST — create a single pincode row ──────────────────────────────────────

const createSchema = z.object({
  country_code:   z.string().min(2).max(3),
  pincode:        z.string().min(3).max(12),
  city:           z.string().max(120).nullable().optional(),
  state:          z.string().max(120).nullable().optional(),
  is_deliverable: z.boolean().default(true),
  cod_enabled:    z.boolean().default(true),
  expected_days:  z.number().int().min(1).max(60).nullable().optional(),
  notes:          z.string().max(500).nullable().optional(),
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
    .from("serviceable_pincodes")
    .insert(row)
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return apiError(
        `Pincode ${row.pincode} already exists for ${row.country_code}`,
        409,
        "DUPLICATE",
      );
    }
    return apiError(error.message, 500, "DB_ERROR");
  }

  return apiSuccess({ row: data }, 201);
});
