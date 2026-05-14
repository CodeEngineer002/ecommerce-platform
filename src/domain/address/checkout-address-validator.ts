/**
 * Checkout address validator — server-side
 *
 * Validates a checkout address against:
 *  1. Active storefront country (from x-country request header)
 *  2. Region (state/province/emirate) validity
 *  3. City validity (when requires_free_text=false)
 *  4. Postal code format
 *  5. Required field presence
 */
import "server-only";

import { countryIdToIso } from "./region-policy";
import { getLocationAddressRules, isValidCity, isValidRegion } from "./location-service";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface CheckoutAddressInput {
  full_name: string;
  phone?: string | null;
  address_line1: string;
  address_line2?: string | null;
  /** ISO alpha-2, must match active storefront country */
  country_code: string;
  /** State/province/emirate code, e.g. "CA", "MH", "DU" */
  region_code: string;
  city: string;
  postal_code: string;
}

export interface CheckoutValidationResult {
  is_valid: boolean;
  validation_errors: Record<string, string[]>;
  warnings: string[];
  confidence_score: number;
  /** Normalized values to use in the final order */
  normalized?: {
    full_name: string;
    city: string;
    region_code: string;
    state: string;     // human-readable region name
    postal_code: string;
    country_code: string;
  };
}

// ── Main validator ────────────────────────────────────────────────────────────

export async function validateCheckoutAddress(
  input: CheckoutAddressInput,
  /** ISO alpha-2 active storefront country from x-country header */
  activeCountryIso: string,
): Promise<CheckoutValidationResult> {
  const errors: Record<string, string[]> = {};
  const warnings: string[] = [];

  function addError(field: string, message: string) {
    errors[field] = [...(errors[field] ?? []), message];
  }

  // ── 1. Country must match active storefront region ─────────────────────────
  const inputIso = input.country_code.toUpperCase();
  const activeIso = activeCountryIso.toUpperCase();
  if (inputIso !== activeIso) {
    addError("country_code", `Shipping country must be ${activeIso} for this storefront region.`);
  }

  // ── 2. Required base fields ────────────────────────────────────────────────
  if (!input.full_name?.trim()) addError("full_name", "Full name is required.");
  if (!input.address_line1?.trim()) addError("address_line1", "Address line 1 is required.");
  if (!input.region_code?.trim()) addError("region_code", "State / Province is required.");
  if (!input.city?.trim()) addError("city", "City is required.");

  // ── 3. Load country rules ──────────────────────────────────────────────────
  const rules = await getLocationAddressRules(inputIso);

  if (rules) {
    // Phone required
    if (rules.phone_required && !input.phone?.trim()) {
      addError("phone", `Phone number is required for ${inputIso} deliveries.`);
    }

    // Postal code
    if (rules.postal_code_required) {
      if (!input.postal_code?.trim()) {
        addError("postal_code", `${rules.postal_code_label} is required.`);
      } else if (rules.postal_code_regex) {
        const regex = new RegExp(rules.postal_code_regex, "i");
        if (!regex.test(input.postal_code.trim())) {
          addError(
            "postal_code",
            `Invalid ${rules.postal_code_label} format.${rules.postal_code_example ? ` Example: ${rules.postal_code_example}` : ""}`,
          );
        }
      }
    }
  } else {
    // No rules found — basic postal code check
    if (!input.postal_code?.trim()) {
      addError("postal_code", "Postal code is required.");
    }
  }

  // Stop early if base errors prevent region/city lookup
  if (Object.keys(errors).length > 0) {
    return { is_valid: false, validation_errors: errors, warnings, confidence_score: 0 };
  }

  // ── 4. Validate region belongs to country ─────────────────────────────────
  let regionName = input.region_code;
  if (input.region_code.trim()) {
    const regionValid = await isValidRegion(inputIso, input.region_code.trim());
    if (!regionValid) {
      addError(
        "region_code",
        `"${input.region_code}" is not a valid ${rules?.state_label ?? "state/province"} for ${inputIso}.`,
      );
    } else {
      // Resolve human-readable region name
      const { getRegions } = await import("./location-service");
      const regions = await getRegions(inputIso);
      regionName =
        regions.find((r) => r.code.toUpperCase() === input.region_code.toUpperCase())?.name ??
        input.region_code;
    }
  }

  // ── 5. Validate city belongs to region (when free text not allowed) ────────
  if (!rules?.allows_free_text_city && input.city.trim() && input.region_code.trim()) {
    const cityValid = await isValidCity(inputIso, input.region_code.trim(), input.city.trim());
    if (!cityValid) {
      // Warn rather than hard-error if DB city list might be incomplete
      warnings.push(
        `City "${input.city}" could not be verified for ${regionName}. Please double-check your address.`,
      );
    }
  }

  const hasErrors = Object.keys(errors).length > 0;
  if (hasErrors) {
    return { is_valid: false, validation_errors: errors, warnings, confidence_score: 0 };
  }

  // ── 6. Build normalized result ─────────────────────────────────────────────
  const normalizedPostal = normalizePostalCode(
    input.postal_code.trim(),
    inputIso,
  );

  return {
    is_valid: true,
    validation_errors: {},
    warnings,
    confidence_score: warnings.length === 0 ? 1.0 : 0.8,
    normalized: {
      full_name: input.full_name.trim(),
      city: capitalize(input.city.trim()),
      region_code: input.region_code.trim().toUpperCase(),
      state: regionName,
      postal_code: normalizedPostal,
      country_code: inputIso,
    },
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizePostalCode(raw: string, countryCode: string): string {
  if (countryCode === "GB") {
    const clean = raw.toUpperCase().replace(/\s+/g, "");
    if (clean.length >= 5) {
      return `${clean.slice(0, clean.length - 3)} ${clean.slice(clean.length - 3)}`;
    }
  }
  return raw.toUpperCase();
}

function capitalize(s: string): string {
  return s
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}
