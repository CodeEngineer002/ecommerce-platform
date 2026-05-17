import { createClient } from "@/lib/supabase/client";
import type { MediaAsset, MediaFolder } from "@/types";

// ── Folders ───────────────────────────────────────────────────────────────────

export async function getMediaFolders(): Promise<MediaFolder[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("media_folders")
    .select("*")
    .order("name", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function createMediaFolder(
  name: string,
  parentId?: string | null,
): Promise<MediaFolder> {
  const supabase = createClient();
  // Build path: parent.path + "/" + name (or just name for root)
  let path = name;
  if (parentId) {
    const { data: parent } = await supabase
      .from("media_folders")
      .select("path")
      .eq("id", parentId)
      .single();
    if (parent) path = `${parent.path}/${name}`;
  }
  const { data, error } = await supabase
    .from("media_folders")
    .insert({ name, parent_id: parentId ?? null, path })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ── Assets ────────────────────────────────────────────────────────────────────

export interface MediaFilters {
  folderId?: string | null;
  mimeType?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export async function getMediaAssets(filters: MediaFilters = {}): Promise<{
  data: MediaAsset[];
  count: number;
}> {
  const supabase = createClient();
  const { folderId, mimeType, search, page = 1, pageSize = 24 } = filters;
  const from = (page - 1) * pageSize;

  let query = supabase
    .from("media_assets")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false });

  if (folderId !== undefined) {
    query = folderId === null
      ? query.is("folder_id", null)
      : query.eq("folder_id", folderId);
  }
  if (mimeType) query = query.ilike("mime_type", `${mimeType}%`);
  if (search) query = query.ilike("original_name", `%${search}%`);

  query = query.range(from, from + pageSize - 1);

  const { data, count, error } = await query;
  if (error) throw error;
  return { data: data ?? [], count: count ?? 0 };
}

export async function updateMediaAsset(
  id: string,
  updates: Partial<Pick<MediaAsset, "alt_text" | "tags" | "folder_id">>,
): Promise<MediaAsset> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("media_assets")
    .update(updates)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteMediaAsset(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("media_assets").delete().eq("id", id);
  if (error) throw error;
}

// Register an uploaded file in media_assets (URL from Supabase Storage bucket)
export async function registerMediaAsset(asset: Omit<MediaAsset, "id" | "created_at">): Promise<MediaAsset> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("media_assets")
    .insert(asset)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Upload a file to the cms-assets Supabase Storage bucket and register it in media_assets.
// Returns the public URL of the uploaded image.
export async function uploadCmsImage(file: File): Promise<string> {
  const supabase = createClient();

  const ext = file.name.split(".").pop() ?? "bin";
  const path = `slides/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("cms-assets")
    .upload(path, file, { contentType: file.type, upsert: false });

  if (uploadError) throw uploadError;

  const { data: urlData } = supabase.storage.from("cms-assets").getPublicUrl(path);
  const publicUrl = urlData.publicUrl;

  // Register in media_assets table for the media library
  await registerMediaAsset({
    url:           publicUrl,
    thumbnail_url: publicUrl,
    filename:      path,
    original_name: file.name,
    mime_type:     file.type,
    file_size:     file.size,
    width:         null,
    height:        null,
    alt_text:      null,
    tags:          [],
    folder_id:     null,
  });

  return publicUrl;
}
