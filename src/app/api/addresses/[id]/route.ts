/**
 * PUT /api/addresses/[id]    — update an existing address
 * DELETE /api/addresses/[id] — archive (soft-delete) an address
 */

import { z } from "zod";

import {
  archiveAddress,
  updateAddress,
} from "@/domain/address/address-service";
import { apiError, apiSuccess, withApiHandler } from "@/lib/api";
import { AuthError } from "@/lib/errors";
import { withRateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

// ── Shared segment types ──────────────────────────────────────────────────────

interface RouteContext {
  params: Promise<{ id: string }>;
}

// ── Request schema ────────────────────────────────────────────────────────────

const updateAddressSchema = z.object({
  first_name:             z.string().min(1).max(100).optional(),
  last_name:              z.string().max(100).optional(),
  company:                z.string().max(200).optional(),
  phone:                  z.string().max(30).optional(),
  email:                  z.string().email().optional(),
  address_line1:          z.string().min(3).max(200).optional(),
  address_line2:          z.string().max(200).optional(),
  city:                   z.string().min(1).max(100).optional(),
  state:                  z.string().max(100).optional(),
  postal_code:            z.string().max(20).optional(),
  country_code:           z.string().length(2).toUpperCase().optional(),
  country_id:             z.string().optional(),
  label:                  z.string().max(50).optional(),
  delivery_instructions:  z.string().max(500).optional(),
  is_default_shipping:    z.boolean().optional(),
  is_default_billing:     z.boolean().optional(),
});

// ── PUT /api/addresses/[id] ───────────────────────────────────────────────────

export const PUT = withRateLimit(
  withApiHandler(async (request: Request, ctx: RouteContext) => {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new AuthError();

    const { id } = await ctx.params;

    const body: unknown = await request.json();
    const parsed = updateAddressSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(
        "Validation failed",
        400,
        "VALIDATION_ERROR",
        parsed.error.flatten().fieldErrors as Record<string, string[]>,
      );
    }

    const address = await updateAddress(user.id, id, parsed.data);
    return apiSuccess(address);
  }),
  { limit: 30, windowMs: 60_000, routeKey: "addresses:update" },
);

// ── DELETE /api/addresses/[id] ────────────────────────────────────────────────

export const DELETE = withRateLimit(
  withApiHandler(async (request: Request, ctx: RouteContext) => {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new AuthError();

    const { id } = await ctx.params;

    await archiveAddress(user.id, id);
    return apiSuccess({ archived: true });
  }),
  { limit: 20, windowMs: 60_000, routeKey: "addresses:archive" },
);
