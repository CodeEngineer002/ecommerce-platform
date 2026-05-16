"use client";

import { useFormatPrice } from "@/hooks/use-format-price";
import { FREE_SHIPPING_THRESHOLD } from "@/lib/constants";

/**
 * Renders the free-shipping threshold in the visitor's regional currency.
 * Uses the same resolution chain as the rest of the storefront:
 *   serverCart.country_id → URL [country] param → DEFAULT_COUNTRY
 *
 * "full"  → "Free shipping on orders above $999"
 * "short" → "On orders above $999"          (used in homepage perks card)
 * "tab"   → "Free shipping on orders above $999"  (used in Shipping & Returns tab)
 */
interface Props {
  variant?: "full" | "short";
}

export function FreeShippingNote({ variant = "full" }: Props) {
  const fmt = useFormatPrice();
  const amount = fmt(FREE_SHIPPING_THRESHOLD);

  if (variant === "short") return <>On orders above {amount}</>;
  return <>Free shipping on orders above {amount}</>;
}
