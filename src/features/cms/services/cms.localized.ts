import { BLOCK_TYPES, type BlockType } from "@/lib/cms/block-registry";
import { toLocaleId, type CountryCode, type LanguageCode } from "@/lib/i18n/config";
import { createClient } from "@/lib/supabase/client";
import type {
  CmsBlock,
  LocalizedCmsPage,
  LocalizedHomepageSection,
} from "@/types";

// ── Localized CMS pages ───────────────────────────────────────────────────────

export async function getLocalizedCmsPages(
  country: CountryCode,
  lang: LanguageCode,
): Promise<LocalizedCmsPage[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("localized_cms_pages")
    .select("*")
    .eq("locale_id", toLocaleId(country, lang))
    .order("title", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function getLocalizedCmsPage(
  slug: string,
  country: CountryCode,
  lang: LanguageCode,
): Promise<LocalizedCmsPage | null> {
  const supabase = createClient();
  const { data } = await supabase
    .from("localized_cms_pages")
    .select("*")
    .eq("slug", slug)
    .eq("locale_id", toLocaleId(country, lang))
    .eq("is_active", true)
    .maybeSingle();
  return data;
}

export async function upsertLocalizedCmsPage(
  page: Partial<LocalizedCmsPage> & {
    slug: string;
    locale_id: string;
    country_id: string;
    language_id: string;
    title: string;
  },
): Promise<LocalizedCmsPage> {
  const supabase = createClient();
  const { created_at: _c, updated_at: _u, ...fields } = page as LocalizedCmsPage;
  const { data, error } = await supabase
    .from("localized_cms_pages")
    .upsert(fields)
    .select()
    .single();
  if (error) throw error;
  await fetch("/api/cms/revalidate", { method: "POST" });
  return data;
}

export async function deleteLocalizedCmsPage(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("localized_cms_pages").delete().eq("id", id);
  if (error) throw error;
  await fetch("/api/cms/revalidate", { method: "POST" });
}

// ── Localized homepage sections ───────────────────────────────────────────────

export async function getLocalizedHomepageSections(
  country: CountryCode,
  lang: LanguageCode,
): Promise<LocalizedHomepageSection[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("localized_homepage_sections")
    .select("*")
    .eq("locale_id", toLocaleId(country, lang))
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function upsertLocalizedHomepageSection(
  section: Partial<LocalizedHomepageSection> & {
    locale_id: string;
    country_id: string;
    language_id: string;
    type: LocalizedHomepageSection["type"];
  },
): Promise<LocalizedHomepageSection> {
  const supabase = createClient();
  const { created_at: _c, updated_at: _u, ...fields } = section as LocalizedHomepageSection;
  const { data, error } = await supabase
    .from("localized_homepage_sections")
    .upsert(fields)
    .select()
    .single();
  if (error) throw error;
  await fetch("/api/cms/revalidate", { method: "POST" });
  return data;
}

export async function deleteLocalizedHomepageSection(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("localized_homepage_sections").delete().eq("id", id);
  if (error) throw error;
  await fetch("/api/cms/revalidate", { method: "POST" });
}

export async function reorderHomepageSections(
  updates: { id: string; sort_order: number }[],
): Promise<void> {
  const supabase = createClient();
  await Promise.all(
    updates.map(({ id, sort_order }) =>
      supabase.from("localized_homepage_sections").update({ sort_order }).eq("id", id),
    ),
  );
  await fetch("/api/cms/revalidate", { method: "POST" });
}

// ── CMS Blocks ────────────────────────────────────────────────────────────────

export async function getCmsBlocks(localeId: string): Promise<CmsBlock[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("cms_blocks")
    .select("*")
    .eq("locale_id", localeId)
    .order("title", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function upsertCmsBlock(
  block: Partial<CmsBlock> & { locale_id: string; handle: string; type: BlockType },
): Promise<CmsBlock> {
  if (!(BLOCK_TYPES as readonly string[]).includes(block.type)) {
    throw new Error(`Invalid block type: "${block.type}"`);
  }
  const supabase = createClient();
  const { created_at: _c, updated_at: _u, ...fields } = block as CmsBlock;
  const { data, error } = await supabase
    .from("cms_blocks")
    .upsert(fields)
    .select()
    .single();
  if (error) throw error;
  await fetch("/api/cms/revalidate", { method: "POST" });
  return data;
}

export async function deleteCmsBlock(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("cms_blocks").delete().eq("id", id);
  if (error) throw error;
  await fetch("/api/cms/revalidate", { method: "POST" });
}
