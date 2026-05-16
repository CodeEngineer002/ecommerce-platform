"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import { useCartStore } from "@/store/cart-store";
import type { CartSummary } from "@/domain/cart/types";
import type { CartItemWithProduct } from "@/types";

/**
 * Ensures a server cart exists and returns its id.
 * If the store has no serverCartId yet, calls GET /api/cart to create one.
 */
async function ensureCartId(): Promise<string> {
  const id = useCartStore.getState().serverCartId;
  if (id) return id;
  const res = await fetch("/api/cart");
  if (!res.ok) throw new Error("Failed to create cart");
  const { data } = (await res.json()) as { data: CartSummary };
  useCartStore.getState().setServerCart(data);
  return data.id;
}

// ── Add Item ──────────────────────────────────────────────────────────────────

export interface AddCartItemVars {
  variantId: string;
  quantity: number;
  /** Pre-built CartItemWithProduct used for optimistic Zustand update */
  optimisticItem: CartItemWithProduct;
}

/**
 * Adds an item via POST /api/cart/[cartId]/items.
 * Optimistically updates Zustand; rolls back on error.
 */
export function useAddCartItem() {
  const queryClient = useQueryClient();
  const addItemStore = useCartStore((s) => s.addItem);
  const removeItemStore = useCartStore((s) => s.removeItem);

  return useMutation<CartSummary, Error, AddCartItemVars, { variantId: string }>({
    onMutate: ({ optimisticItem }) => {
      addItemStore(optimisticItem);
      return { variantId: optimisticItem.variant_id };
    },
    mutationFn: async ({ variantId, quantity }): Promise<CartSummary> => {
      const cartId = await ensureCartId();
      const res = await fetch(`/api/cart/${cartId}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variant_id: variantId, quantity }),
      });
      if (!res.ok) {
        const { error } = (await res.json()) as { error?: { message?: string } };
        throw new Error(error?.message ?? "Failed to add item to cart");
      }
      const { data } = (await res.json()) as { data: CartSummary };
      return data;
    },
    onSuccess: (cart) => {
      useCartStore.getState().setServerCart(cart);
      queryClient.invalidateQueries({ queryKey: queryKeys.cart.session });
    },
    onError: (_err, _vars, context) => {
      if (context?.variantId) removeItemStore(context.variantId);
    },
  });
}

// ── Remove Item ───────────────────────────────────────────────────────────────

export interface RemoveCartItemVars {
  variantId: string;
}

interface RemoveContext {
  snapshot: import("@/domain/cart/types").CartSummary | null;
  variantId: string;
}

/**
 * Removes an item via DELETE /api/cart/[cartId]/items/[variantId].
 *
 * Optimistically updates BOTH legacy items array AND serverCart immediately so:
 * - Cart drawer list → item gone instantly
 * - Cart badge count → decrements instantly
 * - Cart drawer subtotal → updates instantly
 * - Checkout order summary → item gone instantly (reads serverCart.items)
 *
 * On error: restores from in-memory snapshot (no API round trip needed).
 */
export function useRemoveCartItem() {
  const queryClient = useQueryClient();
  const removeItemStore = useCartStore((s) => s.removeItem);

  return useMutation<CartSummary, Error, RemoveCartItemVars, RemoveContext>({
    onMutate: ({ variantId }) => {
      const snapshot = useCartStore.getState().serverCart;
      // Update legacy items array (for cart drawer list rendering)
      removeItemStore(variantId);
      // Update serverCart immediately (badge, subtotal, checkout summary)
      useCartStore.getState().removeItemFromServerCart(variantId);
      return { snapshot, variantId };
    },
    mutationFn: async ({ variantId }): Promise<CartSummary> => {
      const cartId = await ensureCartId();
      const res = await fetch(`/api/cart/${cartId}/items/${variantId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const { error } = (await res.json()) as { error?: { message?: string } };
        throw new Error(error?.message ?? "Failed to remove item");
      }
      const { data } = (await res.json()) as { data: CartSummary };
      return data;
    },
    onSuccess: (cart) => {
      useCartStore.getState().setServerCart(cart);
      // Update cache directly — avoids a redundant GET /api/cart refetch
      queryClient.setQueryData(queryKeys.cart.session, cart);
    },
    onError: (_err, _vars, context) => {
      // Instant in-memory rollback — no API round trip
      if (context?.snapshot) {
        useCartStore.getState().restoreServerCart(context.snapshot);
        queryClient.setQueryData(queryKeys.cart.session, context.snapshot);
      } else {
        // No snapshot (edge case: serverCart was null) — fall back to refetch
        queryClient.invalidateQueries({ queryKey: queryKeys.cart.session });
      }
    },
  });
}

// ── Update Quantity ───────────────────────────────────────────────────────────

export interface UpdateCartQuantityVars {
  variantId: string;
  quantity: number;
}

interface UpdateQtyContext {
  snapshot: import("@/domain/cart/types").CartSummary | null;
  variantId: string;
  previousQty: number;
}

/**
 * Updates quantity via PATCH /api/cart/[cartId]/items/[variantId].
 *
 * Optimistically updates BOTH legacy items AND serverCart immediately.
 * On error: restores from in-memory snapshot.
 */
export function useUpdateCartQuantity() {
  const queryClient = useQueryClient();
  const updateQtyStore = useCartStore((s) => s.updateQuantity);

  return useMutation<CartSummary, Error, UpdateCartQuantityVars, UpdateQtyContext>({
    onMutate: ({ variantId, quantity }) => {
      const snapshot = useCartStore.getState().serverCart;
      const previousQty =
        snapshot?.items.find((i) => i.variant_id === variantId)?.quantity ?? quantity;
      // Update legacy items array
      updateQtyStore(variantId, quantity);
      // Update serverCart immediately
      useCartStore.getState().updateItemQtyInServerCart(variantId, quantity);
      return { snapshot, variantId, previousQty };
    },
    mutationFn: async ({ variantId, quantity }): Promise<CartSummary> => {
      const cartId = await ensureCartId();
      const res = await fetch(`/api/cart/${cartId}/items/${variantId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity }),
      });
      if (!res.ok) {
        const { error } = (await res.json()) as { error?: { message?: string } };
        throw new Error(error?.message ?? "Failed to update quantity");
      }
      const { data } = (await res.json()) as { data: CartSummary };
      return data;
    },
    onSuccess: (cart) => {
      useCartStore.getState().setServerCart(cart);
      queryClient.setQueryData(queryKeys.cart.session, cart);
    },
    onError: (_err, _vars, context) => {
      if (context?.snapshot) {
        useCartStore.getState().restoreServerCart(context.snapshot);
        queryClient.setQueryData(queryKeys.cart.session, context.snapshot);
      } else {
        queryClient.invalidateQueries({ queryKey: queryKeys.cart.session });
      }
    },
  });
}
