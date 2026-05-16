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
 *   1. Any component calls useNavLoadingStore.getState().start()
 *   2. Overlay becomes visible instantly
 *   3. usePathname() changes when the new page renders → stop() auto-fires
 */
export function NavigationOverlay() {
  const isNavigating = useNavLoadingStore((s) => s.isNavigating);
  const stop = useNavLoadingStore((s) => s.stop);
  const pathname = usePathname();

  // Auto-clear when the new page has finished rendering (pathname changed)
  useEffect(() => {
    stop();
  }, [pathname, stop]);

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
