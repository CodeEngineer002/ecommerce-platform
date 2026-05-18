"use client";

import { LayoutList, MapPin, Package, User } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import { ROUTES } from "@/lib/constants";

const navItems = [
  { href: ROUTES.profile, label: "My Profile", icon: User, exact: true },
  { href: ROUTES.addresses, label: "My Addresses", icon: MapPin, exact: false },
  { href: ROUTES.orders, label: "My Orders", icon: Package, exact: false },
];

export function ProfileSidebarNav() {
  const pathname = usePathname();

  // strip locale prefix e.g. /us/en/profile → /profile
  const normalised = pathname.replace(/^\/[a-z]{2}\/[a-z]{2}/, "");

  return (
    <nav className="flex flex-col gap-1">
      {navItems.map(({ href, label, icon: Icon, exact }) => {
        const active = exact ? normalised === href : normalised.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
