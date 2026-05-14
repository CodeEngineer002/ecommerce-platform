"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useAdminContext } from "@/lib/admin/context";
import { PERMISSIONS } from "@/lib/admin/permissions";
import { ROUTES } from "@/lib/constants";
import { cn } from "@/lib/utils";

const CMS_TABS = [
  { href: ROUTES.admin.cms,           label: "Pages",      permission: PERMISSIONS.CMS_EDIT },
  { href: ROUTES.admin.cmsHomepage,   label: "Homepage",   permission: PERMISSIONS.CMS_EDIT },
  { href: ROUTES.admin.cmsBlocks,     label: "Blocks",     permission: PERMISSIONS.CMS_EDIT },
  { href: ROUTES.admin.cmsNavigation, label: "Navigation", permission: PERMISSIONS.CMS_MANAGE_NAVIGATION },
  { href: ROUTES.admin.cmsBanners,    label: "Banners",    permission: PERMISSIONS.CMS_MANAGE_BANNERS },
  { href: ROUTES.admin.cmsMedia,      label: "Media",      permission: PERMISSIONS.CMS_MANAGE_MEDIA },
] as const;

export default function CmsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { hasPermission } = useAdminContext();

  return (
    <div className="space-y-6">
      {/* Tab sub-navigation */}
      <nav
        className="flex gap-1 rounded-lg border bg-muted/30 p-1"
        aria-label="CMS sections"
      >
        {CMS_TABS.map(({ href, label, permission }) => {
          if (!hasPermission(permission)) return null;
          const isActive =
            href === ROUTES.admin.cms
              ? pathname === href
              : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
              aria-current={isActive ? "page" : undefined}
            >
              {label}
            </Link>
          );
        })}
      </nav>

      {children}
    </div>
  );
}
