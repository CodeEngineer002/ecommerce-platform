"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export interface AdminReturnItem {
  id: string;
  order_item_id: string;
  quantity: number;
  reason: string | null;
  condition: string | null;
  order_item: { product_name: string; variant_name: string | null } | null;
}

export interface AdminReturnRequest {
  id: string;
  order_id: string;
  request_type: string;
  reason: string;
  status: string;
  created_at: string;
  reviewed_at: string | null;
  review_note: string | null;
  order: { order_number: string } | null;
  items: AdminReturnItem[];
}

/**
 * Fetches admin return requests directly via the Supabase browser client.
 * Access is protected by the "Admins manage returns" RLS policy (is_admin()).
 * Bypasses the API route to avoid service-client nested-join issues.
 */
export function useAdminReturns(statusFilter: string) {
  const [returns, setReturns] = useState<AdminReturnRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchReturns = useCallback(async () => {
    setIsLoading(true);
    try {
      const supabase = createClient();

      // Step 1: fetch return requests + parent order number
      let query = supabase
        .from("order_returns")
        .select(
          // Use explicit FK hint to resolve ambiguity:
          // order_returns has two FK paths to orders
          // (order_returns_order_id_fkey and orders_replacement_request_id_fkey)
          `id,
          order_id,
          request_type,
          reason,
          status,
          created_at,
          reviewed_at,
          review_note,
          order:orders!order_returns_order_id_fkey(order_number)`,
        )
        .order("created_at", { ascending: false });

      if (statusFilter !== "all") {
        if (statusFilter === "closed") {
          query = query.in("status", [
            "refunded",
            "replaced",
            "closed",
            "rejected_after_inspection",
            "accepted",
          ]);
        } else {
          query = query.eq("status", statusFilter);
        }
      }

      const { data: returnsData, error: returnsError } = await query;
      if (returnsError) throw returnsError;
      if (!returnsData?.length) { setReturns([]); return; }

      // Step 2: fetch return items separately (avoids nested-join issues)
      const returnIds = returnsData.map((r) => r.id);
      const { data: itemsData } = await supabase
        .from("order_return_items")
        .select("id, return_id, order_item_id, quantity, reason, condition")
        .in("return_id", returnIds);

      // Step 3: fetch product names for the order items
      const orderItemIds = [...new Set((itemsData ?? []).map((i) => i.order_item_id))];
      let productMap: Record<string, { product_name: string; variant_name: string | null }> = {};

      if (orderItemIds.length > 0) {
        const { data: orderItems } = await supabase
          .from("order_items")
          .select("id, product_name, variant_name")
          .in("id", orderItemIds);

        productMap = Object.fromEntries(
          (orderItems ?? []).map((oi) => [
            oi.id,
            { product_name: oi.product_name, variant_name: oi.variant_name },
          ]),
        );
      }

      // Step 4: group items by return_id and merge
      const itemsByReturn: Record<string, typeof itemsData> = {};
      for (const item of itemsData ?? []) {
        if (!itemsByReturn[item.return_id]) itemsByReturn[item.return_id] = [];
        itemsByReturn[item.return_id]!.push(item);
      }

      const merged: AdminReturnRequest[] = returnsData.map((ret) => ({
        ...ret,
        order: ret.order as { order_number: string } | null,
        items: (itemsByReturn[ret.id] ?? []).map((item) => ({
          id:            item.id,
          order_item_id: item.order_item_id,
          quantity:      item.quantity,
          reason:        item.reason,
          condition:     item.condition,
          order_item:    productMap[item.order_item_id] ?? null,
        })),
      }));

      setReturns(merged);
    } catch {
      setReturns([]);
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchReturns();
  }, [fetchReturns]);

  return { returns, isLoading, refetch: fetchReturns };
}
