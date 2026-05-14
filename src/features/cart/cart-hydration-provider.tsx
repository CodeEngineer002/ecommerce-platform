"use client";

import { useCartHydration } from "./hooks/use-cart-hydration";

export function CartHydrationProvider({ children }: { children: React.ReactNode }) {
  useCartHydration();
  return <>{children}</>;
}
