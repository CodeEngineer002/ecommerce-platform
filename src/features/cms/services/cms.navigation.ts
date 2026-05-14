import { createClient } from "@/lib/supabase/client";
import type { CmsNavigationItem, CmsNavigationMenu } from "@/types";

export type NavigationMenuWithItems = CmsNavigationMenu & {
  items: (CmsNavigationItem & { children?: CmsNavigationItem[] })[];
};

// ── Menus ─────────────────────────────────────────────────────────────────────

export async function getNavigationMenus(localeId: string): Promise<CmsNavigationMenu[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("cms_navigation_menus")
    .select("*")
    .eq("locale_id", localeId)
    .order("name", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function getNavigationMenuWithItems(menuId: string): Promise<NavigationMenuWithItems | null> {
  const supabase = createClient();
  const { data: menu, error } = await supabase
    .from("cms_navigation_menus")
    .select("*")
    .eq("id", menuId)
    .single();
  if (error || !menu) return null;

  const { data: items } = await supabase
    .from("cms_navigation_items")
    .select("*")
    .eq("menu_id", menuId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  const flat = (items ?? []) as CmsNavigationItem[];
  // Build tree: top-level items + nest children
  const roots = flat.filter((i) => !i.parent_id);
  const children = flat.filter((i) => !!i.parent_id);
  const nested = roots.map((root) => ({
    ...root,
    children: children.filter((c) => c.parent_id === root.id),
  }));

  return { ...menu, items: nested };
}

export async function upsertNavigationMenu(
  menu: Partial<CmsNavigationMenu> & { locale_id: string; name: string; handle: string },
): Promise<CmsNavigationMenu> {
  const supabase = createClient();
  const { created_at: _c, updated_at: _u, ...fields } = menu as CmsNavigationMenu;
  const { data, error } = await supabase
    .from("cms_navigation_menus")
    .upsert(fields)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteNavigationMenu(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("cms_navigation_menus").delete().eq("id", id);
  if (error) throw error;
}

// ── Items ─────────────────────────────────────────────────────────────────────

export async function upsertNavigationItem(
  item: Partial<CmsNavigationItem> & { menu_id: string; label: string },
): Promise<CmsNavigationItem> {
  const supabase = createClient();
  const { created_at: _c, ...fields } = item as CmsNavigationItem;
  const { data, error } = await supabase
    .from("cms_navigation_items")
    .upsert(fields)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteNavigationItem(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("cms_navigation_items").delete().eq("id", id);
  if (error) throw error;
}

export async function reorderNavigationItems(
  updates: { id: string; sort_order: number }[],
): Promise<void> {
  const supabase = createClient();
  await Promise.all(
    updates.map(({ id, sort_order }) =>
      supabase.from("cms_navigation_items").update({ sort_order }).eq("id", id),
    ),
  );
}
