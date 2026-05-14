/**
 * Central React Query key registry.
 *
 * Single source of truth for all query keys.
 * Prevents key collisions across features and makes invalidation predictable.
 *
 * Usage:
 *   import { queryKeys } from "@/lib/query-keys";
 *   useQuery({ queryKey: queryKeys.products.detail(slug), ... })
 *   queryClient.invalidateQueries({ queryKey: queryKeys.orders.all })
 */

import type { ProductFilters } from "@/types";

export const queryKeys = {
  // ── Auth / User profile ───────────────────────────────────────────────────
  auth: {
    all: ["auth"] as const,
    profile: ["auth", "profile"] as const,
  },

  // ── Products ──────────────────────────────────────────────────────────────
  products: {
    all: ["products"] as const,
    lists: () => ["products", "list"] as const,
    list: (filters: ProductFilters) => ["products", "list", filters] as const,
    details: () => ["products", "detail"] as const,
    detail: (slug: string) => ["products", "detail", slug] as const,
    featured: (limit?: number) => ["products", "featured", limit] as const,
    related: (id: string, categoryId: string | null) =>
      ["products", "related", id, categoryId] as const,
    search: (q: string) => ["products", "search", q] as const,
  },

  // ── Categories ────────────────────────────────────────────────────────────
  categories: {
    all: ["categories"] as const,
    list: () => ["categories", "list"] as const,
    detail: (slug: string) => ["categories", "detail", slug] as const,
  },

  // ── Orders (storefront) ───────────────────────────────────────────────────
  orders: {
    all: ["orders"] as const,
    list: (userId: string) => ["orders", "list", userId] as const,
    detail: (id: string) => ["orders", "detail", id] as const,
  },

  // ── Admin — orders ────────────────────────────────────────────────────────
  adminOrders: {
    all: ["admin", "orders"] as const,
    list: (page: number) => ["admin", "orders", "list", page] as const,
    stats: () => ["admin", "orders", "stats"] as const,
  },

  // ── Admin — products ──────────────────────────────────────────────────────
  adminProducts: {
    all: ["admin", "products"] as const,
    list: (page: number) => ["admin", "products", "list", page] as const,
    detail: (id: string) => ["admin", "products", "detail", id] as const,
  },

  // ── Cart ──────────────────────────────────────────────────────────────────
  cart: {
    all: ["cart"] as const,
    session: ["cart", "session"] as const,
    // Sorted ids so key is stable regardless of array order
    variants: (sortedIds: string[]) => ["cart", "variants", sortedIds] as const,
  },

  // ── Wishlist ──────────────────────────────────────────────────────────────
  wishlist: {
    all: ["wishlist"] as const,
    items: (userId: string) => ["wishlist", "items", userId] as const,
  },

  // ── Addresses ─────────────────────────────────────────────────────────────
  addresses: {
    all: ["addresses"] as const,
    list: (userId: string) => ["addresses", "list", userId] as const,
  },

  // ── Address country rules (public, no user scope) ─────────────────────────
  addressRules: {
    all: ["address-rules"] as const,
    byCountry: (countryId: string) => ["address-rules", countryId] as const,
  },

  // ── Location data (regions, cities) ─────────────────────────────────────
  locations: {
    all: ["locations"] as const,
    regions: (countryCode: string) => ["locations", "regions", countryCode] as const,
    cities: (countryCode: string, regionCode: string, q: string) =>
      ["locations", "cities", countryCode, regionCode, q] as const,
    addressRules: (countryCode: string) => ["locations", "address-rules", countryCode] as const,
  },
} as const;
