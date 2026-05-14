import { toLocaleId, type CountryCode, type LanguageCode } from "@/lib/i18n/config";
import { createClient } from "@/lib/supabase/client";

import type { LocalizedCmsPage, LocalizedHomepageSection } from "./cms.localized.server";

// ── Browser-safe reads (React Query / Client Components) ──────────────────────

export async function getLocalizedCmsPages(
  country: CountryCode,
  lang: LanguageCode,
): Promise<LocalizedCmsPage[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createClient() as any;
  const { data } = await supabase
    .from("localized_cms_pages")
    .select("*")
    .eq("locale_id", toLocaleId(country, lang))
    .order("title", { ascending: true });
  return (data ?? []) as LocalizedCmsPage[];
}

export async function getLocalizedCmsPage(
  slug: string,
  country: CountryCode,
  lang: LanguageCode,
): Promise<LocalizedCmsPage | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createClient() as any;
  const { data } = await supabase
    .from("localized_cms_pages")
    .select("*")
    .eq("slug", slug)
    .eq("locale_id", toLocaleId(country, lang))
    .eq("is_active", true)
    .maybeSingle();
  return data as LocalizedCmsPage | null;
}

// ── Admin mutations ───────────────────────────────────────────────────────────

export async function upsertLocalizedCmsPage(
  page: Partial<LocalizedCmsPage> & { slug: string; locale_id: string; country_id: string; language_id: string; title: string },
): Promise<LocalizedCmsPage> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createClient() as any;
  const { created_at: _c, updated_at: _u, ...fields } = page as LocalizedCmsPage;
  const { data, error } = await supabase
    .from("localized_cms_pages")
    .upsert(fields)
    .select()
    .single();
  if (error) throw error;
  await fetch("/api/cms/revalidate", { method: "POST" });
  return data as LocalizedCmsPage;
}

export async function deleteLocalizedCmsPage(id: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createClient() as any;
  const { error } = await supabase.from("localized_cms_pages").delete().eq("id", id);
  if (error) throw error;
  await fetch("/api/cms/revalidate", { method: "POST" });
}

export async function upsertLocalizedHomepageSection(
  section: Partial<LocalizedHomepageSection> & { locale_id: string; country_id: string; language_id: string; type: string },
): Promise<LocalizedHomepageSection> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createClient() as any;
  const { data, error } = await supabase
    .from("localized_homepage_sections")
    .upsert(section)
    .select()
    .single();
  if (error) throw error;
  await fetch("/api/cms/revalidate", { method: "POST" });
  return data as LocalizedHomepageSection;
}
