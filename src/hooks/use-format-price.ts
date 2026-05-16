"use client";

/**
 * useFormatPrice — returns a formatter function bound to the current store region.
 *
 * Reads country_id from the Zustand cart store (which is always synced to the
 * active store region via the cart API). Falls back to "in" (India/INR) when
 * the cart has not loaded yet.
 *
 * Usage:
 *   const fmt = useFormatPrice();
 *   fmt(1999)  // → "$1,999.00" in US, "£1,999.00" in UK, "₹1,999" in IN, etc.
 */

import { useMemo } from "react";

import { isValidCountry, DEFAULT_COUNTRY } from "@/lib/i18n/config";
import { REGION_CONFIGS } from "@/lib/i18n/region-config";
import { useCartStore } from "@/store/cart-store";

export function useFormatPrice() {
  const countryId = useCartStore((s) => s.serverCart?.country_id ?? DEFAULT_COUNTRY);

  return useMemo(() => {
    const key = isValidCountry(countryId) ? countryId : DEFAULT_COUNTRY;
    const { currencyCode, currencyLocale } = REGION_CONFIGS[key];

    return function fmt(amount: number, options?: Intl.NumberFormatOptions): string {
      return new Intl.NumberFormat(currencyLocale, {
        style: "currency",
        currency: currencyCode,
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
        ...options,
      }).format(amount);
    };
  }, [countryId]);
}
