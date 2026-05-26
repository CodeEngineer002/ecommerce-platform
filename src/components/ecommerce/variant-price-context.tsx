"use client";

import { createContext, useContext, type ReactNode } from "react";

import { PriceDisplay } from "./price-display";

/**
 * Map of variant_id → resolved (price, compare_price) for the customer's
 * currency. Comes from src/lib/pricing/resolve-variant-price.ts on the server
 * and is serialized as a plain object so it crosses the RSC boundary cleanly.
 */
export type VariantPriceMap = Record<string, { price: number; compare_price: number | null }>;

interface VariantPriceContextValue {
  selectedVariantId: string | null;
  priceMap:          VariantPriceMap;
  /** Used when no override exists in priceMap for the selected variant. */
  fallbackPrice:        number;
  fallbackComparePrice: number | null;
}

const VariantPriceContext = createContext<VariantPriceContextValue | null>(null);

export function VariantPriceProvider({
  selectedVariantId,
  priceMap,
  fallbackPrice,
  fallbackComparePrice,
  children,
}: VariantPriceContextValue & { children: ReactNode }) {
  return (
    <VariantPriceContext.Provider
      value={{ selectedVariantId, priceMap, fallbackPrice, fallbackComparePrice }}
    >
      {children}
    </VariantPriceContext.Provider>
  );
}

interface DisplayProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

/**
 * Renders PriceDisplay tied to the currently-selected variant from
 * VariantPriceProvider. Used inside PDPs so changing color/size updates the
 * displayed price without a server round-trip.
 *
 * Falls back to (fallbackPrice, fallbackComparePrice) when the provider
 * isn't found OR when the selected variant has no resolved row in priceMap.
 * That preserves the storefront's existing behaviour for markets where ops
 * hasn't configured a per-currency override yet.
 */
export function VariantPriceDisplay({ size = "md", className }: DisplayProps) {
  const ctx = useContext(VariantPriceContext);
  if (!ctx) return null;

  const resolved = ctx.selectedVariantId ? ctx.priceMap[ctx.selectedVariantId] : undefined;
  const price        = resolved?.price        ?? ctx.fallbackPrice;
  const comparePrice = resolved?.compare_price ?? ctx.fallbackComparePrice;

  return <PriceDisplay price={price} comparePrice={comparePrice} size={size} className={className} />;
}
