import { FREE_SHIPPING_THRESHOLD, SHIPPING_COST, TAX_RATE } from "@/lib/constants";
import { createClient } from "@/lib/supabase/client";
import type { CheckoutPayload, OrderWithItems, PriceBreakdown } from "@/types";

export async function getOrders(userId: string): Promise<OrderWithItems[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("orders")
    .select(
      `
      *,
      items:order_items(*),
      payment:payments(*)
    `
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
    `
    )
    .eq("id", orderId)
    .single();

  return data as unknown as OrderWithItems | null;
}

export function calculatePriceBreakdown(
  items: { quantity: number; price: number }[]
): PriceBreakdown {
  const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const tax = Math.round(subtotal * TAX_RATE * 100) / 100;
  const shipping = subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_COST;

  return {
    subtotal,
    tax,
    shipping,
    discount: 0,
    total: subtotal + tax + shipping,
  };
}

export async function applyCoupon(
  code: string,
  subtotal: number
): Promise<{ discount: number; couponId: string } | null> {
  const supabase = createClient();
  const { data: coupon } = await supabase
    .from("coupons")
    .select("*")
    .eq("code", code.toUpperCase())
    .eq("is_active", true)
    .single();

  if (!coupon) return null;
  if (coupon.valid_until && new Date(coupon.valid_until) < new Date()) return null;
  if (coupon.min_order_value && subtotal < coupon.min_order_value) return null;
  if (coupon.usage_limit && coupon.used_count >= coupon.usage_limit) return null;

  const discount =
    coupon.type === "percentage"
      ? Math.round((subtotal * coupon.value) / 100)
      : coupon.value;

  const finalDiscount = coupon.max_discount
    ? Math.min(discount, coupon.max_discount)
    : discount;

  return { discount: finalDiscount, couponId: coupon.id };
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

  const { orderId } = await res.json();
  return orderId;
}
