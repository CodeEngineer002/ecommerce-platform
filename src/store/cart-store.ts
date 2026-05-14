import { create } from "zustand";
import { persist } from "zustand/middleware";

import { CART_MAX_QUANTITY } from "@/lib/constants";
import type { CartItemWithProduct } from "@/types";
import type { CartSummary, CartWarning } from "@/domain/cart/types";

// Only this minimal shape is written to localStorage.
// Full product data (price, images) is always fetched fresh on hydration.
export interface PersistedCartItem {
  variant_id: string;
  quantity: number;
}

interface CartState {
  // ── Server cart state ──────────────────────────────────────────────────────
  // The server cart is the source of truth.
  // serverCart is populated by the useServerCart hook on mount and after mutations.
  serverCart: CartSummary | null;
  serverCartId: string | null;
  serverCartWarnings: CartWarning[];

  // ── In-memory enriched items (legacy, used by existing UI components) ──────
  // Populated by useCartHydration hook from server cart data.
  items: CartItemWithProduct[];
  // Persisted minimal items — kept for offline/SSR fallback only.
  // Source of truth is now serverCart when available.
  persistedItems: PersistedCartItem[];
  isOpen: boolean;

  // ── Server cart actions ────────────────────────────────────────────────────
  setServerCart: (cart: CartSummary | null) => void;

  // ── Sync actions (legacy — optimistic updates while server syncs) ──────────
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
      // ── Server cart ──────────────────────────────────────────────────────
      serverCart: null,
      serverCartId: null,
      serverCartWarnings: [],

      setServerCart: (cart) =>
        set({
          serverCart: cart,
          serverCartId: cart?.id ?? null,
          serverCartWarnings: cart?.warnings ?? [],
          // Sync persistedItems from server cart so itemCount stays accurate
          persistedItems: cart
            ? cart.items.map((i) => ({ variant_id: i.variant_id, quantity: i.quantity }))
            : get().persistedItems,
        }),

      // ── Legacy in-memory state ────────────────────────────────────────────
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

      clearCart: () => set({ items: [], persistedItems: [], serverCart: null, serverCartId: null, serverCartWarnings: [] }),

      openCart: () => set({ isOpen: true }),
      closeCart: () => set({ isOpen: false }),
      toggleCart: () => set((state) => ({ isOpen: !state.isOpen })),

      itemCount: () => {
        // Prefer server cart count when available
        const s = get();
        if (s.serverCart) return s.serverCart.item_count;
        return s.persistedItems.reduce((sum, i) => sum + i.quantity, 0);
      },

      subtotal: () => {
        const s = get();
        if (s.serverCart) return s.serverCart.pricing.subtotal;
        return s.items.reduce((sum, i) => {
          const price = i.variant.price ?? i.variant.product.base_price;
          return sum + price * i.quantity;
        }, 0);
      },

      hasItem: (variantId) =>
        get().persistedItems.some((i) => i.variant_id === variantId),
    }),
    {
      name: "cart-storage",
      // Only persist the minimal shape — never stale product data.
      // serverCart is not persisted (always fetched fresh on mount).
      partialize: (state) => ({ persistedItems: state.persistedItems }),
    },
  ),
);
