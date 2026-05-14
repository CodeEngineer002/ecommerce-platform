"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-hot-toast";

import type { OrderStatus } from "@/types";

import {
  adminGetOrderStats,
  adminGetOrders,
  adminUpdateOrderStatus,
} from "../services/admin-order.service";

export const adminOrderKeys = {
  all: ["admin", "orders"] as const,
  list: (page: number) => [...adminOrderKeys.all, "list", page] as const,
  stats: () => [...adminOrderKeys.all, "stats"] as const,
};

export function useAdminOrders(page = 1) {
  return useQuery({
    queryKey: adminOrderKeys.list(page),
    queryFn: () => adminGetOrders(page),
  });
}

export function useAdminOrderStats() {
  return useQuery({
    queryKey: adminOrderKeys.stats(),
    queryFn: adminGetOrderStats,
  });
}

export function useAdminUpdateOrderStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ orderId, status }: { orderId: string; status: OrderStatus }) =>
      adminUpdateOrderStatus(orderId, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminOrderKeys.all });
      toast.success("Order status updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
