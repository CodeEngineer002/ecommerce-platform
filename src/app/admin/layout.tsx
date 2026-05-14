import {
  BarChart3,
  FileText,
  LayoutDashboard,
  Package,
  ShoppingBag,
  Tag,
  Users,
  Warehouse,
} from "lucide-react";
import { redirect } from "next/navigation";

import { AdminSidebar, type AdminNavItem } from "@/components/layout/admin-sidebar";
import { APP_NAME, ROUTES } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";

const adminNav: AdminNavItem[] = [
  { href: ROUTES.admin.dashboard, label: "Dashboard", icon: LayoutDashboard },
  { href: ROUTES.admin.products, label: "Products", icon: Package },
  { href: ROUTES.admin.categories, label: "Categories", icon: Tag },
  { href: ROUTES.admin.orders, label: "Orders", icon: ShoppingBag },
  { href: ROUTES.admin.customers, label: "Customers", icon: Users },
  { href: ROUTES.admin.inventory, label: "Inventory", icon: Warehouse },
  { href: ROUTES.admin.analytics, label: "Analytics", icon: BarChart3 },
  { href: ROUTES.admin.cms, label: "CMS", icon: FileText },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect(ROUTES.login);

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || !["admin", "super_admin"].includes(profile.role)) {
    redirect("/");
  }

  return (
    <div className="flex min-h-screen">
      <AdminSidebar title={`${APP_NAME} Admin`} items={adminNav} />

      <div className="flex flex-1 flex-col">
        <header className="flex h-header items-center border-b bg-card px-6">
          <p className="text-sm text-muted-foreground">
            Signed in as{" "}
            <span className="font-medium text-foreground">{user.email}</span>
          </p>
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
