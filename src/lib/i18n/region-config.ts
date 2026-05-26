// ─────────────────────────────────────────────────────────────────────────────
// REGION-AWARE BUSINESS CONFIG
// Replaces the hardcoded INR/18%/en-IN constants in lib/constants.ts.
// These are static values derived from compile-time config — no DB needed.
// The DB region_configs table stores the source of truth; this is a typed cache.
// ─────────────────────────────────────────────────────────────────────────────

import type { CountryCode } from './config';

export interface RegionConfig {
  currencyCode: string;
  currencySymbol: string;
  currencyLocale: string;        // Intl.NumberFormat locale
  taxRate: number;               // e.g. 0.19
  taxInclusive: boolean;
  taxLabel: string;              // 'MwSt.', 'GST', 'VAT', 'Sales Tax'
  freeShippingThreshold: number;
  defaultShippingCost: number;
  dateFormat: string;
  numberFormat: string;
  /**
   * Maximum order total accepted for Cash-on-Delivery in this region.
   * Industry standard for India ≈ ₹10,000. Higher-amount COD has very high
   * refusal/loss rates, so we cap it. Customers above this amount must use
   * prepaid (Stripe/Razorpay).
   *
   * Set to `null` to disable COD entirely for the region.
   */
  codMaxAmount: number | null;
  /**
   * How strictly to enforce the `serviceable_pincodes` table:
   *   - "strict":     pincode MUST exist in the table with is_deliverable=true.
   *                   Used in markets where ops has curated the full pincode
   *                   list and rejecting unseen pincodes is intentional.
   *   - "permissive": pincode is honored if present (deliverable + cod_enabled
   *                   flags applied); if absent, defaults to deliverable + COD
   *                   allowed (subject to other gates). Right default while
   *                   you're still building the pincode list.
   *   - "off":        skip the serviceability check entirely (assume we ship
   *                   everywhere in this country). COD availability still
   *                   gated by codMaxAmount.
   */
  pincodeEnforcement: "strict" | "permissive" | "off";
}

export const REGION_CONFIGS: Record<CountryCode, RegionConfig> = {
  us: {
    currencyCode: 'USD', currencySymbol: '$', currencyLocale: 'en-US',
    taxRate: 0.0875, taxInclusive: false, taxLabel: 'Sales Tax',
    freeShippingThreshold: 75, defaultShippingCost: 9.99,
    dateFormat: 'MM/DD/YYYY', numberFormat: 'en-US',
    // COD is rare in the US — keep it disabled until ops explicitly enable it
    // for a region-specific pilot. Customers see prepaid only.
    codMaxAmount: null,
    pincodeEnforcement: 'off',
  },
  uk: {
    currencyCode: 'GBP', currencySymbol: '£', currencyLocale: 'en-GB',
    taxRate: 0.20, taxInclusive: true, taxLabel: 'VAT',
    freeShippingThreshold: 50, defaultShippingCost: 4.99,
    dateFormat: 'DD/MM/YYYY', numberFormat: 'en-GB',
    codMaxAmount: null,
    pincodeEnforcement: 'off',
  },
  de: {
    currencyCode: 'EUR', currencySymbol: '€', currencyLocale: 'de-DE',
    taxRate: 0.19, taxInclusive: true, taxLabel: 'MwSt.',
    freeShippingThreshold: 50, defaultShippingCost: 4.99,
    dateFormat: 'DD.MM.YYYY', numberFormat: 'de-DE',
    codMaxAmount: null,
    pincodeEnforcement: 'off',
  },
  fr: {
    currencyCode: 'EUR', currencySymbol: '€', currencyLocale: 'fr-FR',
    taxRate: 0.20, taxInclusive: true, taxLabel: 'TVA',
    freeShippingThreshold: 50, defaultShippingCost: 4.99,
    dateFormat: 'DD/MM/YYYY', numberFormat: 'fr-FR',
    codMaxAmount: null,
    pincodeEnforcement: 'off',
  },
  it: {
    currencyCode: 'EUR', currencySymbol: '€', currencyLocale: 'it-IT',
    taxRate: 0.22, taxInclusive: true, taxLabel: 'IVA',
    freeShippingThreshold: 50, defaultShippingCost: 5.99,
    dateFormat: 'DD/MM/YYYY', numberFormat: 'it-IT',
    codMaxAmount: null,
    pincodeEnforcement: 'off',
  },
  es: {
    currencyCode: 'EUR', currencySymbol: '€', currencyLocale: 'es-ES',
    taxRate: 0.21, taxInclusive: true, taxLabel: 'IVA',
    freeShippingThreshold: 50, defaultShippingCost: 4.99,
    dateFormat: 'DD/MM/YYYY', numberFormat: 'es-ES',
    codMaxAmount: null,
    pincodeEnforcement: 'off',
  },
  in: {
    currencyCode: 'INR', currencySymbol: '₹', currencyLocale: 'en-IN',
    taxRate: 0.18, taxInclusive: false, taxLabel: 'GST',
    freeShippingThreshold: 999, defaultShippingCost: 99,
    dateFormat: 'DD/MM/YYYY', numberFormat: 'en-IN',
    // India COD industry-standard cap: ₹10,000. Above this the refusal/RTO
    // rate spikes and the loss per refused order becomes painful.
    codMaxAmount: 10_000,
    // India: permissive while you're still building out the pincode list.
    // If the pincode is in the table, respect its flags. If not, allow.
    // Switch to 'strict' once ops has curated nationwide coverage.
    pincodeEnforcement: 'permissive',
  },
  ae: {
    currencyCode: 'AED', currencySymbol: 'د.إ', currencyLocale: 'ar-AE',
    taxRate: 0.05, taxInclusive: false, taxLabel: 'VAT',
    freeShippingThreshold: 200, defaultShippingCost: 20,
    dateFormat: 'DD/MM/YYYY', numberFormat: 'ar-AE',
    // UAE COD is common up to ~AED 1,000.
    codMaxAmount: 1_000,
    pincodeEnforcement: 'permissive',
  },
};

