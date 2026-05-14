"use client";

import { useQuery } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";

import { getCategories, getCategoryBySlug } from "../services/category.service";

// Re-exported for backward compat
export const categoryKeys = queryKeys.categories;

export function useCategories() {
  return useQuery({
    queryKey: queryKeys.categories.list(),
    queryFn: getCategories,
    // 10 min: categories almost never change mid-session
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

export function useCategory(slug: string) {
  return useQuery({
    queryKey: queryKeys.categories.detail(slug),
    queryFn: () => getCategoryBySlug(slug),
    enabled: !!slug,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}
