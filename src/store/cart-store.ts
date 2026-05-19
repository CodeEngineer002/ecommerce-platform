import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

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
  /**
   * Optimistically removes an item from serverCart immediately.
   * Recalculates item_count + pricing without waiting for the API.
   * Call restoreServerCart() to roll back if the API fails.
   */
  removeItemFromServerCart: (variantId: string) => void;
  /**
   * Optimistically updates an item's quantity in serverCart immediately.
   * Call restoreServerCart() to roll back if the API fails.
   */
  updateItemQtyInServerCart: (variantId: string, quantity: number) => void;
  /** Instantly restores a previously saved serverCart snapshot (used in onError). */
  restoreServerCart: (snapshot: CartSummary) => void;

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
  devtools(
  persist(
    (set, get) => ({
      // ── Server cart ──────────────────────────────────────────────────────
      serverCart: null,
      serverCartId: null,
      serverCartWarnings: [],

      setServerCart: (cart) =>
        set({
          serverCart:          cart,
          serverCartId:        cart?.id ?? null,
          serverCartWarnings:  cart?.warnings ?? [],
          // Sync persistedItems so useCartHydration can hydrate items on
          // the rare guest/no-localStorage path.
          persistedItems: cart
            ? cart.items.map((i) => ({ variant_id: i.variant_id, quantity: i.quantity }))
            : get().persistedItems,
          // NOTE: `items` is intentionally NOT synced here.
          // `items` (CartItemWithProduct[]) requires full variant/product
          // enrichment that serverCart.items (CartItemDetail) does not carry.
          // All display consumers must read serverCart.items directly.
          // The checkout payload already uses serverCart.items via cartItemsPayload.
          // Only guest users (no serverCart) rely on items via useCartHydration.
        }, false, "setServerCart"),

      removeItemFromServerCart: (variantId) => {
        const current = get().serverCart;
        if (!current) return;
        const removed = current.items.find((i) => i.variant_id === variantId);
        if (!removed) return;
        const lineTotal = removed.current_unit_price * removed.quantity;
        const newItems = current.items.filter((i) => i.variant_id !== variantId);
        set({
          serverCart: {
            ...current,
            items: newItems,
            item_count: Math.max(0, current.item_count - removed.quantity),
            pricing: {
              ...current.pricing,
              subtotal: Math.max(0, current.pricing.subtotal - lineTotal),
              total: Math.max(0, current.pricing.total - lineTotal),
            },
          },
          persistedItems: newItems.map((i) => ({ variant_id: i.variant_id, quantity: i.quantity })),
        }, false, "removeItemFromServerCart");
      },

      updateItemQtyInServerCart: (variantId, quantity) => {
        const current = get().serverCart;
        if (!current) return;
        const item = current.items.find((i) => i.variant_id === variantId);
        if (!item) return;
        const qtyDiff = quantity - item.quantity;
        const priceDiff = item.current_unit_price * qtyDiff;
        const newItems = current.items.map((i) =>
          i.variant_id === variantId ? { ...i, quantity } : i,
        );
        set({
          serverCart: {
            ...current,
            items: newItems,
            item_count: Math.max(0, current.item_count + qtyDiff),
            pricing: {
              ...current.pricing,
              subtotal: Math.max(0, current.pricing.subtotal + priceDiff),
              total: Math.max(0, current.pricing.total + priceDiff),
            },
          },
          persistedItems: newItems.map((i) => ({ variant_id: i.variant_id, quantity: i.quantity })),
        }, false, "updateItemQtyInServerCart");
      },

      restoreServerCart: (snapshot) => {
        set({
          serverCart: snapshot,
          serverCartId: snapshot.id,
          serverCartWarnings: snapshot.warnings ?? [],
          persistedItems: snapshot.items.map((i) => ({ variant_id: i.variant_id, quantity: i.quantity })),
        }, false, "restoreServerCart");
      },

      // ── Legacy in-memory state ────────────────────────────────────────────
      items: [],
      persistedItems: [],
      isOpen: false,

      setItems: (items) => set({ items }, false, "setItems"),

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
        }, false, "addItem");
      },

      removeItem: (variantId) => {
        set((state) => ({
          items: state.items.filter((i) => i.variant_id !== variantId),
          persistedItems: state.persistedItems.filter((i) => i.variant_id !== variantId),
        }), false, "removeItem");
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
        }), false, "updateQuantity");
      },

      clearCart: () => set({ items: [], persistedItems: [], serverCart: null, serverCartId: null, serverCartWarnings: [] }, false, "clearCart"),

      openCart: () => set({ isOpen: true }, false, "openCart"),
      closeCart: () => set({ isOpen: false }, false, "closeCart"),
      toggleCart: () => set((state) => ({ isOpen: !state.isOpen }), false, "toggleCart"),

      itemCount: () => {
        // Prefer server cart count when available
        const s = get();
        if (s.serverCart) return s.serverCart.item_count;
        return s.persistedItems.reduce((sum, i) => sum + i.quantity, 0);
      },

      subtotal: () => {
        const s = get();
        // serverCart pricing is authoritative — always prefer it.
        if (s.serverCart) return s.serverCart.pricing.subtotal;
        // Guest fallback: items enriched by useCartHydration (has variant/product data).
        // For logged-in users, serverCart is always present so this branch only
        // runs during the cold-start gap before useServerCart resolves.
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
  { name: "ShopNest/cart" },
  ),
);
