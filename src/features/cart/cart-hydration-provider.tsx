"use client";

import { useCartHydration } from "./hooks/use-cart-hydration";
import { useServerCart } from "./hooks/use-server-cart";

export function CartHydrationProvider({ children }: { children: React.ReactNode }) {
  // Fetch server cart → populates serverCart in Zustand (authoritative pricing)
  useServerCart();
  // Enrich persistedItems with full product details for cart drawer / cart page display
  useCartHydration();
  return <>{children}</>;
}
