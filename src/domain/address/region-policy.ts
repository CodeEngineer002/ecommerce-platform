/**
 * Address domain — region policy service
 *
 * Determines which countries are allowed for shipping/billing in the active
 * store region. The active region is identified by the `x-country` request
 * header (set by middleware from the URL segment or geolocation).
 *
 * Currently all 8 configured countries ship to one another (no cross-region
 * restriction). This module is the single place to tighten that policy.
 */

import type { AddressInput } from "./types";
import { AddressRegionMismatchError, UnsupportedShippingCountryError } from "./errors";

// ── Supported shipping countries (ISO alpha-2) ────────────────────────────────

const SUPPORTED_SHIPPING_COUNTRIES = new Set([
  "US", "GB", "DE", "FR", "IT", "ES", "IN", "AE",
]);

// ── Country ID → ISO alpha-2 map ─────────────────────────────────────────────

const COUNTRY_ID_TO_ISO: Record<string, string> = {
  us: "US",
  uk: "GB",
  de: "DE",
  fr: "FR",
  it: "IT",
  es: "ES",
  in: "IN",
  ae: "AE",
};

export function countryIdToIso(countryId: string): string {
  return COUNTRY_ID_TO_ISO[countryId.toLowerCase()] ?? countryId.toUpperCase();
}

export function isoToCountryId(iso: string): string {
  const entry = Object.entries(COUNTRY_ID_TO_ISO).find(
    ([, v]) => v === iso.toUpperCase(),
  );
  return entry ? entry[0] : iso.toLowerCase();
}

// ── Allowed shipping countries for a given region ────────────────────────────

/**
 * Returns the ISO alpha-2 codes accepted as shipping destinations for the
 * given store region (country_id such as 'in', 'us', 'de').
 *
 * Policy: currently all 8 configured countries are accepted everywhere.
 * Override here to add per-country shipping restrictions.
 */
export function getAllowedShippingCountriesForRegion(
  _regionCountryId: string,
): Set<string> {
  return new Set(SUPPORTED_SHIPPING_COUNTRIES);
}

// ── Guards ────────────────────────────────────────────────────────────────────

/**
 * Asserts that the address country is supported for shipping.
 * Throws UnsupportedShippingCountryError if not.
 */
export function assertShippingCountrySupported(address: AddressInput): void {
  const iso = address.country_code.toUpperCase();
  if (!SUPPORTED_SHIPPING_COUNTRIES.has(iso)) {
    throw new UnsupportedShippingCountryError(iso);
  }
}

/**
 * Asserts that the address country matches the active storefront region.
 * The active region is the ISO alpha-2 code derived from the x-country header
 * (e.g. 'IN' for India region, 'US' for US region).
 *
 * Throws AddressRegionMismatchError if they differ.
 *
 * NOTE: This is an OPTIONAL strict mode guard — currently not enforced by
 * default so users from India can still ship to the US store region if they
 * choose. Call explicitly where cross-region is forbidden.
 */
export function assertAddressMatchesActiveRegion(
  address: AddressInput,
  activeCountryId: string,
): void {
  const allowedIso = countryIdToIso(activeCountryId);
  const addressIso = address.country_code.toUpperCase();
  if (addressIso !== allowedIso) {
    throw new AddressRegionMismatchError(addressIso, allowedIso);
  }
}

/**
 * Extracts the active country from the `x-country` request header.
 * Falls back to 'in' (India) if header is missing.
 */
export function getActiveCountryFromRequest(request: Request): string {
  return request.headers.get("x-country") ?? "in";
}
