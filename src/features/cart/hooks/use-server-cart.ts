"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
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
 *
 * Performance notes:
 * - placeholderData: keepPreviousData → keeps existing cart visible while
 *   a background refetch is in-flight; eliminates the blank-page flash.
 * - staleTime: 60s → reduces redundant refetches across quick navigations.
 * - refetchOnWindowFocus: true → re-validates on return from payment provider.
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
    staleTime: 60_000,         // was 30s; 60s is safe — mutations still invalidate immediately
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: true,
    placeholderData: keepPreviousData, // keep previous cart data visible during refetch
  });

  // Sync into Zustand whenever React Query gets fresh data
  // Guard: placeholderData: keepPreviousData makes result.data non-null even while
  // the cache is empty (isPlaceholderData === true). Calling setServerCart with
  // stale placeholder data would undo clearCart() after order placement before
  // the fresh empty-cart response arrives.
  useEffect(() => {
    if (result.data && !result.isPlaceholderData) setServerCart(result.data);
  }, [result.data, result.isPlaceholderData, setServerCart]);

  return result;
}