export function getRegionConfig(country: CountryCode): RegionConfig {
  return REGION_CONFIGS[country];
}

/**
 * Resolve the active currency for a shipping country.
 *
 * Accepts either:
 *   - lowercased country_id ("us", "in", "de")
 *   - ISO alpha-2 ("US", "IN", "DE")
 *
 * Falls back to INR when the country isn't in our configured region set, so
 * old/legacy orders without a recognised country always have *some* currency.
 */
export function getCurrencyForCountry(countryCode: string | null | undefined): string {
  if (!countryCode) return "INR";
  const key = countryCode.toLowerCase() as CountryCode;
  const config = REGION_CONFIGS[key];
  return config?.currencyCode ?? "INR";
}

/**
 * Maximum order total allowed for COD in the given country.
 *   - Returns the configured number when COD is enabled
 *   - Returns `null` when COD is disabled for that region or country is unknown
 */
export function getCodMaxAmountForCountry(
  countryCode: string | null | undefined,
): number | null {
  if (!countryCode) return null;
  const key = countryCode.toLowerCase() as CountryCode;
  return REGION_CONFIGS[key]?.codMaxAmount ?? null;
}

/**
 * Single decision: can a COD order of this total be accepted to this country?
 * Returns `{ ok: true }` or `{ ok: false, reason, maxAmount }`.
 */
export function checkCodEligibility(
  countryCode: string | null | undefined,
  orderTotal: number,
): { ok: true } | { ok: false; reason: "disabled" | "over_limit"; maxAmount: number | null } {
  const maxAmount = getCodMaxAmountForCountry(countryCode);
  if (maxAmount === null) {
    return { ok: false, reason: "disabled", maxAmount: null };
  }
  if (orderTotal > maxAmount) {
    return { ok: false, reason: "over_limit", maxAmount };
  }
  return { ok: true };
}

/**
 * P0-3: does this COD order need an admin verification call before fulfilment?
 *
 * Standard practice: low-value COD orders auto-pass (verification overhead
 * exceeds the loss exposure), high-value COD requires an actual phone call.
 *
 * Floor (per country, in the region's currency):
 *   IN  = ₹2,000 — verify everything above this
 *   AE  = AED 500
 *   other regions: COD is disabled anyway so this is moot
 */
const COD_VERIFICATION_FLOOR: Partial<Record<CountryCode, number>> = {
  in: 2_000,
  ae: 500,
};

export function isCodVerificationRequired(
  countryCode: string | null | undefined,
  orderTotal: number,
): boolean {
  if (!countryCode) return false;
  const key   = countryCode.toLowerCase() as CountryCode;
  const floor = COD_VERIFICATION_FLOOR[key];
  if (floor === undefined) return false;
  return orderTotal > floor;
}

/**
 * Raw pincode lookup result as returned by `/api/serviceability/check`.
 * `found=false` means the pincode wasn't in the table at all.
 */
export interface ServiceabilityResult {
  found:           boolean;
  is_deliverable:  boolean;
  cod_enabled:     boolean;
}

/**
 * Apply the region's pincodeEnforcement policy on top of the raw lookup
 * result. Centralises the precedence rules so checkout, order-create, and
 * the API all decide the same way.
 *
 * Decision matrix:
 *   policy="off"        → always { deliverable, cod }  (table ignored)
 *   policy="permissive" → if !found → { deliverable, cod };
 *                         else → { lookup.is_deliverable, lookup.cod_enabled }
 *   policy="strict"     → if !found → { not deliverable, no cod };
 *                         else → { lookup.is_deliverable, lookup.cod_enabled }
 */
export function resolveServiceability(
  countryCode: string | null | undefined,
  lookup: ServiceabilityResult | null | undefined,
): { is_deliverable: boolean; cod_enabled: boolean; policy: RegionConfig["pincodeEnforcement"] } {
  const key    = (countryCode ?? "").toLowerCase() as CountryCode;
  const policy = REGION_CONFIGS[key]?.pincodeEnforcement ?? "permissive";

  if (policy === "off") {
    return { is_deliverable: true, cod_enabled: true, policy };
  }

  if (!lookup?.found) {
    return policy === "strict"
      ? { is_deliverable: false, cod_enabled: false, policy }
      : { is_deliverable: true,  cod_enabled: true,  policy };
  }

  return {
    is_deliverable: lookup.is_deliverable,
    cod_enabled:    lookup.cod_enabled,
    policy,
  };
}

export function formatPrice(
  amount: number,
  country: CountryCode,
  options?: Intl.NumberFormatOptions,
): string {
  const { currencyCode, currencyLocale } = REGION_CONFIGS[country];
  return new Intl.NumberFormat(currencyLocale, {
    style: 'currency',
    currency: currencyCode,
    minimumFractionDigits: 2,
    ...options,
  }).format(amount);
}

export function calculateTax(
  subtotal: number,
  country: CountryCode,
): { taxAmount: number; total: number } {
  const { taxRate, taxInclusive } = REGION_CONFIGS[country];
  if (taxInclusive) {
    const taxAmount = subtotal - subtotal / (1 + taxRate);
    return { taxAmount, total: subtotal };
  }
  const taxAmount = subtotal * taxRate;
  return { taxAmount, total: subtotal + taxAmount };
}

export function getShippingCost(subtotal: number, country: CountryCode): number {
  const { freeShippingThreshold, defaultShippingCost } = REGION_CONFIGS[country];
  return subtotal >= freeShippingThreshold ? 0 : defaultShippingCost;
}
