"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";

import { ROUTES } from "@/lib/constants";
import { useCartStore } from "@/store/cart-store";
import type { CheckoutPayload } from "@/types";

import { createOrder, getOrderById, getOrders } from "../services/order.service";

export const orderKeys = {
  all: ["orders"] as const,
  list: (userId: string) => [...orderKeys.all, "list", userId] as const,
  detail: (id: string) => [...orderKeys.all, "detail", id] as const,
};

export function useOrders(userId: string) {
  return useQuery({
    queryKey: orderKeys.list(userId),
    queryFn: () => getOrders(userId),
    enabled: !!userId,
  });
}

export function useOrder(orderId: string) {
  return useQuery({
    queryKey: orderKeys.detail(orderId),
    queryFn: () => getOrderById(orderId),
    enabled: !!orderId,
  });
}

export function useCreateOrder() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { clearCart } = useCartStore();

  return useMutation({
    mutationFn: (payload: CheckoutPayload) => createOrder(payload),
    onSuccess: (orderId) => {
      clearCart();
      queryClient.invalidateQueries({ queryKey: orderKeys.all });
      router.push(ROUTES.orderSuccess(orderId));
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}
