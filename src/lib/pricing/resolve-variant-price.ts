import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database.types";

/**
 * Resolved pricing for a single variant in one currency.
 *
 * `compare_price` is the strike-through reference; null when no compare price
 * is configured. `price` is guaranteed non-null — the resolver function will
 * always fall back to product.base_price if every other source is missing.
 */
export interface ResolvedVariantPrice {
  price: number;
  compare_price: number | null;
}

type DbClient = SupabaseClient<Database>;

/**
 * Look up price + compare_price for a single (variant, currency) pair.
 *
 * Fallback chain (enforced inside the SQL function):
 *   1. product_variant_prices row for the requested currency (override)
 *   2. product_variants.price (legacy, today's source)
 *   3. products.base_price
 *
 * Returns null only if the variant id itself is unknown — every existing
 * variant resolves to a number even when no currency override has been set.
 */
export async function resolveVariantPrice(
  db: DbClient,
  variantId: string,
  currency: string,
): Promise<ResolvedVariantPrice | null> {
  const { data, error } = await db.rpc("resolve_variant_pricing", {
    p_variant_id: variantId,
    p_currency:   currency.toUpperCase(),
  });

  if (error) throw new Error(`resolve_variant_pricing failed: ${error.message}`);
  if (!data || data.length === 0) return null;

  const row = data[0];
  return {
    price:         Number(row.price),
    compare_price: row.compare_price === null ? null : Number(row.compare_price),
  };
}

/**
 * Batched resolver — one round-trip for many variants. Use this from cart /
 * checkout / order-create paths where you have a list of variant ids and a
 * single customer currency. Returns a Map keyed by variant_id so callers can
 * look up O(1).
 */
export async function resolveVariantPrices(
  db: DbClient,
  variantIds: string[],
  currency: string,
): Promise<Map<string, ResolvedVariantPrice>> {
  if (variantIds.length === 0) return new Map();

  const { data, error } = await db.rpc("resolve_variant_pricing_batch", {
    p_variant_ids: variantIds,
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
}
