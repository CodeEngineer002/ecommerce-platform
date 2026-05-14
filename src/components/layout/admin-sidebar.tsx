"use client";

import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

export interface AdminNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

interface AdminSidebarProps {
  title: string;
  items: AdminNavItem[];
}

/**
 * AdminSidebar — navigation sidebar with active-state highlighting.
 *
 * - Uses usePathname() to highlight the current page link
 * - Sets aria-current="page" on the active item for screen readers
 * - Icons are aria-hidden (label text is the accessible name)
 * - Keyboard navigation follows standard <a> focus order
 * - Hidden on mobile (lg:block) — pair with a mobile menu if needed
 */
export function AdminSidebar({ title, items }: AdminSidebarProps) {
  const pathname = usePathname();

  return (
    <aside
      className="hidden w-sidebar shrink-0 border-r bg-card lg:block"
      aria-label="Admin navigation"
    >
      {/* Brand header */}
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
          {items.map(({ href, label, icon: Icon }) => {
            // Exact match for /admin; prefix match for all sub-routes
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
