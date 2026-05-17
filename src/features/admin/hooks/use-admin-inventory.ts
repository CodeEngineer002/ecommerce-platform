"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-hot-toast";

import {
  getInventoryMovements,
  recordStockAdjustment,
  type StockAdjustmentParams,
  type StockAdjustmentResult,
} from "../services/admin-inventory.service";
import { adminProductKeys } from "./use-admin-products";

// ── Query keys ────────────────────────────────────────────────────────────────

export const inventoryKeys = {
  movements: {
    all: ["inventory_movements"] as const,
    filtered: (variantId?: string, type?: string, days?: number) =>
      ["inventory_movements", variantId, type, days] as const,
  },
};

// ── useStockAdjustment ────────────────────────────────────────────────────────

/**
 * Mutation to record a stock adjustment.
 * On success:
 *   - Invalidates the admin products list so inventory numbers refresh.
 *   - Invalidates the movement history cache so the History tab updates.
 *   - Shows a contextual success toast.
 */
export function useStockAdjustment() {
  const queryClient = useQueryClient();

  return useMutation<StockAdjustmentResult, Error, StockAdjustmentParams>({
    mutationFn: recordStockAdjustment,
    onSuccess: (result, vars) => {
      queryClient.invalidateQueries({ queryKey: adminProductKeys.all });
      queryClient.invalidateQueries({ queryKey: inventoryKeys.movements.all });
      toast.success(
        `Stock updated: ${result.previousQuantity} → ${result.newQuantity}`,
      );
    },
    onError: (err) => {
      toast.error(err.message ?? "Failed to update stock");
    },
  });
}

// ── useInventoryMovements ─────────────────────────────────────────────────────

/**
 * Paginated query for the movement history tab.
 * Re-fetches when variantId / movementType / days / page changes.
 */
export function useInventoryMovements(options: {
  variantId?: string;
  movementType?: "purchase" | "sale" | "return" | "adjustment" | "transfer" | "all";
  days?: number;
  page?: number;
  pageSize?: number;
}) {
  const { variantId, movementType = "all", days = 90, page = 1, pageSize = 25 } = options;
  const offset = (page - 1) * pageSize;

  return useQuery({
    queryKey: inventoryKeys.movements.filtered(variantId, movementType, days),
    queryFn: () =>
      getInventoryMovements({ variantId, movementType, days, limit: pageSize, offset }),
    staleTime: 30 * 1000,
    gcTime: 2 * 60 * 1000,
  });
}
