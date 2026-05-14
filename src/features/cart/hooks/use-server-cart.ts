"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";

import { queryKeys } from "@/lib/query-keys";
import { useCartStore } from "@/store/cart-store";
import type { CartSummary } from "@/domain/cart/types";

/**
 * Fetches GET /api/cart on mount (creates cart if none exists).
 * Syncs the returned CartSummary into Zustand setServerCart so that
 * itemCount(), subtotal() and checkout pricing are always server-authoritative.
 *
 * Placed in CartHydrationProvider so it runs on every storefront page.
 */
export function useServerCart() {
  const setServerCart = useCartStore((s) => s.setServerCart);

  const result = useQuery({
    queryKey: queryKeys.cart.session,
    queryFn: async (): Promise<CartSummary> => {
      const res = await fetch("/api/cart");
      if (!res.ok) throw new Error("Failed to fetch cart");
      const { data } = (await res.json()) as { data: CartSummary };
      return data;
    },
    // Cart prices can change; re-validate every 30 s
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: true,
  });

  // Sync into Zustand whenever React Query gets fresh data
  useEffect(() => {
    if (result.data) setServerCart(result.data);
  }, [result.data, setServerCart]);

  return result;
}
