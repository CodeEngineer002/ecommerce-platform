// ─────────────────────────────────────────────────────────────────────────────
// CMS Inheritance Service
//
// Implements AEM-like country-first inheritance model:
//   - Country-level content = source of truth
//   - Locale-level content = override (optional; inherits from country by default)
//
// Resolution rule:
//   1. If locale has an active override (override_status = 'overridden')
//      → return locale-specific content
//   2. Else → return country-level source content
//   3. If no country-level content → fallback to raw locale query (legacy rows)
// ─────────────────────────────────────────────────────────────────────────────

import { COUNTRIES, toLocaleId, type CountryCode, type LanguageCode } from "@/lib/i18n/config";
import { createClient } from "@/lib/supabase/client";

// ── Types ─────────────────────────────────────────────────────────────────────

export type CmsModule = "pages" | "homepage" | "blocks" | "navigation" | "banners";
export type OverrideStatus = "inherited" | "overridden" | "detached";
export type ScopeType = "country" | "locale";

export interface InheritanceFields {
  scope_type: ScopeType;
  inherits_from_id: string | null;
  inheritance_enabled: boolean;
  override_status: OverrideStatus;
}

export interface InheritanceMeta {
  isInherited: boolean;
  isCountrySource: boolean;
  isLocaleOverride: boolean;
  overrideStatus: OverrideStatus;
  sourceId: string | null;
}

const MODULE_TABLE: Record<CmsModule, string> = {
  pages:      "localized_cms_pages",
  homepage:   "localized_homepage_sections",
  blocks:     "cms_blocks",
  navigation: "cms_navigation_menus",
  banners:    "cms_banners",
};

// ── Pure helpers (testable without DB) ───────────────────────────────────────

/** Returns true if a content row is still inheriting from country-level */
export function isInheritedContent(row: Partial<InheritanceFields>): boolean {
  if (!row.scope_type) return false; // legacy row, not yet migrated
  if (row.scope_type === "country") return false; // source content
  return row.override_status === "inherited" && (row.inheritance_enabled ?? true);
}

/** Returns true if this row is an active locale override */
export function isLocaleOverride(row: Partial<InheritanceFields>): boolean {
  return row.scope_type === "locale" && row.override_status === "overridden";
}

/** Derive human-readable inheritance metadata from a row */
export function getInheritanceMeta(row: Partial<InheritanceFields>): InheritanceMeta {
  return {
    isInherited:      isInheritedContent(row),
    isCountrySource:  row.scope_type === "country",
    isLocaleOverride: isLocaleOverride(row),
    overrideStatus:   row.override_status ?? "inherited",
    sourceId:         row.inherits_from_id ?? null,
  };
}

// ── Country-level content helpers ─────────────────────────────────────────────

/** Fetch country-level source content for a module */
export async function getCountryLevelContent<T = unknown>(
  country: CountryCode,
  module: CmsModule,
): Promise<T[]> {
  const supabase = createClient();
  const countryIso = COUNTRIES[country].iso.toLowerCase();
  const table = MODULE_TABLE[module];

  const { data, error } = await supabase
    .from(table)
    .select("*")
    .eq("country_id", countryIso)
    .eq("scope_type", "country")
    .is("locale_id", null)
    .order("sort_order", { ascending: true });

  if (error) throw error;
  return (data ?? []) as T[];
}

/** Fetch locale-level overrides only */
export async function getLocaleOverrides<T = unknown>(
  country: CountryCode,
  lang: LanguageCode,
  module: CmsModule,
): Promise<T[]> {
  const supabase = createClient();
  const localeId = toLocaleId(country, lang);
  const table = MODULE_TABLE[module];

  const { data, error } = await supabase
    .from(table)
    .select("*")
    .eq("locale_id", localeId)
    .eq("scope_type", "locale")
    .eq("override_status", "overridden");

  if (error) throw error;
  return (data ?? []) as T[];
}

