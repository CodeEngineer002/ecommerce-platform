import { unstable_cache } from "next/cache";

import { createClient } from "@/lib/supabase/client";
import type { Category } from "@/types";

export const getCategories = unstable_cache(
  async (): Promise<Category[]> => {
    const supabase = createClient();
    const { data } = await supabase
      .from("categories")
      .select("*")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });
    return data ?? [];
  },
  ["categories"],
  { revalidate: 600, tags: ["categories"] }
);

export async function getCategoryBySlug(slug: string): Promise<Category | null> {
  const supabase = createClient();
  const { data } = await supabase
    .from("categories")
    .select("*")
    .eq("slug", slug)
    .eq("is_active", true)
    .single();
  return data;
}

export async function getRootCategories(): Promise<Category[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("categories")
    .select("*")
    .is("parent_id", null)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  return data ?? [];
}
