import { createClient } from "@/lib/supabase/client";
import type { OrderStatus, OrderWithItems } from "@/types";

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
      { count: "exact" }
    )
    .order("created_at", { ascending: false })
    .range(from, from + pageSize - 1);

  if (error) throw error;
  return { data: (data ?? []) as unknown as OrderWithItems[], count: count ?? 0 };
}

export async function adminUpdateOrderStatus(
  orderId: string,
  status: OrderStatus
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("orders")
    .update({ status })
    .eq("id", orderId);
  if (error) throw error;
}

export async function adminGetOrderStats() {
  const supabase = createClient();

  const [{ count: totalOrders }, { data: revenue }, { count: pendingOrders }] = await Promise.all([
    supabase.from("orders").select("*", { count: "exact", head: true }),
    supabase.from("orders").select("total").eq("status", "delivered"),
    supabase
      .from("orders")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending"),
  ]);

  const totalRevenue = revenue?.reduce((sum, o) => sum + o.total, 0) ?? 0;

  return {
    totalOrders: totalOrders ?? 0,
    totalRevenue,
    pendingOrders: pendingOrders ?? 0,
  };
}
