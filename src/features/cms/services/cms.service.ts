import { unstable_cache } from "next/cache";

import { createClient } from "@/lib/supabase/client";
import type { CmsPage, HomepageSection } from "@/types";

export const getHomepageSections = unstable_cache(
  async (): Promise<HomepageSection[]> => {
    const supabase = createClient();
    const { data } = await supabase
      .from("homepage_sections")
      .select("*")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });
    return data ?? [];
  },
  ["homepage-sections"],
  { revalidate: 300, tags: ["cms"] }
);

export async function getCmsPage(slug: string): Promise<CmsPage | null> {
  const supabase = createClient();
  const { data } = await supabase
    .from("cms_pages")
    .select("*")
    .eq("slug", slug)
    .eq("is_active", true)
    .single();
  return data;
}

export const getCmsPages = unstable_cache(
  async (): Promise<CmsPage[]> => {
    const supabase = createClient();
    const { data } = await supabase
      .from("cms_pages")
      .select("*")
      .eq("is_active", true)
      .order("title", { ascending: true });
    return data ?? [];
  },
  ["cms-pages"],
  { revalidate: 300, tags: ["cms"] }
);

// Admin mutations — call revalidateTag("cms") after each

export async function upsertHomepageSection(
  section: Partial<HomepageSection> & { id?: string }
): Promise<HomepageSection> {
  const supabase = createClient();
  const { id, created_at, updated_at, ...fields } = section as HomepageSection & { id?: string };
  const payload = id ? { id, ...fields } : fields;
  const { data, error } = await supabase
    .from("homepage_sections")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .upsert(payload as any)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function upsertCmsPage(page: Partial<CmsPage> & { id?: string }): Promise<CmsPage> {
  const supabase = createClient();
  const { id, created_at, updated_at, ...fields } = page as CmsPage & { id?: string };
  const payload = id ? { id, ...fields } : fields;
  const { data, error } = await supabase
    .from("cms_pages")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .upsert(payload as any)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteCmsPage(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("cms_pages").delete().eq("id", id);
  if (error) throw error;
}
