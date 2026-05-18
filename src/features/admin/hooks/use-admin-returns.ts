"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

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

export function useAdminReturns(statusFilter: string) {
  const [returns, setReturns] = useState<AdminReturnRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchReturns = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = statusFilter !== "all" ? `?status=${statusFilter}` : "";
      const { data } = await apiFetch<AdminReturnRequest[]>(`/api/admin/returns${params}`);
      setReturns(data ?? []);
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
