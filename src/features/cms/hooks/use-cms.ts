"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-hot-toast";

import {
  deleteCmsPage,
  getCmsPage,
  getCmsPages,
  getHomepageSections,
  upsertCmsPage,
  upsertHomepageSection,
} from "../services/cms.service";

export const cmsKeys = {
  homepage: ["cms", "homepage"] as const,
  pages: ["cms", "pages"] as const,
  page: (slug: string) => ["cms", "pages", slug] as const,
};

export function useHomepageSections() {
  return useQuery({
    queryKey: cmsKeys.homepage,
    queryFn: getHomepageSections,
    staleTime: 5 * 60 * 1000,
  });
}

export function useCmsPage(slug: string) {
  return useQuery({
    queryKey: cmsKeys.page(slug),
    queryFn: () => getCmsPage(slug),
    enabled: !!slug,
  });
}

export function useCmsPages() {
  return useQuery({
    queryKey: cmsKeys.pages,
    queryFn: getCmsPages,
  });
}

export function useUpsertHomepageSection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: upsertHomepageSection,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: cmsKeys.homepage });
      toast.success("Section saved");
    },
  });
}

export function useUpsertCmsPage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: upsertCmsPage,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: cmsKeys.pages });
      toast.success("Page saved");
    },
  });
}

export function useDeleteCmsPage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteCmsPage,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: cmsKeys.pages });
      toast.success("Page deleted");
    },
  });
}
