import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

import type { Product } from "@/types";

interface WishlistState {
  items: Product[];
  addItem: (product: Product) => void;
  removeItem: (productId: string) => void;
  toggleItem: (product: Product) => void;
  hasItem: (productId: string) => boolean;
  clear: () => void;
}

export const useWishlistStore = create<WishlistState>()(
  devtools(
  persist(
    (set, get) => ({
      items: [],

      addItem: (product) => {
        if (!get().hasItem(product.id)) {
          set((state) => ({ items: [...state.items, product] }), false, "addItem");
        }
      },

      removeItem: (productId) => {
        set((state) => ({ items: state.items.filter((p) => p.id !== productId) }), false, "removeItem");
      },

      toggleItem: (product) => {
        if (get().hasItem(product.id)) {
          get().removeItem(product.id);
        } else {
          get().addItem(product);
        }
      },

      hasItem: (productId) => get().items.some((p) => p.id === productId),

      clear: () => set({ items: [] }, false, "clear"),
    }),
    {
      name: "wishlist-storage",
    },
  ),
  { name: "ShopNest/wishlist" },
  ),
);
