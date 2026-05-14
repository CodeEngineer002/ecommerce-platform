import { apiError, apiSuccess, withApiHandler } from "@/lib/api";
import { searchCities } from "@/domain/address/location-service";

/**
 * GET /api/locations/cities?country=US&region=CA&q=San&limit=20
 * Returns cities matching query for country + region.
 * Debounced on the client; limit defaults to 20.
 */
export const GET = withApiHandler(async (request: Request) => {
  const url = new URL(request.url);
  const country = url.searchParams.get("country")?.trim().toUpperCase();
  const region  = url.searchParams.get("region")?.trim().toUpperCase();
  const q       = url.searchParams.get("q")?.trim() ?? "";
  const limit   = Math.min(parseInt(url.searchParams.get("limit") ?? "20", 10), 50);

  if (!country || country.length !== 2) {
    return apiError("country is required (2-letter ISO code)", 400, "VALIDATION_ERROR");
  }
  if (!region) {
    return apiError("region is required", 400, "VALIDATION_ERROR");
  }

  const cities = await searchCities(country, region, q, limit);

  return apiSuccess({ cities });
});
