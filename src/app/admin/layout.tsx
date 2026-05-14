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
import Link from "next/link";
import { redirect } from "next/navigation";

import { APP_NAME, ROUTES } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";

const adminNav = [
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
      {/* Sidebar */}
      <aside className="hidden w-64 shrink-0 border-r bg-card lg:block">
        <div className="flex h-16 items-center border-b px-6">
          <Link href={ROUTES.admin.dashboard} className="font-bold text-primary">
            {APP_NAME} Admin
          </Link>
        </div>
        <nav className="p-4">
          <ul className="space-y-1">
            {adminNav.map(({ href, label, icon: Icon }) => (
              <li key={href}>
                <Link
                  href={href}
                  className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-4 border-t pt-4">
            <Link
              href="/"
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              ← Back to Store
            </Link>
          </div>
        </nav>
      </aside>

      {/* Main */}
      <div className="flex flex-1 flex-col">
        <header className="flex h-16 items-center border-b bg-card px-6">
          <p className="text-sm text-muted-foreground">
            Signed in as <span className="font-medium text-foreground">{user.email}</span>
          </p>
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
