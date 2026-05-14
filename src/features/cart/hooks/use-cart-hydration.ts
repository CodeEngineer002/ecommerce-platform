"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";

import { createClient } from "@/lib/supabase/client";
import { useCartStore } from "@/store/cart-store";
import type { CartItemWithProduct } from "@/types";

export function useCartHydration() {
  const persistedItems = useCartStore((s) => s.persistedItems);
  const setItems = useCartStore((s) => s.setItems);

  const variantIds = persistedItems.map((i) => i.variant_id);

  const { data: variants } = useQuery({
    queryKey: ["cart-variants", variantIds.slice().sort()],
    queryFn: async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("product_variants")
        .select("*, product:products(*, images:product_images(*))")
        .in("id", variantIds)
        .eq("is_active", true);
      return data ?? [];
    },
    enabled: variantIds.length > 0,
    staleTime: 60_000,
  });

  useEffect(() => {
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
  }, [variants, persistedItems, setItems, variantIds.length]);
}
