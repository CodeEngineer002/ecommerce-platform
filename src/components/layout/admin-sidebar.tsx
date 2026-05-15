"use client";

import {
  BarChart3,
  ChevronDown,
  FileText,
  LayoutDashboard,
  LayoutTemplate,
  Megaphone,
  Menu,
  Package,
  ShoppingBag,
  Tag,
  Users,
  Warehouse,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { useAdminContext } from "@/lib/admin/context";
import { PERMISSIONS } from "@/lib/admin/permissions";
import { ROUTES } from "@/lib/constants";
import { cn } from "@/lib/utils";

// ── Nav item types ────────────────────────────────────────────────────────────

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  permission?: string;
  children?: NavItem[];
}

interface NavGroup {
  label: string;
  items: NavItem[];
  permission?: string;
}

// ── Navigation config ─────────────────────────────────────────────────────────

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { href: ROUTES.admin.dashboard, label: "Dashboard",  icon: LayoutDashboard },
      { href: ROUTES.admin.analytics, label: "Analytics",  icon: BarChart3, permission: PERMISSIONS.ANALYTICS_READ },
    ],
  },
  {
    label: "Catalog",
    permission: PERMISSIONS.CATALOG_READ,
    items: [
      { href: ROUTES.admin.products,  label: "Products",   icon: Package },
      { href: ROUTES.admin.categories,label: "Categories", icon: Tag },
      { href: ROUTES.admin.inventory, label: "Inventory",  icon: Warehouse, permission: PERMISSIONS.INVENTORY_READ },
    ],
  },
  {
    label: "Commerce",
    permission: PERMISSIONS.ORDERS_READ,
    items: [
      { href: ROUTES.admin.orders,    label: "Orders",     icon: ShoppingBag },
      { href: ROUTES.admin.customers, label: "Customers",  icon: Users, permission: PERMISSIONS.CUSTOMERS_READ },
    ],
  },
  {
    label: "Content",
    permission: PERMISSIONS.CMS_READ,
    items: [
      {
        href: ROUTES.admin.cms,
        label: "CMS",
        icon: LayoutTemplate,
        permission: PERMISSIONS.CMS_EDIT,
      },
    ],
  },
];

// ── Components ────────────────────────────────────────────────────────────────

function NavLink({ href, label, icon: Icon, active }: {
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
        active
          ? "bg-primary/10 font-medium text-primary"
          : "text-muted-foreground hover:bg-accent hover:text-foreground"
      )}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden />
      {label}
    </Link>
  );
}

interface AdminSidebarProps {
  title: string;
}

export function AdminSidebar({ title }: AdminSidebarProps) {
  const pathname = usePathname();
  const { hasPermission } = useAdminContext();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  function isActive(href: string) {
    return href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
  }

  function toggleGroup(label: string) {
    setCollapsed((prev) => ({ ...prev, [label]: !prev[label] }));
  }

  return (
    <aside
      className="hidden w-sidebar shrink-0 border-r bg-card lg:flex lg:flex-col"
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

      <nav className="flex-1 overflow-y-auto p-4" aria-label="Main navigation">
        <ul className="space-y-4" role="list">
          {NAV_GROUPS.map((group) => {
            // Hide group if user lacks the group-level permission
            if (group.permission && !hasPermission(group.permission)) return null;

            // Filter items by permission
            const visibleItems = group.items.filter(
              (item) => !item.permission || hasPermission(item.permission)
            );
            if (visibleItems.length === 0) return null;

            const isGroupCollapsed = collapsed[group.label];
            const hasActiveChild = visibleItems.some((item) => isActive(item.href));

            return (
              <li key={group.label}>
                <button
                  onClick={() => toggleGroup(group.label)}
                  className="mb-1 flex w-full items-center justify-between px-3 py-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
                >
                  <span>{group.label}</span>
                  <ChevronDown
                    className={cn(
                      "h-3 w-3 transition-transform",
                      isGroupCollapsed && !hasActiveChild ? "-rotate-90" : ""
                    )}
                  />
                </button>

                {(!isGroupCollapsed || hasActiveChild) && (
                  <ul className="space-y-0.5" role="list">
                    {visibleItems.map((item) => (
                      <li key={item.label}>
                        <NavLink
                          href={item.href}
                          label={item.label}
                          icon={item.icon}
                          active={isActive(item.href)}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t p-4">
        <Link
          href="/"
          className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <span aria-hidden>←</span>
          Back to Store
        </Link>
      </div>
    </aside>
  );
}
