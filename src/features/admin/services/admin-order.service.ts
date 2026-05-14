import type { OrderStatus } from "@/domain/order/order-state-machine";
import { apiFetch } from "@/lib/api";
import { createClient } from "@/lib/supabase/client";
import type { OrderWithItems } from "@/types";

export async function adminGetOrders(page = 1, pageSize = 20) {
  const supabase = createClient();
  const from = (page - 1) * pageSize;

  const { data, count, error } = await supabase
    .from("orders")
    .select(
      `
      *,
      items:order_items(*),
      payment:payments(*)
    `,
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range(from, from + pageSize - 1);

  if (error) throw error;
  return { data: (data ?? []) as unknown as OrderWithItems[], count: count ?? 0 };
}

/**
 * Updates order status through the API route that enforces the state machine.
 */
export async function adminUpdateOrderStatus(
  orderId: string,
  status:  OrderStatus,
  reason?: string,
): Promise<void> {
  await apiFetch(`/api/admin/orders/${orderId}/status`, {
    method: "PATCH",
    body:   JSON.stringify({ status, reason }),
  });
}

export async function adminGetOrderStats() {
  const supabase = createClient();

  const [{ count: totalOrders }, { data: revenue }, { count: pendingOrders }] = await Promise.all([
    supabase.from("orders").select("*", { count: "exact", head: true }),
    supabase.from("orders").select("total").eq("status", "delivered"),
    supabase.from("orders").select("*", { count: "exact", head: true }).eq("status", "pending"),
  ]);

  const totalRevenue = revenue?.reduce((sum, o) => sum + o.total, 0) ?? 0;

  return {
    totalOrders:   totalOrders ?? 0,
    totalRevenue,
    pendingOrders: pendingOrders ?? 0,
  };
}

export async function adminGetReturns(page = 1, pageSize = 20) {
  const supabase = createClient();
  const from = (page - 1) * pageSize;

  const { data, count, error } = await supabase
    .from("order_returns")
    .select("*, items:order_return_items(*)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, from + pageSize - 1);

  if (error) throw error;
  return { data: data ?? [], count: count ?? 0 };
}

export async function adminApproveReturn(returnId: string, note?: string): Promise<void> {
  await apiFetch(`/api/admin/returns/${returnId}`, {
    method: "PATCH",
    body:   JSON.stringify({ action: "approve", note }),
  });
}

export async function adminRejectReturn(returnId: string, reason: string): Promise<void> {
  await apiFetch(`/api/admin/returns/${returnId}`, {
    method: "PATCH",
    body:   JSON.stringify({ action: "reject", note: reason }),
  });
}

export interface RefundItemPayload {
  order_item_id: string;
  quantity:      number;
}

export async function adminIssueRefund(
  orderId:        string,
  reason:         string,
  refundItems:    RefundItemPayload[],
  refundShipping: boolean = false,
  returnId?:      string,
): Promise<{ refundId: string; amount: number; refundType: string }> {
  const { data } = await apiFetch<{ refundId: string; amount: number; refundType: string }>(
    `/api/admin/orders/${orderId}/refund`,
    {
      method: "POST",
      body:   JSON.stringify({
        reason,
        refund_items:    refundItems,
        refund_shipping: refundShipping,
        return_id:       returnId,
      }),
    },
  );
  return data;
}

export async function adminGetOrderNotes(orderId: string) {
  const { data } = await apiFetch<unknown[]>(`/api/admin/orders/${orderId}/notes`);
  return data;
}

export async function adminAddOrderNote(
  orderId:    string,
  content:    string,
  isInternal: boolean = true,
): Promise<void> {
  await apiFetch(`/api/admin/orders/${orderId}/notes`, {
    method: "POST",
    body:   JSON.stringify({ content, is_internal: isInternal }),
  });
}

export async function adminCreateFulfillment(
  orderId: string,
  payload: {
    carrier?:            string;
    tracking_number?:    string;
    tracking_url?:       string;
    estimated_delivery?: string;
    notes?:              string;
  },
): Promise<string> {
  const { data } = await apiFetch<{ fulfillmentId: string }>(
    `/api/admin/orders/${orderId}/fulfillment`,
    {
      method: "POST",
      body:   JSON.stringify(payload),
    },
  );
  return data.fulfillmentId;
}

export async function adminUpdateFulfillment(
  orderId:       string,
  fulfillmentId: string,
  payload: {
    carrier?:            string;
    tracking_number?:    string;
    tracking_url?:       string;
    status?:             "processing" | "packed" | "shipped" | "out_for_delivery" | "delivered" | "failed";
    estimated_delivery?: string;
  },
): Promise<void> {
  await apiFetch(`/api/admin/orders/${orderId}/fulfillment`, {
    method: "PATCH",
    body:   JSON.stringify({ fulfillment_id: fulfillmentId, ...payload }),
  });
}

export async function adminGetFulfillments(orderId: string) {
  const { data } = await apiFetch<unknown[]>(`/api/admin/orders/${orderId}/fulfillment`);
  return data;
}

export async function adminGetOrderTimeline(orderId: string) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("order_events")
    .select("*")
    .eq("order_id", orderId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}
