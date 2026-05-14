/**
 * Address domain — pure validation engine
 *
 * Design principles:
 * - validateAddressForCountry() is a pure function; country rules are injected
 *   as a parameter so it can be tested without a DB connection.
 * - normalizeAddress() trims, uppercases country_code, formats postal codes.
 * - getCountryRules() loads rules from the DB (server-side only via service).
 *
 * NOTE: This file does NOT import `server-only` because `validateAddressForCountry`
 * is called from client-side forms too (mirrors server rules for instant feedback).
 * DB access functions are only called from address-service.ts (which IS server-only).
 */

import type { AddressCountryRules, AddressFieldError, AddressInput, AddressValidationResult, NormalizedAddress } from "./types";

// ── Normalize ─────────────────────────────────────────────────────────────────

export function normalizeAddress(input: AddressInput): NormalizedAddress {
  const trim = (s: string | undefined | null) => (s ?? "").trim();

  return {
    first_name:           trim(input.first_name),
    last_name:            trim(input.last_name) || "",
    company:              trim(input.company) || null,
    phone:                trim(input.phone) || null,
    email:                trim(input.email) || null,
    address_line1:        trim(input.address_line1),
    address_line2:        trim(input.address_line2) || null,
    city:                 trim(input.city),
    state:                trim(input.state) || "",
    postal_code:          normalizePostalCode(trim(input.postal_code) || "", input.country_code),
    country_code:         input.country_code.toUpperCase(),
    country_id:           input.country_id?.toLowerCase() ?? null,
    label:                trim(input.label) || null,
    delivery_instructions: trim(input.delivery_instructions) || null,
  };
}

function normalizePostalCode(raw: string, countryCode: string): string {
  // UK: ensure single space between outward and inward codes (e.g. "SW1A1AA" → "SW1A 1AA")
  if (countryCode.toUpperCase() === "GB") {
    const clean = raw.toUpperCase().replace(/\s+/g, "");
    if (clean.length >= 5) {
      return `${clean.slice(0, clean.length - 3)} ${clean.slice(clean.length - 3)}`;
    }
  }
  return raw.toUpperCase();
}

// ── Validate against country rules ───────────────────────────────────────────

/**
 * Pure validation function. Pass in the address input and the country rules
 * loaded from DB. Returns a structured result with field-level errors.
 *
 * If no rules are provided (country not configured), only basic presence
 * checks are applied.
 */
export function validateAddressForCountry(
  input: AddressInput,
  rules: AddressCountryRules | null,
): AddressValidationResult {
  const errors: AddressFieldError[] = [];

  // ── Required base fields (always validated) ───────────────────────────────
  if (!input.first_name?.trim()) {
    errors.push({ field: "first_name", message: "First name is required" });
  }
  if (!input.address_line1?.trim()) {
    errors.push({ field: "address_line1", message: "Address line 1 is required" });
  }
  if (!input.country_code?.trim()) {
    errors.push({ field: "country_code", message: "Country is required" });
  }

  if (!rules) {
    // No country-specific rules — apply generic city + postal checks
    if (!input.city?.trim()) {
      errors.push({ field: "city", message: "City is required" });
    }
    if (!input.postal_code?.trim()) {
      errors.push({ field: "postal_code", message: "Postal code is required" });
    }
    return buildResult(errors, input);
  }

  // ── City ──────────────────────────────────────────────────────────────────
  if (rules.city_required && !input.city?.trim()) {
    errors.push({ field: "city", message: "City is required" });
  }

  // ── State / Province ──────────────────────────────────────────────────────
  if (rules.state_required && !input.state?.trim()) {
    errors.push({ field: "state", message: `${rules.state_label} is required` });
  }

  // ── Postal code ───────────────────────────────────────────────────────────
  if (rules.postal_code_required) {
    const postal = input.postal_code?.trim() ?? "";
    if (!postal) {
      errors.push({
        field: "postal_code",
        message: `${rules.postal_code_label} is required`,
      });
    } else if (rules.postal_code_regex) {
      const normalizedPostal = normalizePostalCode(postal, input.country_code);
      const regex = new RegExp(rules.postal_code_regex);
      if (!regex.test(normalizedPostal)) {
        const hint = rules.postal_code_example
          ? ` (example: ${rules.postal_code_example})`
          : "";
        errors.push({
          field: "postal_code",
          message: `Invalid ${rules.postal_code_label}${hint}`,
        });
      }
    }
  }

  // ── Phone ─────────────────────────────────────────────────────────────────
  if (rules.phone_required && !input.phone?.trim()) {
    errors.push({ field: "phone", message: "Phone number is required" });
  }

  return buildResult(errors, input, rules);
}

function buildResult(
  errors: AddressFieldError[],
  input: AddressInput,
  _rules?: AddressCountryRules | null,
): AddressValidationResult {
  if (errors.length > 0) {
    return { valid: false, errors };
  }
  return {
    valid: true,
    errors: [],
    normalized: normalizeAddress(input),
  };
}

// ── Field-errors → Record for API responses ───────────────────────────────────

export function addressFieldErrorsToRecord(
  errors: AddressFieldError[],
): Record<string, string[]> {
  return errors.reduce<Record<string, string[]>>((acc, e) => {
    if (!acc[e.field]) acc[e.field] = [];
    acc[e.field].push(e.message);
    return acc;
  }, {});
}