/**
 * Resolve effective content for a country+language combination.
 *
 * Returns locale-level overrides merged with country-level content.
 * Items with active locale overrides use the locale version.
 * Items without overrides use the country-level version.
 * Legacy rows (no scope_type) are returned as-is.
 */
export async function resolveEffectiveContent<T extends { id: string; inherits_from_id?: string | null } = Record<string, unknown>>(
  country: CountryCode,
  lang: LanguageCode,
  module: CmsModule,
): Promise<T[]> {
  const supabase = createClient();
  const localeId = toLocaleId(country, lang);
  const countryIso = COUNTRIES[country].iso.toLowerCase();
  const table = MODULE_TABLE[module];

  // Fetch locale overrides
  const { data: localeRows } = await supabase
    .from(table)
    .select("*")
    .eq("locale_id", localeId)
    .eq("scope_type", "locale")
    .eq("override_status", "overridden")
    .eq("is_active", true);

  // Fetch country-level source rows
  const { data: countryRows } = await supabase
    .from(table)
    .select("*")
    .eq("country_id", countryIso)
    .eq("scope_type", "country")
    .is("locale_id", null)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  // Legacy: locale rows without scope_type (pre-inheritance migration)
  const { data: legacyRows } = await supabase
    .from(table)
    .select("*")
    .eq("locale_id", localeId)
    .is("scope_type", null)
    .eq("is_active", true);

  const overriddenSourceIds = new Set(
    ((localeRows ?? []) as Array<{ inherits_from_id?: string | null }>)
      .map((r) => r.inherits_from_id)
      .filter(Boolean),
  );

  // Country rows not overridden at locale level
  const inheritedCountryRows = (countryRows ?? []).filter(
    (r: Record<string, unknown>) => !overriddenSourceIds.has(r.id as string),
  );

  return [
    ...(localeRows ?? []),
    ...inheritedCountryRows,
    ...(legacyRows ?? []),
  ] as T[];
}

// ── Inheritance mutation helpers ──────────────────────────────────────────────

/**
 * Break inheritance for a single content item.
 * Creates a locale-level copy of the country-level source row.
 * Returns the new override row id.
 */
export async function breakInheritance(
  sourceId: string,
  module: CmsModule,
  country: CountryCode,
  lang: LanguageCode,
): Promise<string> {
  const supabase = createClient();
  const localeId = toLocaleId(country, lang);
  const table = MODULE_TABLE[module];

  const { data: source, error: fetchErr } = await supabase
    .from(table)
    .select("*")
    .eq("id", sourceId)
    .single();
  if (fetchErr || !source) throw new Error(`Source content not found: ${sourceId}`);

  const {
    id: _id,
    created_at: _c,
    updated_at: _u,
    scope_type: _s,
    override_status: _o,
    inherits_from_id: _h,
    inheritance_enabled: _e,
    ...rest
  } = source as Record<string, unknown>;

  const { data: override, error: insertErr } = await supabase
    .from(table)
    .insert({
      ...rest,
      locale_id:           localeId,
      scope_type:          "locale",
      inherits_from_id:    sourceId,
      inheritance_enabled: false,
      override_status:     "overridden",
    })
    .select("id")
    .single();

  if (insertErr) throw insertErr;
  return (override as { id: string }).id;
}

/**
 * Restore inheritance: soft-delete the locale override so country content is used again.
 */
export async function restoreInheritance(
  overrideId: string,
  module: CmsModule,
): Promise<void> {
  const supabase = createClient();
  const table = MODULE_TABLE[module];

  const { error } = await supabase
    .from(table)
    .update({ override_status: "detached", is_active: false })
    .eq("id", overrideId);

  if (error) throw error;
}

/** Count how many locale overrides exist for a country-level source row */
export async function countLocaleOverrides(
  sourceId: string,
  module: CmsModule,
): Promise<number> {
  const supabase = createClient();
  const table = MODULE_TABLE[module];

  const { count } = await supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("inherits_from_id", sourceId)
    .eq("override_status", "overridden");

  return count ?? 0;
}
