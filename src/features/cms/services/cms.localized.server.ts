import { unstable_cache } from "next/cache";

import { COUNTRIES, toLocaleId, type CountryCode, type LanguageCode, type LocaleId } from "@/lib/i18n/config";
import { createServiceClient } from "@/lib/supabase/server";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LocalizedCmsPage {
  id: string;
  slug: string;
  locale_id: string;
  country_id: string;
  language_id: string;
  title: string;
  content: string | null;
  seo_title: string | null;
  seo_desc: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface LocalizedHomepageSection {
  id: string;
  locale_id: string;
  country_id: string;
  language_id: string;
  type: string;
  title: string | null;
  subtitle: string | null;
  content: Record<string, unknown> | null;
  sort_order: number;
  is_active: boolean;
}

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = createServiceClient() as any;
    for (const localeId of resolveLocaleIds(country, lang)) {
      const { data } = await supabase
        .from("localized_homepage_sections")
        .select("*")
        .eq("locale_id", localeId)
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (data && data.length > 0) return data as LocalizedHomepageSection[];
    }
    return [];
  },
  ["localized-homepage-sections"],
  { revalidate: 300, tags: ["cms", "localized-cms"] },
);

// ── Localized CMS page ────────────────────────────────────────────────────────

export const getLocalizedCmsPageServer = unstable_cache(
  async (slug: string, country: CountryCode, lang: LanguageCode): Promise<LocalizedCmsPage | null> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = createServiceClient() as any;
    for (const localeId of resolveLocaleIds(country, lang)) {
      const { data } = await supabase
        .from("localized_cms_pages")
        .select("*")
        .eq("slug", slug)
        .eq("locale_id", localeId)
        .eq("is_active", true)
        .maybeSingle();
      if (data) return data as LocalizedCmsPage;
    }
    return null;
  },
  ["localized-cms-page"],
  { revalidate: 300, tags: ["cms", "localized-cms"] },
);

export const getLocalizedCmsPagesServer = unstable_cache(
  async (country: CountryCode, lang: LanguageCode): Promise<LocalizedCmsPage[]> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = createServiceClient() as any;
    const { data } = await supabase
      .from("localized_cms_pages")
      .select("*")
      .eq("locale_id", toLocaleId(country, lang))
      .order("title", { ascending: true });
    return (data ?? []) as LocalizedCmsPage[];
  },
  ["localized-cms-pages"],
  { revalidate: 300, tags: ["cms", "localized-cms"] },
);
