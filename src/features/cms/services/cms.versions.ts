import { createClient } from "@/lib/supabase/client";
import type { CmsPageVersion } from "@/types";

export type VersionStatus = "draft" | "published" | "archived" | "scheduled";

export type PageVersionInsert = {
  cms_page_id: string;
  title: string;
  content?: string | null;
  seo_title?: string | null;
  seo_desc?: string | null;
  status?: VersionStatus;
  scheduled_for?: string | null;
};

export async function getPageVersions(pageId: string): Promise<CmsPageVersion[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("cms_page_versions")
    .select("*")
    .eq("cms_page_id", pageId)
    .order("version_number", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createPageVersion(payload: PageVersionInsert): Promise<CmsPageVersion> {
  const supabase = createClient();

  // Compute next version number
  const { data: latest } = await supabase
    .from("cms_page_versions")
    .select("version_number")
    .eq("cms_page_id", payload.cms_page_id)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextVersion = (latest?.version_number ?? 0) + 1;

  const { data, error } = await supabase
    .from("cms_page_versions")
    .insert({ ...payload, version_number: nextVersion, status: payload.status ?? "draft" })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function publishPageVersion(versionId: string): Promise<CmsPageVersion> {
  const supabase = createClient();

  const { data: version, error: fetchErr } = await supabase
    .from("cms_page_versions")
    .select("*")
    .eq("id", versionId)
    .single();
  if (fetchErr || !version) throw fetchErr ?? new Error("Version not found");

  // Live page update FIRST — if this fails, the version stays as draft (correct)
  const { error: liveErr } = await supabase
    .from("localized_cms_pages")
    .update({
      title:     version.title,
      content:   version.content,
      seo_title: version.seo_title,
      seo_desc:  version.seo_desc,
      is_active: true,
    })
    .eq("id", version.cms_page_id);
  if (liveErr) throw liveErr;

  // Only mark as published once the live page is confirmed updated
  const { data, error } = await supabase
    .from("cms_page_versions")
    .update({ status: "published", published_at: new Date().toISOString() })
    .eq("id", versionId)
    .select()
    .single();
  if (error) throw error;

  await fetch("/api/cms/revalidate", { method: "POST" });
  return data;
}

export async function archivePageVersion(versionId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("cms_page_versions")
    .update({ status: "archived" })
    .eq("id", versionId);
  if (error) throw error;
}
