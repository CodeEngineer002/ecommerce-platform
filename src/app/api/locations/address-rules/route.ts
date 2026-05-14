import { apiError, apiSuccess, withApiHandler } from "@/lib/api";
import { getLocationAddressRules } from "@/domain/address/location-service";

/**
 * GET /api/locations/address-rules?country=US
 * Returns country-specific form configuration and validation rules.
 * Cached for 1 hour — reference data.
 */
export const GET = withApiHandler(async (request: Request) => {
  const url = new URL(request.url);
  const country = url.searchParams.get("country")?.trim().toUpperCase();

  if (!country || country.length !== 2) {
    return apiError("country is required (2-letter ISO code)", 400, "VALIDATION_ERROR");
  }

  const rules = await getLocationAddressRules(country);

  if (!rules) {
    // Return generic defaults for unknown countries
    return apiSuccess({
      rules: {
        country_code: country,
        postal_code_required: true,
        postal_code_regex: null,
        postal_code_example: null,
        postal_code_label: "Postal Code",
        state_required: false,
        state_label: "State / Province",
        city_required: true,
        city_label: "City",
        phone_required: false,
        rtl_layout: false,
        allows_free_text_city: true,
        allows_free_text_state: true,
      },
    });
  }

  return apiSuccess({ rules: { ...rules, country_code: country } });
});
