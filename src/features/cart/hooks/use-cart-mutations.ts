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

/**
 * Removes an item via DELETE /api/cart/[cartId]/items/[variantId].
 * Optimistically removes from Zustand; re-syncs from server on error.
 */
export function useRemoveCartItem() {
  const queryClient = useQueryClient();
  const removeItemStore = useCartStore((s) => s.removeItem);

  return useMutation<CartSummary, Error, RemoveCartItemVars>({
    onMutate: ({ variantId }) => {
      removeItemStore(variantId);
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
      queryClient.invalidateQueries({ queryKey: queryKeys.cart.session });
    },
    onError: () => {
      // Re-sync from server to restore correct state
      queryClient.invalidateQueries({ queryKey: queryKeys.cart.session });
    },
  });
}

// ── Update Quantity ───────────────────────────────────────────────────────────

export interface UpdateCartQuantityVars {
  variantId: string;
  quantity: number;
}

/**
 * Updates quantity via PATCH /api/cart/[cartId]/items/[variantId].
 * Optimistically updates Zustand; re-syncs from server on error.
 */
export function useUpdateCartQuantity() {
  const queryClient = useQueryClient();
  const updateQtyStore = useCartStore((s) => s.updateQuantity);

  return useMutation<CartSummary, Error, UpdateCartQuantityVars>({
    onMutate: ({ variantId, quantity }) => {
      updateQtyStore(variantId, quantity);
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
      queryClient.invalidateQueries({ queryKey: queryKeys.cart.session });
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.cart.session });
    },
  });
}
