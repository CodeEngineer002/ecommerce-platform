import { z } from "zod";

import { apiError, apiSuccess, withApiHandler } from "@/lib/api";
import { createServiceClient } from "@/lib/supabase/server";

const schema = z.object({
  country: z.string().min(2).max(3),
  pincode: z.string().min(3).max(12),
});

/**
 * GET /api/serviceability/check?country=IN&pincode=400001
 *
 * Public endpoint. Returns whether the given country + pincode is deliverable
 * and whether COD is enabled for that pincode. Used by:
 *   - Cart page (real-time pincode entry)
 *   - Checkout page (after address selection, blocking)
 *
 * Response shape:
 *   { data: { found, is_deliverable, cod_enabled, expected_days, city, state } }
 */
export const GET = withApiHandler(async (request: Request) => {
  const url    = new URL(request.url);
  const parsed = schema.safeParse({
    country: url.searchParams.get("country") ?? "",
    pincode: url.searchParams.get("pincode") ?? "",
  });
  if (!parsed.success) {
    return apiError(
      "Invalid request",
      400,
      "VALIDATION_ERROR",
      parsed.error.flatten().fieldErrors as Record<string, string[]>,
    );
  }

  // Service client because the RPC is granted to service_role; we don't
  // need user-scoped RLS for serviceability lookups (it's public data).
  const db = createServiceClient();
  const { data, error } = await db.rpc("check_pincode_serviceability", {
    p_country: parsed.data.country,
    p_pincode: parsed.data.pincode,
  });
  if (error) {
    return apiError(error.message, 500, "DB_ERROR");
  }

  // RPC returns a single-row TABLE; supabase-js returns an array.
  const row = Array.isArray(data) ? data[0] : data;
  return apiSuccess({
    found:          Boolean(row?.found),
    is_deliverable: Boolean(row?.is_deliverable),
    cod_enabled:    Boolean(row?.cod_enabled),
    expected_days:  row?.expected_days ?? null,
    city:           row?.city  ?? null,
    state:          row?.state ?? null,
  });
});
