"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-hot-toast";

import { queryKeys } from "@/lib/query-keys";
import type { OrderStatus } from "@/types";

import {
  adminGetOrderStats,
  adminGetOrders,
  adminUpdateOrderStatus,
} from "../services/admin-order.service";

export const adminOrderKeys = queryKeys.adminOrders;

export function useAdminOrders(page = 1) {
  return useQuery({
    queryKey: queryKeys.adminOrders.list(page),
    queryFn: () => adminGetOrders(page),
    // 30s: admin sees live orders, needs fresh data
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
  });
}

export function useAdminOrderStats() {
  return useQuery({
    queryKey: queryKeys.adminOrders.stats(),
    queryFn: adminGetOrderStats,
    // 1 min: dashboard stats
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
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
