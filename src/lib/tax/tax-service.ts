import "server-only";

import type { TaxConfig } from "@/domain/pricing/types";
import type { CountryCode } from "@/lib/i18n/config";
import { REGION_CONFIGS } from "@/lib/i18n/region-config";
import { TAX_RATE } from "@/lib/constants";

const FALLBACK_TAX: TaxConfig = { rate: TAX_RATE, label: "Tax" };

/**
 * Returns the tax configuration for a given ISO-3166-1 alpha-2 country code.
 * Uses the static REGION_CONFIGS (no DB round-trip) — all 8 supported countries
 * have their correct statutory rates and labels.
 *
 * Falls back to the default TAX_RATE constant for unsupported countries so
 * orders from countries not yet in config are never rejected.
 *
 * NOTE: taxInclusive (EU VAT) is not yet applied in the pricing engine.
 * For Phase 1, all tax is treated as exclusive (added on top of price).
 * Phase 3 task: implement tax-inclusive math when product prices are VAT-inclusive.
 */
export function getTaxConfig(countryCode: string): TaxConfig {
  const key = countryCode.toLowerCase() as CountryCode;
  const config = REGION_CONFIGS[key];

  if (!config) return FALLBACK_TAX;

  return {
    rate: config.taxRate,
    label: config.taxLabel,
  };
}
