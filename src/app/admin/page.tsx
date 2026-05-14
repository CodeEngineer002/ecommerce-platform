import { DollarSign, Package, ShoppingBag, Users } from "lucide-react";
import Link from "next/link";

import { DashboardCard } from "@/components/common/dashboard-card";
import { Card, CardContent } from "@/components/ui/card";
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

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <DashboardCard
          title="Total Revenue"
          value={formatPrice(totalRevenue)}
          icon={DollarSign}
          color="green"
        />
        <DashboardCard
          title="Total Orders"
          value={totalOrders ?? 0}
          icon={ShoppingBag}
          color="blue"
        />
        <DashboardCard
          title="Products"
          value={productCount ?? 0}
          icon={Package}
          color="purple"
        />
        <DashboardCard
          title="Customers"
          value={customerCount ?? 0}
          icon={Users}
          color="orange"
        />
      </div>

      {(pendingOrders ?? 0) > 0 && (
        <Card className="border-yellow-200 bg-yellow-50 dark:border-yellow-900 dark:bg-yellow-950/30">
          <CardContent className="py-4">
            <p className="text-sm text-yellow-800 dark:text-yellow-300">
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
