"use client";

import { useQuery } from "@tanstack/react-query";

import { getCategories, getCategoryBySlug } from "../services/category.service";

export const categoryKeys = {
  all: ["categories"] as const,
  list: () => [...categoryKeys.all, "list"] as const,
  detail: (slug: string) => [...categoryKeys.all, "detail", slug] as const,
};

export function useCategories() {
  return useQuery({
    queryKey: categoryKeys.list(),
    queryFn: getCategories,
    staleTime: 10 * 60 * 1000,
  });
}

export function useCategory(slug: string) {
  return useQuery({
    queryKey: categoryKeys.detail(slug),
    queryFn: () => getCategoryBySlug(slug),
    enabled: !!slug,
  });
}
