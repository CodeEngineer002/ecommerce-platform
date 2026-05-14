import { createClient } from "@/lib/supabase/client";
import type { CmsPage, HomepageSection } from "@/types";

// ── Browser-safe reads (React Query / Client Components) ──────────────────────

export async function getHomepageSections(): Promise<HomepageSection[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("homepage_sections")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  return data ?? [];
}

export async function getCmsPages(): Promise<CmsPage[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("cms_pages")
    .select("*")
    .order("title", { ascending: true });
  return data ?? [];
}

export async function getCmsPage(slug: string): Promise<CmsPage | null> {
  const supabase = createClient();
  const { data } = await supabase
    .from("cms_pages")
    .select("*")
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();
  return data;
}

// ── Admin mutations ───────────────────────────────────────────────────────────

export async function upsertCmsPage(page: Partial<CmsPage> & { id?: string }): Promise<CmsPage> {
  const supabase = createClient();
  const { id, created_at: _c, updated_at: _u, ...fields } = page as CmsPage & { id?: string };
  const payload = id ? { id, ...fields } : fields;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await supabase.from("cms_pages").upsert(payload as any).select().single();
  if (error) throw error;
  await fetch("/api/cms/revalidate", { method: "POST" });
  return data;
}

export async function deleteCmsPage(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("cms_pages").delete().eq("id", id);
  if (error) throw error;
  await fetch("/api/cms/revalidate", { method: "POST" });
}

export async function upsertHomepageSection(
  section: Partial<HomepageSection> & { id?: string },
): Promise<HomepageSection> {
  const supabase = createClient();
  const { id, created_at: _c, updated_at: _u, ...fields } = section as HomepageSection & { id?: string };
  const payload = id ? { id, ...fields } : fields;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await supabase.from("homepage_sections").upsert(payload as any).select().single();
  if (error) throw error;
  await fetch("/api/cms/revalidate", { method: "POST" });
  return data;
}
