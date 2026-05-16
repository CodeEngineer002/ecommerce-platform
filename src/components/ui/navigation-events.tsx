"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { useNavLoadingStore } from "@/store/nav-loading-store";

/**
 * NavigationEvents — triggers the full-page loading overlay on Link clicks.
 *
 * Next.js App Router has no router event API (no routeChangeStart/done).
 * Instead we intercept clicks on <a> elements that perform client-side navigation:
 * - same-origin href
 * - not target="_blank"
 * - not modified clicks (ctrl/cmd/shift/middle-click)
 * - not download links
 * - NOT the current page (same pathname → no navigation happens → overlay would get stuck)
 *
 * The overlay auto-clears when NavigationOverlay detects a pathname change.
 * This prevents users from clicking other elements while a page is loading.
 */
export function NavigationEvents() {
  const start = useNavLoadingStore((s) => s.start);
  const pathname = usePathname();

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      // Ignore non-left clicks and modifier keys (open in new tab etc.)
      if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;

      const anchor = (e.target as Element).closest("a");
      if (!anchor) return;

      // Ignore links that open in new tab / window
      if (anchor.target === "_blank") return;

      // Ignore download links
      if (anchor.hasAttribute("download")) return;

      const href = anchor.getAttribute("href");
      if (!href) return;

      // Ignore external links, mailto:, tel:, #hash-only
      if (
        href.startsWith("http") ||
        href.startsWith("mailto:") ||
        href.startsWith("tel:") ||
        href.startsWith("#") ||
        href.startsWith("javascript:")
      ) return;

      // Ignore same-page navigation — pathname won't change so stop() would never fire
      const hrefPathname = href.split("?")[0].split("#")[0];
      if (hrefPathname === pathname) return;

      // It's a client-side navigation to a different page — show overlay
      start();
    }

    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [start, pathname]);

  return null;
}
