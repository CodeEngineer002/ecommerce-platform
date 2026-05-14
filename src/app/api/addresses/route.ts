/**
 * GET /api/addresses       — list user's active addresses
 * POST /api/addresses      — create a new address
 */

import { z } from "zod";

import {
  createAddress,
  getAllCountryRules,
  listAddresses,
} from "@/domain/address/address-service";
import { apiError, apiSuccess, withApiHandler } from "@/lib/api";
import { AuthError } from "@/lib/errors";
import { withRateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

// ── Request schema ────────────────────────────────────────────────────────────

const createAddressSchema = z.object({
  first_name:             z.string().min(1, "First name is required").max(100),
  last_name:              z.string().max(100).optional().default(""),
  company:                z.string().max(200).optional(),
  phone:                  z.string().max(30).optional(),
  email:                  z.string().email().optional(),
  address_line1:          z.string().min(3, "Address is required").max(200),
  address_line2:          z.string().max(200).optional(),
  city:                   z.string().min(1, "City is required").max(100),
  state:                  z.string().max(100).optional().default(""),
  postal_code:            z.string().max(20).optional().default(""),
  country_code:           z.string().length(2, "Must be 2-character ISO country code").toUpperCase(),
  country_id:             z.string().optional(),
  label:                  z.string().max(50).optional(),
  delivery_instructions:  z.string().max(500).optional(),
  is_default_shipping:    z.boolean().optional().default(false),
  is_default_billing:     z.boolean().optional().default(false),
});

// ── GET /api/addresses ────────────────────────────────────────────────────────

export const GET = withApiHandler(async (request: Request) => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new AuthError();

  const [addresses, countryRules] = await Promise.all([
    listAddresses(user.id),
    getAllCountryRules(),
  ]);

  return apiSuccess({ addresses, countryRules });
});

// ── POST /api/addresses ───────────────────────────────────────────────────────

export const POST = withRateLimit(
  withApiHandler(async (request: Request) => {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new AuthError();

    const body: unknown = await request.json();
    const parsed = createAddressSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(
        "Validation failed",
        400,
        "VALIDATION_ERROR",
        parsed.error.flatten().fieldErrors as Record<string, string[]>,
      );
    }

    const address = await createAddress(user.id, parsed.data);
    return apiSuccess(address, 201);
  }),
  { limit: 20, windowMs: 60_000, routeKey: "addresses:create" },
);
