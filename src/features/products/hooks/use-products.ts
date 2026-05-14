"use client";

import { useQuery } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import type { ProductFilters } from "@/types";

import {
  getFeaturedProducts,
  getProductBySlug,
  getProducts,
  getRelatedProducts,
  searchProducts,
} from "../services/product.service";

// Re-exported for backward compat — prefer importing from @/lib/query-keys directly
export const productKeys = queryKeys.products;

export function useProducts(filters: ProductFilters = {}) {
  return useQuery({
    queryKey: queryKeys.products.list(filters),
    queryFn: () => getProducts(filters),
    // 2 min: product lists change with filters/pagination, short window is fine
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

export function useProduct(slug: string) {
  return useQuery({
    queryKey: queryKeys.products.detail(slug),
    queryFn: () => getProductBySlug(slug),
    enabled: !!slug,
    // 3 min: price/stock can change; PDP stays fresh enough within a session
    staleTime: 3 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });
}

export function useFeaturedProducts(limit = 8) {
  return useQuery({
    queryKey: queryKeys.products.featured(limit),
    queryFn: () => getFeaturedProducts(limit),
    // 5 min: homepage featured products rarely change mid-session
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

export function useRelatedProducts(productId: string, categoryId: string | null) {
  return useQuery({
    queryKey: queryKeys.products.related(productId, categoryId),
    queryFn: () => getRelatedProducts(productId, categoryId),
    enabled: !!productId,
    staleTime: 2 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });
}

export function useProductSearch(query: string) {
  return useQuery({
    queryKey: queryKeys.products.search(query),
    queryFn: () => searchProducts(query),
    enabled: query.length >= 2,
    // 30s: search results should stay fresh
    staleTime: 30 * 1000,
    gcTime: 2 * 60 * 1000,
  });
}
