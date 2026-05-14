import "server-only";
import { unstable_cache } from "next/cache";

import { COUNTRIES, toLocaleId, type CountryCode, type LanguageCode, type LocaleId } from "@/lib/i18n/config";
import { createServiceClient } from "@/lib/supabase/server";
import type {
  CmsBlock,
  CmsNavigationMenu,
  CmsNavigationItem,
  CmsBanner,
  LocalizedCmsPage,
  LocalizedHomepageSection,
} from "@/types";

// ── Locale fallback chain ─────────────────────────────────────────────────────
// exact locale → country fallback (English) — prevents blank pages

function resolveLocaleIds(country: CountryCode, lang: LanguageCode): LocaleId[] {
  const exact = toLocaleId(country, lang);
  const fallback = toLocaleId(country, COUNTRIES[country].fallbackLang);
  const ids: LocaleId[] = [exact];
  if (fallback !== exact) ids.push(fallback);
  return ids;
}

// ── Localized homepage sections ───────────────────────────────────────────────

export const getLocalizedHomepageSectionsServer = unstable_cache(
  async (country: CountryCode, lang: LanguageCode): Promise<LocalizedHomepageSection[]> => {
    const supabase = createServiceClient();
    for (const localeId of resolveLocaleIds(country, lang)) {
      const { data } = await supabase
        .from("localized_homepage_sections")
        .select("*")
        .eq("locale_id", localeId)
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (data && data.length > 0) return data;
    }
    return [];
  },
  ["localized-homepage-sections"],
  { revalidate: 300, tags: ["cms", "localized-cms"] },
);

// ── Localized CMS pages ───────────────────────────────────────────────────────

export const getLocalizedCmsPageServer = unstable_cache(
  async (slug: string, country: CountryCode, lang: LanguageCode): Promise<LocalizedCmsPage | null> => {
    const supabase = createServiceClient();
    for (const localeId of resolveLocaleIds(country, lang)) {
      const { data } = await supabase
        .from("localized_cms_pages")
        .select("*")
        .eq("slug", slug)
        .eq("locale_id", localeId)
        .eq("is_active", true)
        .maybeSingle();
      if (data) return data;
    }
    return null;
  },
  ["localized-cms-page"],
  { revalidate: 300, tags: ["cms", "localized-cms"] },
);

export const getLocalizedCmsPagesServer = unstable_cache(
  async (country: CountryCode, lang: LanguageCode): Promise<LocalizedCmsPage[]> => {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from("localized_cms_pages")
      .select("*")
      .eq("locale_id", toLocaleId(country, lang))
      .eq("is_active", true)
      .order("title", { ascending: true });
    return data ?? [];
  },
  ["localized-cms-pages"],
  { revalidate: 300, tags: ["cms", "localized-cms"] },
);

// ── CMS Blocks ────────────────────────────────────────────────────────────────

export const getCmsBlockServer = unstable_cache(
  async (handle: string, localeId: string): Promise<CmsBlock | null> => {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from("cms_blocks")
      .select("*")
      .eq("handle", handle)
      .eq("locale_id", localeId)
      .eq("is_active", true)
      .maybeSingle();
    return data;
  },
  ["cms-block"],
  { revalidate: 300, tags: ["cms", "cms-blocks"] },
);

export const getCmsBlocksServer = unstable_cache(
  async (localeId: string): Promise<CmsBlock[]> => {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from("cms_blocks")
      .select("*")
      .eq("locale_id", localeId)
      .eq("is_active", true)
      .order("title", { ascending: true });
    return data ?? [];
  },
  ["cms-blocks"],
  { revalidate: 300, tags: ["cms", "cms-blocks"] },
);

// ── Navigation ────────────────────────────────────────────────────────────────

export type NavMenuWithItems = CmsNavigationMenu & {
  items: (CmsNavigationItem & { children?: CmsNavigationItem[] })[];
};

export const getNavigationMenuServer = unstable_cache(
  async (handle: string, localeId: string): Promise<NavMenuWithItems | null> => {
    const supabase = createServiceClient();
    const { data: menu } = await supabase
      .from("cms_navigation_menus")
      .select("*")
      .eq("handle", handle)
      .eq("locale_id", localeId)
      .eq("is_active", true)
      .maybeSingle();
    if (!menu) return null;

    const { data: items } = await supabase
      .from("cms_navigation_items")
      .select("*")
      .eq("menu_id", menu.id)
      .eq("is_active", true)
      .order("sort_order", { ascending: true });

    const flat = (items ?? []) as CmsNavigationItem[];
    const roots = flat.filter((i) => !i.parent_id);
    const children = flat.filter((i) => !!i.parent_id);
    const nested = roots.map((root) => ({
      ...root,
      children: children.filter((c) => c.parent_id === root.id),
    }));

    return { ...menu, items: nested };
  },
  ["cms-navigation-menu"],
  { revalidate: 300, tags: ["cms", "cms-navigation"] },
);

// ── Banners ───────────────────────────────────────────────────────────────────

export const getActiveBannersServer = unstable_cache(
  async (localeId: string): Promise<CmsBanner[]> => {
    const supabase = createServiceClient();
    const now = new Date().toISOString();
    const { data } = await supabase
      .from("cms_banners")
      .select("*")
      .eq("locale_id", localeId)
      .eq("is_active", true)
      .or(`valid_from.is.null,valid_from.lte.${now}`)
      .or(`valid_until.is.null,valid_until.gte.${now}`)
      .order("sort_order", { ascending: true });
    return data ?? [];
  },
  ["cms-banners-active"],
  { revalidate: 60, tags: ["cms", "cms-banners"] },
);
