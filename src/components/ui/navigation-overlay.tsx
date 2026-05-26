"use client";

import { Loader2 } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

import { cn } from "@/lib/utils";
import { useNavLoadingStore } from "@/store/nav-loading-store";

/**
 * Full-page loading overlay shown during client-side navigations.
 *
 * Works alongside nextjs-toploader (top bar):
 * - toploader → thin progress bar at the very top
 * - NavigationOverlay → centered spinner + semi-transparent backdrop
 *
 * Lifecycle:
 *   1. NavigationEvents calls startNav() on any <a> click → overlay shows
 *   2. Mount effects on the new page kick off apiFetch calls → apiPending > 0
 *   3. NavigationOverlay's pathname effect fires endNav(); overlay stays
 *      visible because apiPending is still > 0
 *   4. All pending API calls resolve → apiPending hits 0 → overlay hides
 *
 * Effects run child-first in React, so the new page's apiFetch wrappers
 * increment apiPending BEFORE this overlay's pathname effect calls endNav.
 */
export function NavigationOverlay() {
  const isNavigating = useNavLoadingStore((s) => s.isNavigating);
  const endNav = useNavLoadingStore((s) => s.endNav);
  const pathname = usePathname();

  // Release the nav-pending flag once we've landed on the new pathname.
  // apiPending (driven by apiFetch) keeps the overlay visible until APIs settle.
  useEffect(() => {
    endNav();
  }, [pathname, endNav]);

  return (
    <div
      aria-hidden={!isNavigating}
      className={cn(
        "fixed inset-0 z-[9999] flex items-center justify-center",
        "bg-background/70 backdrop-blur-sm",
        "transition-opacity duration-200",
        isNavigating ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none",
      )}
    >
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="text-sm font-medium text-muted-foreground">Loading…</p>
      </div>
    </div>
  );
}
