"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";

import { ROUTES } from "@/lib/constants";
import { queryKeys } from "@/lib/query-keys";
import { useCartStore } from "@/store/cart-store";
import type { CheckoutPayload } from "@/types";

import { createOrder, deleteOrder, getOrderById, getOrders, createReturnRequest, type ReturnItem } from "../services/order.service";

export const orderKeys = queryKeys.orders;

export function useOrders(userId: string) {
  return useQuery({
    queryKey: queryKeys.orders.list(userId),
    queryFn: () => getOrders(userId),
    enabled: !!userId,
    // 30s: users check their order status frequently; keep it fresh
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
  });
}

export function useOrder(orderId: string) {
  return useQuery({
    queryKey: queryKeys.orders.detail(orderId),
    queryFn: () => getOrderById(orderId),
    enabled: !!orderId,
    // 1 min: order detail (status tracking)
    staleTime: 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: true,
  });
}

export function useCreateOrder() {  const router = useRouter();
  const queryClient = useQueryClient();
  const { clearCart, setServerCart } = useCartStore();

  return useMutation({
    mutationFn: (payload: CheckoutPayload) => createOrder(payload),
    onSuccess: (orderId) => {
      // Clear Zustand immediately so UI shows empty cart
      clearCart();
      setServerCart(null);
      // Remove cached cart data so next fetch is fresh
      queryClient.removeQueries({ queryKey: queryKeys.cart.session });
      queryClient.invalidateQueries({ queryKey: orderKeys.all });
      router.push(ROUTES.orderSuccess(orderId));
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

export function useCancelOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ orderId, reason }: { orderId: string; reason?: string }) =>
      deleteOrder(orderId, reason),
    onSuccess: (_data, { orderId }) => {
      // Invalidate both list and detail so UI refreshes
      queryClient.invalidateQueries({ queryKey: orderKeys.all });
      queryClient.invalidateQueries({ queryKey: orderKeys.detail(orderId) });
      toast.success("Order cancelled successfully");
    },
    onError: (error: Error) => {
      toast.error(error.message ?? "Failed to cancel order");
    },
  });
}

export function useRequestReturn() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      orderId,
      reason,
      items,
    }: {
      orderId: string;
      reason:  string;
      items:   ReturnItem[];
    }) => createReturnRequest(orderId, reason, items),
    onSuccess: (_data, { orderId }) => {
      queryClient.invalidateQueries({ queryKey: orderKeys.detail(orderId) });
      toast.success("Return request submitted successfully");
    },
    onError: (error: Error) => {
      toast.error(error.message ?? "Failed to submit return request");
    },
  });
}
