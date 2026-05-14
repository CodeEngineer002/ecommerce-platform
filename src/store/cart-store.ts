import { create } from "zustand";
import { persist } from "zustand/middleware";

import { CART_MAX_QUANTITY } from "@/lib/constants";
import type { CartItemWithProduct } from "@/types";

// Only this minimal shape is written to localStorage.
// Full product data (price, images) is always fetched fresh on hydration.
export interface PersistedCartItem {
  variant_id: string;
  quantity: number;
}

interface CartState {
  // In-memory enriched items — populated by useCartHydration hook
  items: CartItemWithProduct[];
  // Persisted minimal items — source of truth across page loads
  persistedItems: PersistedCartItem[];
  isOpen: boolean;

  // Sync actions
  setItems: (items: CartItemWithProduct[]) => void;
  addItem: (item: CartItemWithProduct) => void;
  removeItem: (variantId: string) => void;
  updateQuantity: (variantId: string, quantity: number) => void;
  clearCart: () => void;

  // Drawer actions
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
      persistedItems: [],
      isOpen: false,

      setItems: (items) => set({ items }),

      addItem: (item) => {
        set((state) => {
          const existingEnriched = state.items.find((i) => i.variant_id === item.variant_id);
          const existingPersisted = state.persistedItems.find(
            (i) => i.variant_id === item.variant_id,
          );

          if (existingEnriched && existingPersisted) {
            const newQty = Math.min(
              existingPersisted.quantity + item.quantity,
              CART_MAX_QUANTITY,
            );
            return {
              items: state.items.map((i) =>
                i.variant_id === item.variant_id ? { ...i, quantity: newQty } : i,
              ),
              persistedItems: state.persistedItems.map((i) =>
                i.variant_id === item.variant_id ? { ...i, quantity: newQty } : i,
              ),
            };
          }

          return {
            items: [...state.items, item],
            persistedItems: [
              ...state.persistedItems,
              { variant_id: item.variant_id, quantity: item.quantity },
            ],
          };
        });
      },

      removeItem: (variantId) => {
        set((state) => ({
          items: state.items.filter((i) => i.variant_id !== variantId),
          persistedItems: state.persistedItems.filter((i) => i.variant_id !== variantId),
        }));
      },

      updateQuantity: (variantId, quantity) => {
        if (quantity <= 0) {
          get().removeItem(variantId);
          return;
        }
        const clamped = Math.min(quantity, CART_MAX_QUANTITY);
        set((state) => ({
          items: state.items.map((i) =>
            i.variant_id === variantId ? { ...i, quantity: clamped } : i,
          ),
          persistedItems: state.persistedItems.map((i) =>
            i.variant_id === variantId ? { ...i, quantity: clamped } : i,
          ),
        }));
      },

      clearCart: () => set({ items: [], persistedItems: [] }),

      openCart: () => set({ isOpen: true }),
      closeCart: () => set({ isOpen: false }),
      toggleCart: () => set((state) => ({ isOpen: !state.isOpen })),

      itemCount: () => get().persistedItems.reduce((sum, i) => sum + i.quantity, 0),

      subtotal: () =>
        get().items.reduce((sum, i) => {
          const price = i.variant.price ?? i.variant.product.base_price;
          return sum + price * i.quantity;
        }, 0),

      hasItem: (variantId) =>
        get().persistedItems.some((i) => i.variant_id === variantId),
    }),
    {
      name: "cart-storage",
      // Only persist the minimal shape — never stale product data
      partialize: (state) => ({ persistedItems: state.persistedItems }),
    },
  ),
);
