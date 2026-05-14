import { revalidateTag, unstable_cache } from "next/cache";

import { createServiceClient } from "@/lib/supabase/server";
import type { CmsPage, HomepageSection } from "@/types";

export const getHomepageSectionsServer = unstable_cache(
  async (): Promise<HomepageSection[]> => {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from("homepage_sections")
      .select("*")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });
    return data ?? [];
  },
  ["homepage-sections"],
  { revalidate: 300, tags: ["cms"] },
);

export const getCmsPagesServer = unstable_cache(
  async (): Promise<CmsPage[]> => {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from("cms_pages")
      .select("*")
      .order("title", { ascending: true });
    return data ?? [];
  },
  ["cms-pages"],
  { revalidate: 300, tags: ["cms"] },
);

export const getCmsPageServer = unstable_cache(
  async (slug: string): Promise<CmsPage | null> => {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from("cms_pages")
      .select("*")
      .eq("slug", slug)
      .eq("is_active", true)
      .maybeSingle();
    return data;
  },
  ["cms-page"],
  { revalidate: 300, tags: ["cms"] },
);

export async function invalidateCmsCache(): Promise<void> {
  revalidateTag("cms");
}
