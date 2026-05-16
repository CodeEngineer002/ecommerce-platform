"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { useCartHydration } from "./hooks/use-cart-hydration";
import { useServerCart } from "./hooks/use-server-cart";
import { queryKeys } from "@/lib/query-keys";
import { useUserStore } from "@/store/user-store";

/**
 * Runs on every storefront page.
 *
 * 1. Fetches the server cart and syncs it into Zustand.
 * 2. Enriches localStorage-persisted items (only when serverCart is absent).
 * 3. Prefetches saved addresses when the cart has items and the user is
 *    authenticated — so the checkout page address list loads instantly.
 */
export function CartHydrationProvider({ children }: { children: React.ReactNode }) {
  const { data: serverCart } = useServerCart();
  const queryClient = useQueryClient();
  const userId = useUserStore((s) => s.user?.id);

  // Prefetch addresses when cart has items (user is likely heading to checkout)
  useEffect(() => {
    if (!userId || !serverCart?.item_count) return;
    const key = queryKeys.addresses.list(userId);
    // Only prefetch if not already in cache
    if (queryClient.getQueryData(key)) return;
    queryClient.prefetchQuery({
      queryKey: key,
      queryFn: async () => {
        const res = await fetch("/api/addresses");
        if (!res.ok) return { addresses: [], countryRules: [] };
        const { data } = (await res.json()) as { data: { addresses: unknown[]; countryRules: unknown[] } };
        return data;
      },
      staleTime: 60_000,
    });
  }, [userId, serverCart?.item_count, queryClient]);

  useCartHydration();
  return <>{children}</>;
}

