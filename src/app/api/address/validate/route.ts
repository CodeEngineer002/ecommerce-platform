import { z } from "zod";

import { validateCheckoutAddress } from "@/domain/address/checkout-address-validator";
import { countryIdToIso } from "@/domain/address/region-policy";
import { apiError, apiSuccess, withApiHandler } from "@/lib/api";
import { withRateLimit } from "@/lib/rate-limit";

const validateRequestSchema = z.object({
  full_name:     z.string().min(1),
  phone:         z.string().optional().nullable(),
  address_line1: z.string().min(1),
  address_line2: z.string().optional().nullable(),
  country_code:  z.string().length(2),
  region_code:   z.string().min(1),
  city:          z.string().min(1),
  postal_code:   z.string().min(1).max(12),
});

/**
 * POST /api/address/validate
 * Server-side address validation against country rules + location DB.
 * Active storefront country is read from the x-country header (set by middleware).
 */
export const POST = withRateLimit(
  withApiHandler(async (request: Request) => {
    // Active country from middleware header (not trusted from request body)
    const activeCountryId  = request.headers.get("x-country") ?? "in";
    const activeCountryIso = countryIdToIso(activeCountryId);

    const body: unknown = await request.json();
    const parsed = validateRequestSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(
        "Invalid address data",
        400,
        "VALIDATION_ERROR",
        parsed.error.flatten().fieldErrors as Record<string, string[]>,
      );
    }

    const result = await validateCheckoutAddress(parsed.data, activeCountryIso);

    if (!result.is_valid) {
      return apiError(
        "Address validation failed",
        422,
        "ADDRESS_VALIDATION_FAILED",
        result.validation_errors,
      );
    }

    return apiSuccess({
      is_valid: result.is_valid,
      normalized: result.normalized,
      warnings: result.warnings,
      confidence_score: result.confidence_score,
    });
  }),
  { limit: 30, windowMs: 60_000, routeKey: "address:validate" },
);
