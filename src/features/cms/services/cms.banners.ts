import { createClient } from "@/lib/supabase/client";
import type { CmsBanner } from "@/types";

export type BannerInsert = Omit<CmsBanner, "id" | "created_at" | "updated_at"> & { id?: string };

export async function getBanners(localeId: string): Promise<CmsBanner[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("cms_banners")
    .select("*")
    .eq("locale_id", localeId)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function getActiveBanners(localeId: string): Promise<CmsBanner[]> {
  const supabase = createClient();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("cms_banners")
    .select("*")
    .eq("locale_id", localeId)
    .eq("is_active", true)
    .or(`valid_from.is.null,valid_from.lte.${now}`)
    .or(`valid_until.is.null,valid_until.gte.${now}`)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function upsertBanner(banner: BannerInsert): Promise<CmsBanner> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("cms_banners")
    .upsert(banner)
    .select()
    .single();
  if (error) throw error;
  await fetch("/api/cms/revalidate", { method: "POST" });
  return data;
}

export async function deleteBanner(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("cms_banners").delete().eq("id", id);
  if (error) throw error;
  await fetch("/api/cms/revalidate", { method: "POST" });
}

export async function reorderBanners(updates: { id: string; sort_order: number }[]): Promise<void> {
  const supabase = createClient();
  await Promise.all(
    updates.map(({ id, sort_order }) =>
      supabase.from("cms_banners").update({ sort_order }).eq("id", id),
    ),
  );
  await fetch("/api/cms/revalidate", { method: "POST" });
}
