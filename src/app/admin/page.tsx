import { DollarSign, Package, ShoppingBag, Users } from "lucide-react";
import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createServiceClient } from "@/lib/supabase/server";
import { formatPrice } from "@/lib/utils";

export default async function AdminDashboardPage() {
  const supabase = createServiceClient();

  const [
    { count: totalOrders },
    { data: deliveredRevenue },
    { count: pendingOrders },
    { count: productCount },
    { count: customerCount },
  ] = await Promise.all([
    supabase.from("orders").select("*", { count: "exact", head: true }),
    supabase.from("orders").select("total").eq("status", "delivered"),
    supabase.from("orders").select("*", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("products").select("*", { count: "exact", head: true }),
    supabase.from("profiles").select("*", { count: "exact", head: true }).eq("role", "customer"),
  ]);

  const totalRevenue = deliveredRevenue?.reduce((sum, o) => sum + o.total, 0) ?? 0;

  const cards = [
    { title: "Total Revenue", value: formatPrice(totalRevenue), icon: DollarSign, color: "text-green-600" },
    { title: "Total Orders", value: String(totalOrders ?? 0), icon: ShoppingBag, color: "text-blue-600" },
    { title: "Products", value: String(productCount ?? 0), icon: Package, color: "text-purple-600" },
    { title: "Customers", value: String(customerCount ?? 0), icon: Users, color: "text-orange-600" },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(({ title, value, icon: Icon, color }) => (
          <Card key={title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
              <Icon className={`h-5 w-5 ${color}`} />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {(pendingOrders ?? 0) > 0 && (
        <Card className="border-yellow-200 bg-yellow-50">
          <CardContent className="py-4">
            <p className="text-sm text-yellow-800">
              <strong>{pendingOrders}</strong> pending orders require attention.{" "}
              <Link href="/admin/orders" className="font-medium underline">
                View orders →
              </Link>
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
