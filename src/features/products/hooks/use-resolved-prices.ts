"use client";

import { useQuery } from "@tanstack/react-query";

import { createClient } from "@/lib/supabase/client";

export interface ResolvedVariantPrice {
  price:         number;
  compare_price: number | null;
}

/**
 * Client-side per-variant price resolution scoped to one currency. Mirrors the
 * server-side `resolveVariantPrices` helper but uses the browser supabase
 * client so PLP / category / search / wishlist grids can fetch their prices
 * without a separate API round-trip.
 *
 * Returns a Map keyed by variant_id. When `variantIds` is empty the hook is
 * disabled — callers should treat the empty map as "no overrides", i.e. fall
 * back to `product.base_price`.
 *
 * Permissioning: the resolver RPC is SECURITY INVOKER and reads three tables
 * the storefront already exposes to anon (product_variant_prices public-read
 * RLS, product_variants, products), so no extra grants are needed.
 */
export function useResolvedVariantPrices(variantIds: string[], currency: string) {
  // Stable cache key — sort so callers don't accidentally bust the cache by
  // reordering the input array.
  const sortedIds = [...variantIds].sort();

  return useQuery({
    queryKey: ["resolved-variant-prices", currency.toUpperCase(), sortedIds],
    queryFn: async (): Promise<Map<string, ResolvedVariantPrice>> => {
      if (sortedIds.length === 0) return new Map();
      const supabase = createClient();
      const { data, error } = await supabase.rpc("resolve_variant_pricing_batch", {
        p_variant_ids: sortedIds,
        p_currency:    currency.toUpperCase(),
      });
      if (error) throw new Error(`resolve_variant_pricing_batch failed: ${error.message}`);

      const map = new Map<string, ResolvedVariantPrice>();
      for (const row of data ?? []) {
        map.set(row.variant_id, {
          price:         Number(row.price),
          compare_price: row.compare_price === null ? null : Number(row.compare_price),
        });
      }
      return map;
    },
    enabled: sortedIds.length > 0,
    staleTime: 5 * 60 * 1000, // prices are slow-changing
    gcTime:    10 * 60 * 1000,
  });
}

/**
 * Convenience: given a list of products and a variant-price map, return a
 * per-product display price (the cheapest variant in the customer's currency,
 * with that variant's compare_price). When no variant has a resolved price,
 * falls back to the product's own base_price / compare_price.
 */
export function buildProductDisplayPriceMap<
  P extends { id: string; base_price: number; compare_price: number | null; variants: Array<{ id: string; price: number | null }> },
>(
  products: P[],
  variantPriceMap: Map<string, ResolvedVariantPrice>,
): Record<string, { price: number; compare_price: number | null }> {
  const out: Record<string, { price: number; compare_price: number | null }> = {};

  for (const p of products) {
    let minPrice = p.base_price;
    let minComparePrice: number | null = p.compare_price;
    let seen = false;

    for (const v of p.variants) {
      const resolved = variantPriceMap.get(v.id);
      const effective = resolved?.price ?? v.price ?? p.base_price;
      if (!seen || effective < minPrice) {
        minPrice        = effective;
        // Prefer the compare_price that travels with the min-priced variant
        minComparePrice = resolved?.compare_price ?? p.compare_price;
        seen = true;
      }
    }

    out[p.id] = { price: minPrice, compare_price: minComparePrice };
  }

  return out;
}
