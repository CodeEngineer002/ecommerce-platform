"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";

import { ROUTES } from "@/lib/constants";
import { queryKeys } from "@/lib/query-keys";
import { useCartStore } from "@/store/cart-store";
import type { CheckoutPayload } from "@/types";

import { createOrder, deleteOrder, getOrderById, getOrders, createReturnRequest, cancelReturnRequest, type ReturnItem, type CreateOrderResult } from "../services/order.service";

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

export function useCreateOrder() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { clearCart, setServerCart } = useCartStore();

  return useMutation<CreateOrderResult, Error, CheckoutPayload>({
    mutationFn: (payload: CheckoutPayload) => createOrder(payload),
    onSuccess: (result) => {
      if (!result.clientSecret) {
        // COD path — clear cart and redirect to success page immediately.
        clearCart();
        setServerCart(null);
        queryClient.removeQueries({ queryKey: queryKeys.cart.session });
        queryClient.invalidateQueries({ queryKey: orderKeys.all });
        router.push(ROUTES.orderSuccess(result.orderId));
      }
      // Stripe path — clientSecret is present; the checkout page watches
      // mutation.data and renders the Stripe Payment Element.
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

export function useCancelReturnRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      orderId,
      requestId,
      reason,
    }: {
      orderId:   string;
      requestId: string;
      reason?:   string;
    }) => cancelReturnRequest(orderId, requestId, reason),
    onSuccess: (_data, { orderId }) => {
      queryClient.invalidateQueries({ queryKey: orderKeys.detail(orderId) });
      queryClient.invalidateQueries({ queryKey: orderKeys.all });
      toast.success("Request cancelled successfully");
    },
    onError: (error: Error) => {
      toast.error(error.message ?? "Failed to cancel request");
    },
  });
}

export function useRequestReturn() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      orderId,
      requestType,
      reason,
      items,
    }: {
      orderId:      string;
      requestType:  "return" | "replacement";
      reason:       string;
      items:        ReturnItem[];
    }) => createReturnRequest(orderId, requestType, reason, items),
    onSuccess: (_data, { orderId }) => {
      queryClient.invalidateQueries({ queryKey: orderKeys.detail(orderId) });
      toast.success("Return request submitted successfully");
    },
    onError: (error: Error) => {
      toast.error(error.message ?? "Failed to submit return request");
    },
  });
}
