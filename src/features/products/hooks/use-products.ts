"use client";

import { useQuery } from "@tanstack/react-query";

import type { ProductFilters } from "@/types";

import {
  getFeaturedProducts,
  getProductBySlug,
  getProducts,
  getRelatedProducts,
  searchProducts,
} from "../services/product.service";

export const productKeys = {
  all: ["products"] as const,
  lists: () => [...productKeys.all, "list"] as const,
  list: (filters: ProductFilters) => [...productKeys.lists(), filters] as const,
  details: () => [...productKeys.all, "detail"] as const,
  detail: (slug: string) => [...productKeys.details(), slug] as const,
  featured: (limit?: number) => [...productKeys.all, "featured", limit] as const,
  // Include categoryId so products from different categories don't share a cache entry
  related: (id: string, categoryId: string | null) =>
    [...productKeys.all, "related", id, categoryId] as const,
  search: (q: string) => [...productKeys.all, "search", q] as const,
};

export function useProducts(filters: ProductFilters = {}) {
  return useQuery({
    queryKey: productKeys.list(filters),
    queryFn: () => getProducts(filters),
  });
}

export function useProduct(slug: string) {
  return useQuery({
    queryKey: productKeys.detail(slug),
    queryFn: () => getProductBySlug(slug),
    enabled: !!slug,
  });
}

export function useFeaturedProducts(limit = 8) {
  return useQuery({
    queryKey: productKeys.featured(limit),
    queryFn: () => getFeaturedProducts(limit),
    staleTime: 5 * 60 * 1000,
  });
}

export function useRelatedProducts(productId: string, categoryId: string | null) {
  return useQuery({
    queryKey: productKeys.related(productId, categoryId),
    queryFn: () => getRelatedProducts(productId, categoryId),
    enabled: !!productId,
  });
}

export function useProductSearch(query: string) {
  return useQuery({
    queryKey: productKeys.search(query),
    queryFn: () => searchProducts(query),
    enabled: query.length >= 2,
    staleTime: 30 * 1000,
  });
}
