"use client";

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
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import { ROUTES } from "@/lib/constants";

interface AdminNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

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

interface AdminSidebarProps {
  title: string;
}

export function AdminSidebar({ title }: AdminSidebarProps) {
  const pathname = usePathname();

  return (
    <aside
      className="hidden w-sidebar shrink-0 border-r bg-card lg:block"
      aria-label="Admin navigation"
    >
      <div className="flex h-header items-center border-b px-6">
        <Link
          href="/admin"
          className="font-bold text-primary transition-opacity hover:opacity-80"
        >
          {title}
        </Link>
      </div>

      <nav className="p-4">
        <ul className="space-y-1" role="list">
          {adminNav.map(({ href, label, icon: Icon }) => {
            const isActive =
              href === "/admin"
                ? pathname === "/admin"
                : pathname === href || pathname.startsWith(`${href}/`);

            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                    isActive
                      ? "bg-primary/10 font-medium text-primary"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="mt-4 border-t pt-4">
          <Link
            href="/"
            className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <span aria-hidden="true">←</span>
            Back to Store
          </Link>
        </div>
      </nav>
    </aside>
  );
}
