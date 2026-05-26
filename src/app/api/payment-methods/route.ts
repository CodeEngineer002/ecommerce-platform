import { z } from "zod";

import { apiError, apiSuccess, withApiHandler } from "@/lib/api";
import { createServiceClient } from "@/lib/supabase/server";

const schema = z.object({
  country: z.string().min(2).max(3),
});

export interface PaymentMethodOption {
  method:      string;
  label:       string;
  description: string | null;
  sort_order:  number;
  /** COD-only: max accepted order total in country currency. null = no cap. */
  cod_max_amount: number | null;
}

/**
 * GET /api/payment-methods?country=IN
 *
 * Public read endpoint used by the checkout page to render the list of
 * payment options dynamically (instead of hardcoding cod / stripe radios).
 *
 * Returns ONLY enabled methods, sorted by sort_order ascending.
 * Disabled methods are excluded — admin admin/payment-methods toggles them.
 */
export const GET = withApiHandler(async (request: Request) => {
  const url = new URL(request.url);
  const parsed = schema.safeParse({ country: url.searchParams.get("country") ?? "" });
  if (!parsed.success) {
    return apiError("Invalid query", 400, "VALIDATION_ERROR");
  }

  const db = createServiceClient();
  const { data, error } = await db
    .from("country_payment_methods")
    .select("method, label, description, sort_order, cod_max_amount")
    .eq("country_code", parsed.data.country.toUpperCase())
    .eq("is_enabled", true)
    .order("sort_order", { ascending: true });

  if (error) return apiError(error.message, 500, "DB_ERROR");

  return apiSuccess({
    country:   parsed.data.country.toUpperCase(),
    methods:   (data ?? []) as PaymentMethodOption[],
  });
});
