"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-hot-toast";

import type { CountryCode, LanguageCode } from "@/lib/i18n/config";
import type {
  CmsBlock,
  CmsNavigationMenu,
  LocalizedCmsPage,
  LocalizedHomepageSection,
} from "@/types";

import { deleteBanner, getBanners, upsertBanner } from "../services/cms.banners";
import type { BannerInsert } from "../services/cms.banners";
import {
  deleteCmsBlock,
  deleteLocalizedCmsPage,
  deleteLocalizedHomepageSection,
  getCmsBlocks,
  getLocalizedCmsPage,
  getLocalizedCmsPages,
  getLocalizedHomepageSections,
  reorderHomepageSections,
  upsertCmsBlock,
  upsertLocalizedCmsPage,
  upsertLocalizedHomepageSection,
} from "../services/cms.localized";
import { deleteMediaAsset, getMediaAssets, updateMediaAsset } from "../services/cms.media";
import type { MediaFilters } from "../services/cms.media";
import {
  deleteNavigationMenu,
  getNavigationMenus,
  upsertNavigationMenu,
} from "../services/cms.navigation";
import {
  archivePageVersion,
  createPageVersion,
  getPageVersions,
  publishPageVersion,
} from "../services/cms.versions";

// ── Query keys ────────────────────────────────────────────────────────────────

export const cmsKeys = {
  pages:           (localeId: string)  => ["cms", "pages", localeId] as const,
  page:            (slug: string, localeId: string) => ["cms", "page", slug, localeId] as const,
  homepage:        (localeId: string)  => ["cms", "homepage", localeId] as const,
  blocks:          (localeId: string)  => ["cms", "blocks", localeId] as const,
  versions:        (pageId: string)    => ["cms", "versions", pageId] as const,
  navMenus:        (localeId: string)  => ["cms", "nav-menus", localeId] as const,
  banners:         (localeId: string)  => ["cms", "banners", localeId] as const,
  media:           (filters: MediaFilters) => ["cms", "media", filters] as const,
} as const;

// ── CMS Pages ─────────────────────────────────────────────────────────────────

export function useLocalizedCmsPages(country: CountryCode, lang: LanguageCode) {
  return useQuery({
    queryKey: cmsKeys.pages(`${lang}-${country.toUpperCase()}`),
    queryFn: () => getLocalizedCmsPages(country, lang),
  });
}

export function useLocalizedCmsPage(slug: string, country: CountryCode, lang: LanguageCode) {
  return useQuery({
    queryKey: cmsKeys.page(slug, `${lang}-${country.toUpperCase()}`),
    queryFn: () => getLocalizedCmsPage(slug, country, lang),
    enabled: !!slug,
  });
}

export function useUpsertLocalizedCmsPage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: upsertLocalizedCmsPage,
    onSuccess: (data: LocalizedCmsPage) => {
      queryClient.invalidateQueries({ queryKey: ["cms", "pages"] });
      queryClient.invalidateQueries({ queryKey: ["cms", "page"] });
      toast.success(`Page "${data.title}" saved`);
    },
    onError: () => toast.error("Failed to save page"),
  });
}

export function useDeleteLocalizedCmsPage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteLocalizedCmsPage,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cms", "pages"] });
      toast.success("Page deleted");
    },
    onError: () => toast.error("Failed to delete page"),
  });
}

// ── Homepage Sections ─────────────────────────────────────────────────────────

export function useLocalizedHomepageSections(country: CountryCode, lang: LanguageCode) {
  return useQuery({
    queryKey: cmsKeys.homepage(`${lang}-${country.toUpperCase()}`),
    queryFn: () => getLocalizedHomepageSections(country, lang),
  });
}

export function useUpsertHomepageSection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: upsertLocalizedHomepageSection,
    onSuccess: (data: LocalizedHomepageSection) => {
      queryClient.invalidateQueries({ queryKey: ["cms", "homepage"] });
      toast.success(`Section "${data.type}" saved`);
    },
    onError: () => toast.error("Failed to save section"),
  });
}

export function useDeleteHomepageSection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteLocalizedHomepageSection,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cms", "homepage"] });
      toast.success("Section deleted");
    },
  });
}

export function useReorderHomepageSections() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: reorderHomepageSections,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["cms", "homepage"] }),
  });
}

// ── CMS Blocks ────────────────────────────────────────────────────────────────

export function useCmsBlocks(localeId: string) {
  return useQuery({
    queryKey: cmsKeys.blocks(localeId),
    queryFn: () => getCmsBlocks(localeId),
  });
}

export function useUpsertCmsBlock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: upsertCmsBlock,
    onSuccess: (data: CmsBlock) => {
      queryClient.invalidateQueries({ queryKey: ["cms", "blocks"] });
      toast.success(`Block "${data.handle}" saved`);
    },
    onError: () => toast.error("Failed to save block"),
  });
}

export function useDeleteCmsBlock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteCmsBlock,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cms", "blocks"] });
      toast.success("Block deleted");
    },
  });
}

// ── Versions ──────────────────────────────────────────────────────────────────

export function usePageVersions(pageId: string) {
  return useQuery({
    queryKey: cmsKeys.versions(pageId),
    queryFn: () => getPageVersions(pageId),
    enabled: !!pageId,
  });
}

export function useCreatePageVersion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createPageVersion,
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: cmsKeys.versions(variables.cms_page_id) });
      toast.success("Version saved as draft");
    },
  });
}

export function usePublishPageVersion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: publishPageVersion,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cms"] });
      toast.success("Version published and live");
    },
    onError: () => toast.error("Failed to publish"),
  });
}

export function useArchivePageVersion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: archivePageVersion,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cms", "versions"] });
      toast.success("Version archived");
    },
  });
}

// ── Navigation ────────────────────────────────────────────────────────────────

export function useNavigationMenus(localeId: string) {
  return useQuery({
    queryKey: cmsKeys.navMenus(localeId),
    queryFn: () => getNavigationMenus(localeId),
  });
}

export function useUpsertNavigationMenu() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: upsertNavigationMenu,
    onSuccess: (data: CmsNavigationMenu) => {
      queryClient.invalidateQueries({ queryKey: ["cms", "nav-menus"] });
      toast.success(`Menu "${data.name}" saved`);
    },
  });
}

export function useDeleteNavigationMenu() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteNavigationMenu,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cms", "nav-menus"] });
      toast.success("Menu deleted");
    },
  });
}

// ── Banners ───────────────────────────────────────────────────────────────────

export function useBanners(localeId: string) {
  return useQuery({
    queryKey: cmsKeys.banners(localeId),
    queryFn: () => getBanners(localeId),
  });
}

export function useUpsertBanner() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (banner: BannerInsert) => upsertBanner(banner),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cms", "banners"] });
      toast.success("Banner saved");
    },
  });
}

export function useDeleteBanner() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteBanner,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cms", "banners"] });
      toast.success("Banner deleted");
    },
  });
}

// ── Media ─────────────────────────────────────────────────────────────────────

export function useMediaAssets(filters: MediaFilters = {}) {
  return useQuery({
    queryKey: cmsKeys.media(filters),
    queryFn: () => getMediaAssets(filters),
  });
}

export function useUpdateMediaAsset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Parameters<typeof updateMediaAsset>[1] }) =>
      updateMediaAsset(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cms", "media"] });
      toast.success("Asset updated");
    },
  });
}

export function useDeleteMediaAsset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteMediaAsset,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cms", "media"] });
      toast.success("Asset deleted");
    },
  });
}
