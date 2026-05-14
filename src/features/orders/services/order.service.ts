import { calculatePricing } from "@/domain/pricing/pricing-engine";
import type { LineItem } from "@/domain/pricing/types";
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
    variantId: "",
    quantity: i.quantity,
    unitPrice: i.price,
    productName: "",
  }));
  const { subtotal, tax, shipping, discount, total } = calculatePricing(lineItems);
  return { subtotal, tax, shipping, discount, total };
}

export async function createOrder(payload: CheckoutPayload): Promise<string> {
  const res = await fetch("/api/orders/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message ?? "Failed to create order");
  }

  const { data } = await res.json();
  return data.orderId;
}
