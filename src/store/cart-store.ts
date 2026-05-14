import { create } from "zustand";
import { persist } from "zustand/middleware";

import { CART_MAX_QUANTITY } from "@/lib/constants";
import type { CartItemWithProduct } from "@/types";

interface CartState {
  items: CartItemWithProduct[];
  isOpen: boolean;

  addItem: (item: CartItemWithProduct) => void;
  removeItem: (variantId: string) => void;
  updateQuantity: (variantId: string, quantity: number) => void;
  clearCart: () => void;
  openCart: () => void;
  closeCart: () => void;
  toggleCart: () => void;

  // Computed
  itemCount: () => number;
  subtotal: () => number;
  hasItem: (variantId: string) => boolean;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      isOpen: false,

      addItem: (item) => {
        set((state) => {
          const existing = state.items.find((i) => i.variant_id === item.variant_id);
          if (existing) {
            return {
              items: state.items.map((i) =>
                i.variant_id === item.variant_id
                  ? { ...i, quantity: Math.min(i.quantity + item.quantity, CART_MAX_QUANTITY) }
                  : i
              ),
            };
          }
          return { items: [...state.items, item] };
        });
      },

      removeItem: (variantId) => {
        set((state) => ({
          items: state.items.filter((i) => i.variant_id !== variantId),
        }));
      },

      updateQuantity: (variantId, quantity) => {
        if (quantity <= 0) {
          get().removeItem(variantId);
          return;
        }
        set((state) => ({
          items: state.items.map((i) =>
            i.variant_id === variantId
              ? { ...i, quantity: Math.min(quantity, CART_MAX_QUANTITY) }
              : i
          ),
        }));
      },

      clearCart: () => set({ items: [] }),

      openCart: () => set({ isOpen: true }),
      closeCart: () => set({ isOpen: false }),
      toggleCart: () => set((state) => ({ isOpen: !state.isOpen })),

      itemCount: () => get().items.reduce((sum, i) => sum + i.quantity, 0),

      subtotal: () =>
        get().items.reduce((sum, i) => {
          const price = i.variant.price ?? i.variant.product.base_price;
          return sum + price * i.quantity;
        }, 0),

      hasItem: (variantId) => get().items.some((i) => i.variant_id === variantId),
    }),
    {
      name: "cart-storage",
      partialize: (state) => ({ items: state.items }),
    }
  )
);
