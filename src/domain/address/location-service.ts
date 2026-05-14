/**
 * Location domain — server-side lookup service
 *
 * Provides country-specific administrative region + city data.
 * Used by checkout address validation and location API routes.
 */
import "server-only";

import { createServiceClient } from "@/lib/supabase/server";

// ── Public types ──────────────────────────────────────────────────────────────

export interface AdministrativeRegion {
  code: string;
  name: string;
  type: string;
}

export interface City {
  id: string;
  name: string;
  administrative_region_code: string;
}

export interface LocationAddressRules {
  country_id: string;
  postal_code_required: boolean;
  postal_code_regex: string | null;
  postal_code_example: string | null;
  postal_code_label: string;
  state_required: boolean;
  state_label: string;
  city_required: boolean;
  city_label: string;
  phone_required: boolean;
  rtl_layout: boolean;
  allows_free_text_city: boolean;
  allows_free_text_state: boolean;
}

// ── Region cache (in-process, per cold-start) ─────────────────────────────────

const regionCache = new Map<string, AdministrativeRegion[]>();
const rulesCache  = new Map<string, LocationAddressRules>();

// ── Get regions for a country ─────────────────────────────────────────────────

export async function getRegions(countryCode: string): Promise<AdministrativeRegion[]> {
  const key = countryCode.toUpperCase();
  if (regionCache.has(key)) return regionCache.get(key)!;

  const db = createServiceClient();
  const { data, error } = await db
    .from("administrative_regions")
    .select("code, name, type")
    .eq("country_code", key)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error || !data) return [];
  const regions = data as AdministrativeRegion[];
  regionCache.set(key, regions);
  return regions;
}

// ── Search cities ─────────────────────────────────────────────────────────────

export async function searchCities(
  countryCode: string,
  regionCode: string,
  query: string,
  limit = 20,
): Promise<City[]> {
  const db = createServiceClient();
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    // Return first N cities for the region (useful for initial dropdown)
    const { data } = await db
      .from("cities")
      .select("id, name, administrative_region_code")
      .eq("country_code", countryCode.toUpperCase())
      .eq("administrative_region_code", regionCode.toUpperCase())
      .eq("is_active", true)
      .order("name", { ascending: true })
      .limit(limit);
    return (data ?? []) as City[];
  }

  const { data } = await db
    .from("cities")
    .select("id, name, administrative_region_code")
    .eq("country_code", countryCode.toUpperCase())
    .eq("administrative_region_code", regionCode.toUpperCase())
    .eq("is_active", true)
    .ilike("normalized_name", `%${normalizedQuery}%`)
    .order("name", { ascending: true })
    .limit(limit);

  return (data ?? []) as City[];
}

// ── Get address rules for a country ──────────────────────────────────────────

export async function getLocationAddressRules(
  countryIso: string,
): Promise<LocationAddressRules | null> {
  // country_id in DB is lowercase: 'us', 'in', 'de'
  // countryIso is uppercase ISO alpha-2: 'US', 'IN', 'DE'
  const id = countryIso.toLowerCase();
  // Map 'gb' → 'uk' for UK (our DB uses 'uk' as country_id)
  const dbId = id === "gb" ? "uk" : id;

  if (rulesCache.has(dbId)) return rulesCache.get(dbId)!;

  const db = createServiceClient();
  const { data, error } = await db
    .from("address_country_rules")
    .select(
      "country_id, postal_code_required, postal_code_regex, postal_code_example, postal_code_label, state_required, state_label, city_required, city_label, phone_required, rtl_layout, allows_free_text_city, allows_free_text_state",
    )
    .eq("country_id", dbId)
    .single();

  if (error || !data) return null;
  const rules = data as unknown as LocationAddressRules;
  rulesCache.set(dbId, rules);
  return rules;
}

// ── Validate region belongs to country ───────────────────────────────────────

export async function isValidRegion(
  countryCode: string,
  regionCode: string,
): Promise<boolean> {
  const regions = await getRegions(countryCode);
  return regions.some((r) => r.code.toUpperCase() === regionCode.toUpperCase());
}

// ── Validate city belongs to country + region ─────────────────────────────────

export async function isValidCity(
  countryCode: string,
  regionCode: string,
  cityName: string,
): Promise<boolean> {
  const db = createServiceClient();
  const { data } = await db
    .from("cities")
    .select("id")
    .eq("country_code", countryCode.toUpperCase())
    .eq("administrative_region_code", regionCode.toUpperCase())
    .ilike("normalized_name", cityName.trim().toLowerCase())
    .eq("is_active", true)
    .limit(1);
  return (data ?? []).length > 0;
}
