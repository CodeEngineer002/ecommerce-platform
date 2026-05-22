import { calculatePricing } from "@/domain/pricing/pricing-engine";
import type { LineItem } from "@/domain/pricing/types";
import { apiFetch } from "@/lib/api";
import { createClient } from "@/lib/supabase/client";
import type { CheckoutPayload, OrderWithItems } from "@/types";

export async function getOrders(userId: string): Promise<OrderWithItems[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("orders")
    .select(
      `
      *,
      items:order_items(*),
      payment:payments(*)
    `,
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as unknown as OrderWithItems[];
}

export async function getOrderById(orderId: string): Promise<OrderWithItems | null> {
  const supabase = createClient();
  const { data } = await supabase
    .from("orders")
    .select(
      `
      *,
      items:order_items(*),
      payment:payments(*)
    `,
    )
    .eq("id", orderId)
    .single();

  return data as unknown as OrderWithItems | null;
}

export function calculatePriceBreakdown(items: { quantity: number; price: number }[]) {
  const lineItems: LineItem[] = items.map((i) => ({
    variantId:   "",
    quantity:    i.quantity,
    unitPrice:   i.price,
    productName: "",
  }));
  const { subtotal, tax, shipping, discount, total } = calculatePricing(lineItems);
  return { subtotal, tax, shipping, discount, total };
}

export interface CreateOrderResult {
  orderId: string;
  /** Present only for Stripe payments — use to mount Stripe Payment Element. */
  clientSecret?: string;
  providerOrderId?: string;
}

export async function createOrder(payload: CheckoutPayload): Promise<CreateOrderResult> {
  // Extract the idempotency key — it must be sent as a header, not in the
  // request body. The API reads request.headers.get("Idempotency-Key") and
  // ignores anything in the JSON body with that name.
  const { idempotencyKey, ...bodyPayload } = payload;

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (idempotencyKey) {
    headers["Idempotency-Key"] = idempotencyKey;
  }

  const res = await fetch("/api/orders/create", {
    method:  "POST",
    headers,
    body:    JSON.stringify(bodyPayload),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message ?? "Failed to create order");
  }

  const { data } = await res.json();
  return {
    orderId:         data.orderId,
    clientSecret:    data.clientSecret,
    providerOrderId: data.providerOrderId,
  };
}

export async function cancelOrder(orderId: string, reason?: string): Promise<void> {
  await apiFetch(`/api/orders/${orderId}/cancel`, {
    method: "POST",
    body:   JSON.stringify({ reason }),
  });
}

/** REST DELETE /api/orders/[id] — cancel via standard HTTP DELETE */
export async function deleteOrder(orderId: string, reason?: string): Promise<void> {
  await apiFetch(`/api/orders/${orderId}`, {
    method: "DELETE",
    body:   JSON.stringify({ reason }),
  });
}

export interface ReturnItem {
  order_item_id: string;
  quantity:      number;
  reason?:       string;
  condition?:    "unopened" | "good" | "damaged" | "defective";
}

export async function createReturnRequest(
  orderId:      string,
  requestType:  "return" | "replacement",
  reason:       string,
  items:        ReturnItem[],
): Promise<string> {
  const { data } = await apiFetch<{ returnId: string }>(`/api/orders/${orderId}/returns`, {
    method: "POST",
    body:   JSON.stringify({ request_type: requestType, reason, items }),
  });
  return data.returnId;
}

export async function getReturnRequests(orderId: string) {
  const { data } = await apiFetch<unknown[]>(`/api/orders/${orderId}/returns`);
  return data;
}

export async function cancelReturnRequest(
  orderId:   string,
  requestId: string,
  reason?:   string,
): Promise<void> {
  await apiFetch(`/api/orders/${orderId}/returns/${requestId}`, {
    method: "DELETE",
    body:   JSON.stringify({ reason }),
  });
}

export async function getOrderFulfillment(orderId: string) {
  const supabase = createClient();
  const { data } = await supabase
    .from("order_fulfillments")
    .select("*")
    .eq("order_id", orderId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}
