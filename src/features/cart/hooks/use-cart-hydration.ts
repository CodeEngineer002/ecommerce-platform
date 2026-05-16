"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";

import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/query-keys";
import { useCartStore } from "@/store/cart-store";
import type { CartItemWithProduct } from "@/types";

/**
 * Enriches persisted localStorage items with full product details.
 *
 * IMPORTANT: This hook is a fallback for the cold-start case where
 * the server cart has not yet been fetched. When serverCart is already
 * populated, its items already contain all display data we need (CartItemDetail),
 * so we skip the Supabase client query entirely to avoid a duplicate round-trip.
 */
export function useCartHydration() {
  const persistedItems = useCartStore((s) => s.persistedItems);
  const serverCart     = useCartStore((s) => s.serverCart);
  const setItems       = useCartStore((s) => s.setItems);

  const variantIds = persistedItems.map((i) => i.variant_id);

  // Skip client-side enrichment entirely when serverCart is available.
  // serverCart.items already contain product name, image, prices.
  const shouldFetch = variantIds.length > 0 && !serverCart;

  const { data: variants } = useQuery({
    queryKey: queryKeys.cart.variants(variantIds.slice().sort()),
    queryFn: async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("product_variants")
        .select("*, product:products(*, images:product_images(*))")
        .in("id", variantIds)
        .eq("is_active", true);
      return data ?? [];
    },
    enabled: shouldFetch,
    staleTime: 60_000,
  });

  useEffect(() => {
    // If serverCart is available, nothing to do — checkout page reads serverCart.items directly.
    if (serverCart) return;

    if (variantIds.length === 0) {
      setItems([]);
      return;
    }
    if (!variants) return;

    const hydrated = persistedItems
      .map((persisted) => {
        const variant = variants.find((v) => v.id === persisted.variant_id);
        if (!variant) return null;
        const { product: rawProduct, ...variantFields } = variant as typeof variant & {
          product: (typeof variant)["product"] & { images: { id: string; url: string; is_primary: boolean; sort_order: number; product_id: string; created_at: string }[] };
        };
        return {
          id: persisted.variant_id,
          cart_id: "",
          variant_id: persisted.variant_id,
          quantity: persisted.quantity,
          added_at: new Date().toISOString(),
          variant: {
            ...variantFields,
            product: rawProduct,
          },
        } as CartItemWithProduct;
      })
      .filter((item): item is CartItemWithProduct => item !== null);

    setItems(hydrated);
  }, [variants, persistedItems, setItems, variantIds.length, serverCart]);
}

