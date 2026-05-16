"use client";

/**
 * useFormatPrice — returns a formatter function bound to the current store region.
 *
 * Resolution order for country:
 *   1. serverCart.country_id — set once the cart API responds (most authoritative)
 *   2. URL [country] param   — available immediately on any locale route
 *   3. DEFAULT_COUNTRY       — last-resort fallback
 *
 * Usage:
 *   const fmt = useFormatPrice();
 *   fmt(1999)  // → "$1,999.00" in US, "£1,999.00" in UK, "₹1,999" in IN, etc.
 */

import { useMemo } from "react";
import { useParams } from "next/navigation";

import { isValidCountry, DEFAULT_COUNTRY } from "@/lib/i18n/config";
import { REGION_CONFIGS } from "@/lib/i18n/region-config";
import { useCartStore } from "@/store/cart-store";

export function useFormatPrice() {
  const params = useParams();
  const cartCountryId = useCartStore((s) => s.serverCart?.country_id);

  // URL param gives correct country immediately — no need to wait for cart API
  const urlCountry = typeof params?.country === "string" ? params.country.toLowerCase() : null;
  const countryId =
    cartCountryId ??
    (urlCountry && isValidCountry(urlCountry) ? urlCountry : null) ??
    DEFAULT_COUNTRY;

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
