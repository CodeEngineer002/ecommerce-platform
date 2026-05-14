import { apiError, apiSuccess, withApiHandler } from "@/lib/api";
import { getRegions } from "@/domain/address/location-service";

/**
 * GET /api/locations/regions?country=US
 * Returns administrative regions (states/provinces/emirates) for a country.
 * Cached for 1 hour — reference data.
 */
export const GET = withApiHandler(async (request: Request) => {
  const url = new URL(request.url);
  const country = url.searchParams.get("country")?.trim().toUpperCase();

  if (!country || country.length !== 2) {
    return apiError("Invalid country code", 400, "VALIDATION_ERROR");
  }

  const regions = await getRegions(country);

  return apiSuccess({ regions });
});
