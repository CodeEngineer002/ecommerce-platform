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
}

export const REGION_CONFIGS: Record<CountryCode, RegionConfig> = {
  us: {
    currencyCode: 'USD', currencySymbol: '$', currencyLocale: 'en-US',
    taxRate: 0.0875, taxInclusive: false, taxLabel: 'Sales Tax',
    freeShippingThreshold: 75, defaultShippingCost: 9.99,
    dateFormat: 'MM/DD/YYYY', numberFormat: 'en-US',
  },
  uk: {
    currencyCode: 'GBP', currencySymbol: '£', currencyLocale: 'en-GB',
    taxRate: 0.20, taxInclusive: true, taxLabel: 'VAT',
    freeShippingThreshold: 50, defaultShippingCost: 4.99,
    dateFormat: 'DD/MM/YYYY', numberFormat: 'en-GB',
  },
  de: {
    currencyCode: 'EUR', currencySymbol: '€', currencyLocale: 'de-DE',
    taxRate: 0.19, taxInclusive: true, taxLabel: 'MwSt.',
    freeShippingThreshold: 50, defaultShippingCost: 4.99,
    dateFormat: 'DD.MM.YYYY', numberFormat: 'de-DE',
  },
  fr: {
    currencyCode: 'EUR', currencySymbol: '€', currencyLocale: 'fr-FR',
    taxRate: 0.20, taxInclusive: true, taxLabel: 'TVA',
    freeShippingThreshold: 50, defaultShippingCost: 4.99,
    dateFormat: 'DD/MM/YYYY', numberFormat: 'fr-FR',
  },
  it: {
    currencyCode: 'EUR', currencySymbol: '€', currencyLocale: 'it-IT',
    taxRate: 0.22, taxInclusive: true, taxLabel: 'IVA',
    freeShippingThreshold: 50, defaultShippingCost: 5.99,
    dateFormat: 'DD/MM/YYYY', numberFormat: 'it-IT',
  },
  es: {
    currencyCode: 'EUR', currencySymbol: '€', currencyLocale: 'es-ES',
    taxRate: 0.21, taxInclusive: true, taxLabel: 'IVA',
    freeShippingThreshold: 50, defaultShippingCost: 4.99,
    dateFormat: 'DD/MM/YYYY', numberFormat: 'es-ES',
  },
  in: {
    currencyCode: 'INR', currencySymbol: '₹', currencyLocale: 'en-IN',
    taxRate: 0.18, taxInclusive: false, taxLabel: 'GST',
    freeShippingThreshold: 999, defaultShippingCost: 99,
    dateFormat: 'DD/MM/YYYY', numberFormat: 'en-IN',
  },
  ae: {
    currencyCode: 'AED', currencySymbol: 'د.إ', currencyLocale: 'ar-AE',
    taxRate: 0.05, taxInclusive: false, taxLabel: 'VAT',
    freeShippingThreshold: 200, defaultShippingCost: 20,
    dateFormat: 'DD/MM/YYYY', numberFormat: 'ar-AE',
  },
};

export function getRegionConfig(country: CountryCode): RegionConfig {
  return REGION_CONFIGS[country];
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
