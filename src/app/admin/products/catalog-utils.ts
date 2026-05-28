/**
 * Pure utility functions for admin product catalog display.
 * Exported so they can be unit-tested independently.
 */

import { SIZE_ORDER } from "@/app/admin/inventory/shared-types";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ProductStatus = "active" | "draft" | "archived";

export interface AdminMarketPrice {
  currency_code: string;
  price:         number;
  compare_price: number | null;
  is_active:     boolean;
}

export interface AdminVariant {
  id: string;
  name: string;
  sku: string | null;
  price: number | null;
  is_active: boolean;
  is_default: boolean;
  color_code: string | null;
  size_code: string | null;
  options?: Record<string, string> | null;
  inventory_levels?: Array<{ quantity: number; reserved: number }> | null;
  /**
   * Per-currency price overrides joined in by admin-product.service. Empty /
   * missing array means ops hasn't configured any per-market prices for this
   * variant — admin list keeps using `price` as before.
   */
  market_prices?: AdminMarketPrice[] | null;
}

export interface AdminProductRow {
  id: string;
  name: string;
  slug: string;
  product_code?: string | null;
  sku?: string | null;
  base_price: number;
  compare_price?: number | null;
  is_active: boolean;
  is_featured: boolean;
  deleted_at?: string | null;
  updated_at?: string | null;
  category?: { id: string; name: string } | null;
  images?: Array<{ id: string; url: string; is_primary: boolean; sort_order: number }>;
  variants?: AdminVariant[];
  available_country_ids?: string[] | null;
}

export interface ProductFilters {
  search: string;
  category: string;
  status: "all" | ProductStatus;
  stock: "all" | "low" | "oos";
  featured: "all" | "featured";
}

// ── Status ────────────────────────────────────────────────────────────────────

export function computeProductStatus(
  is_active: boolean,
  deleted_at?: string | null,
): ProductStatus {
  if (deleted_at) return "archived";
  if (!is_active) return "draft";
  return "active";
}

export const STATUS_CONFIG: Record<
  ProductStatus,
  { label: string; variant: "success" | "secondary" | "destructive" | "outline" }
> = {
  active: { label: "Active", variant: "success" },
  draft: { label: "Draft", variant: "secondary" },
  archived: { label: "Archived", variant: "destructive" },
};

// ── Hierarchy / inventory summary ─────────────────────────────────────────────

export function computeHierarchy(variants: AdminVariant[]) {
  const activeVariants = variants.filter((v) => v.is_active);
  const colors = new Set<string>();
  const sizes = new Set<string>();
  let skuCount = 0;

  for (const v of activeVariants) {
    const opts = (v.options ?? {}) as Record<string, string>;
    if (opts.color) colors.add(opts.color);
    if (opts.size) sizes.add(opts.size);
    if (v.sku) skuCount++;
  }

  return {
    variantCount: activeVariants.length,
    colorCount: colors.size,
    sizeCount: sizes.size,
    skuCount,
  };
}

export function computeInventorySummary(variants: AdminVariant[]) {
  let totalStock = 0;
  let oosCount = 0;
  let lowStockCount = 0;

  for (const v of variants) {
    if (!v.is_active) continue;
    const levels = v.inventory_levels ?? [];
    const qty = levels.reduce((s, l) => s + l.quantity, 0);
    const reserved = levels.reduce((s, l) => s + l.reserved, 0);
    const available = qty - reserved;
    totalStock += available;
    if (available <= 0) oosCount++;
    else if (available <= 5) lowStockCount++;
  }

  return { totalStock, oosCount, lowStockCount };
}

/**
 * Compute the displayed price range for the admin product list. Mirrors the
 * resolver's fallback chain so the admin view stays in sync with what the
 * storefront shows for the canonical currency (USD):
 *   1. variant's USD market_prices override (when active)
 *   2. variant.price (legacy column)
 *   3. product.base_price
 *
 * `currency` defaults to USD because the admin list is currency-agnostic —
 * USD is the canonical "source-of-truth" currency we backfilled into
 * product_variant_prices. Per-row callers in other currencies can pass it in.
 */
export function computePriceRange(
  basePrice: number,
  variants: AdminVariant[],
  currency: string = "USD",
): { min: number; max: number } {
  const ccy = currency.toUpperCase();
  const effective = variants
    .filter((v) => v.is_active)
    .map((v) => {
      const override = v.market_prices?.find(
        (m) => m.is_active && m.currency_code === ccy,
      );
      return override?.price ?? v.price ?? basePrice;
    });

  if (effective.length === 0) return { min: basePrice, max: basePrice };
  return {
    min: Math.min(...effective, basePrice),
    max: Math.max(...effective, basePrice),
  };
}

// ── Variant matrix ────────────────────────────────────────────────────────────

export interface VariantMatrixCell {
  variant: AdminVariant;
  color: string;
  size: string;
}

export interface VariantMatrix {
  colors: string[];
  sizes: string[];
  cells: Map<string, VariantMatrixCell>; // key = `${color}::${size}`
}

export function buildVariantMatrix(variants: AdminVariant[]): VariantMatrix {
  const colorSet = new Set<string>();
  const sizeSet = new Set<string>();
  const cells = new Map<string, VariantMatrixCell>();

  for (const v of variants) {
    const opts = (v.options ?? {}) as Record<string, string>;
    const color = opts.color ?? "Default";
    const size = opts.size ?? v.name;
    colorSet.add(color);
    sizeSet.add(size);
    cells.set(`${color}::${size}`, { variant: v, color, size });
  }

  const sizes = Array.from(sizeSet).sort((a, b) => {
    const ai = SIZE_ORDER.indexOf(a as typeof SIZE_ORDER[number]);
    const bi = SIZE_ORDER.indexOf(b as typeof SIZE_ORDER[number]);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.localeCompare(b);
  });

  return {
    colors: Array.from(colorSet),
    sizes,
    cells,
  };
}

// ── Filters ───────────────────────────────────────────────────────────────────

export function filterProducts(
  products: AdminProductRow[],
  filters: ProductFilters,
): AdminProductRow[] {
  const q = filters.search.toLowerCase().trim();

  return products.filter((p) => {
    // Search
    if (q) {
      const matchesName = p.name.toLowerCase().includes(q);
      const matchesCode = p.product_code?.toLowerCase().includes(q);
      const matchesSku = p.sku?.toLowerCase().includes(q);
      const matchesVariantSku = p.variants?.some((v) => v.sku?.toLowerCase().includes(q));
      if (!matchesName && !matchesCode && !matchesSku && !matchesVariantSku) return false;
    }

    // Category
    if (filters.category !== "all" && p.category?.id !== filters.category) return false;

    // Status
    if (filters.status !== "all") {
      const status = computeProductStatus(p.is_active, p.deleted_at);
      if (status !== filters.status) return false;
    }

    // Featured
    if (filters.featured === "featured" && !p.is_featured) return false;

    // Stock
    if (filters.stock !== "all") {
      const { oosCount, lowStockCount } = computeInventorySummary(p.variants ?? []);
      if (filters.stock === "oos" && oosCount === 0) return false;
      if (filters.stock === "low" && lowStockCount === 0) return false;
    }

    return true;
  });
}

// ── Time formatting ───────────────────────────────────────────────────────────

export function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

// ── Variant name generation ───────────────────────────────────────────────────

export function generateVariantName(color: string | null, size: string | null): string {
  return [color, size].filter(Boolean).join(" / ") || "Default";
}
