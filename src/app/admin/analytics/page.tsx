import { DollarSign, Package, ShoppingBag, TrendingUp, Users } from "lucide-react";

import { PageHeader } from "@/components/common/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { formatPrice } from "@/lib/utils";

export default async function AdminAnalyticsPage() {
  const supabase = await createClient();

  const [
    { count: totalOrders },
    { count: totalProducts },
    { count: totalCustomers },
    { data: deliveredOrders },
    { data: recentOrders },
  ] = await Promise.all([
    supabase.from("orders").select("*", { count: "exact", head: true }),
    supabase.from("products").select("*", { count: "exact", head: true }).eq("is_active", true),
    supabase.from("profiles").select("*", { count: "exact", head: true }).eq("role", "customer"),
    supabase.from("orders").select("total").eq("status", "delivered"),
    supabase.from("orders").select("*").order("created_at", { ascending: false }).limit(5),
  ]);

  const totalRevenue = deliveredOrders?.reduce((sum, o) => sum + o.total, 0) ?? 0;

  const stats = [
    { title: "Total Revenue", value: formatPrice(totalRevenue), icon: DollarSign, trend: "Delivered orders" },
    { title: "Total Orders", value: String(totalOrders ?? 0), icon: ShoppingBag, trend: "All time" },
    { title: "Active Products", value: String(totalProducts ?? 0), icon: Package, trend: "Published" },
    { title: "Customers", value: String(totalCustomers ?? 0), icon: Users, trend: "Registered" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Analytics" description="Store performance overview" />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map(({ title, value, icon: Icon, trend }) => (
          <Card key={title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
              <Icon className="h-5 w-5 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{value}</p>
              <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                <TrendingUp className="h-3 w-3" /> {trend}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recent orders */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Orders</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead className="border-b">
              <tr>
                <th className="pb-2 text-left font-medium">Order #</th>
                <th className="pb-2 text-center font-medium">Status</th>
                <th className="pb-2 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {(recentOrders ?? []).map((order) => (
                <tr key={order.id}>
                  <td className="py-2 font-mono text-xs">{order.order_number}</td>
                  <td className="py-2 text-center capitalize text-muted-foreground">{order.status}</td>
                  <td className="py-2 text-right font-medium">{formatPrice(order.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
