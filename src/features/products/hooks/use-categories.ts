"use client";

import { useQuery } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import { createClient } from "@/lib/supabase/client";
import type { Category } from "@/types";

// Re-exported for backward compat
export const categoryKeys = queryKeys.categories;

// Browser-side fetchers. The server-cached versions in
// features/products/services/category.service.ts use next/cache's
// unstable_cache, which is server-only — invoking them from a client
// queryFn silently fails and leaves data=undefined.
async function fetchCategoriesClient(): Promise<Category[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("categories")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

async function fetchCategoryBySlugClient(slug: string): Promise<Category | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("categories")
    .select("*")
    .eq("slug", slug)
    .eq("is_active", true)
    .single();
  if (error) throw error;
  return data;
}

export function useCategories() {
  return useQuery({
    queryKey: queryKeys.categories.list(),
    queryFn: fetchCategoriesClient,
    // 10 min: categories almost never change mid-session
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

export function useCategory(slug: string) {
  return useQuery({
    queryKey: queryKeys.categories.detail(slug),
    queryFn: () => fetchCategoryBySlugClient(slug),
    enabled: !!slug,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}
