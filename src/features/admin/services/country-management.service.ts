import { createClient } from "@/lib/supabase/client";

export interface CountryRow {
  id: string;
  name: string;
  native_name: string;
  iso_alpha2: string;
  iso_alpha3: string;
  default_language_id: string;
  fallback_language_id: string;
  currency_code: string;
  timezone: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

export interface LocaleRow {
  id: string;
  country_id: string;
  language_id: string;
  is_default: boolean;
  is_active: boolean;
}

export interface LanguageRow {
  id: string;
  name: string;
  native_name: string;
  direction: string;
  bcp47: string;
  is_active: boolean;
}

export interface AddCountryPayload {
  id: string;           // e.g. 'jp'
  name: string;
  native_name: string;
  iso_alpha2: string;
  iso_alpha3: string;
  default_language_id: string;
  fallback_language_id: string;
  currency_code: string;
  timezone: string;
  sort_order?: number;
  extra_language_ids?: string[]; // additional languages beyond default
}

// ── Read ──────────────────────────────────────────────────────────────────────

export async function getAllCountries(): Promise<CountryRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("countries")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function getActiveCountries(): Promise<CountryRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("countries")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function getCountryLocales(countryId: string): Promise<LocaleRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("locales")
    .select("*")
    .eq("country_id", countryId)
    .order("is_default", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getAllLanguages(): Promise<LanguageRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("languages")
    .select("*")
    .eq("is_active", true)
    .order("name", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

// ── Write ─────────────────────────────────────────────────────────────────────

export async function addCountry(payload: AddCountryPayload): Promise<CountryRow> {
  const supabase = createClient();

  // 1. Insert country
  const { data: country, error: cErr } = await supabase
    .from("countries")
    .insert({
      id: payload.id.toLowerCase(),
      name: payload.name,
      native_name: payload.native_name,
      iso_alpha2: payload.iso_alpha2.toUpperCase(),
      iso_alpha3: payload.iso_alpha3.toUpperCase(),
      default_language_id: payload.default_language_id,
      fallback_language_id: payload.fallback_language_id,
      currency_code: payload.currency_code.toUpperCase(),
      timezone: payload.timezone,
      sort_order: payload.sort_order ?? 99,
      is_active: true,
    })
    .select()
    .single();
  if (cErr) throw cErr;

  // 2. Create default locale
  const defaultLocaleId = `${payload.default_language_id}-${payload.iso_alpha2.toUpperCase()}`;
  const { error: lErr } = await supabase.from("locales").insert({
    id: defaultLocaleId,
    country_id: payload.id.toLowerCase(),
    language_id: payload.default_language_id,
    is_default: true,
    is_active: true,
  });
  if (lErr) throw lErr;

  // 3. Create additional language locales
  const extraLangs = (payload.extra_language_ids ?? []).filter(
    (l) => l !== payload.default_language_id
  );
  if (extraLangs.length > 0) {
    const extraLocales = extraLangs.map((lang) => ({
      id: `${lang}-${payload.iso_alpha2.toUpperCase()}`,
      country_id: payload.id.toLowerCase(),
      language_id: lang,
      is_default: false,
      is_active: true,
    }));
    const { error: extraErr } = await supabase.from("locales").insert(extraLocales);
    if (extraErr) throw extraErr;
  }

  // 4. Create region_config with sensible defaults
  await supabase.from("region_configs").insert({
    country_id: payload.id.toLowerCase(),
    currency_code: payload.currency_code.toUpperCase(),
    tax_rate: 0,
    tax_inclusive: false,
    tax_label: "Tax",
    free_shipping_threshold: null,
    default_shipping_cost: 0,
    date_format: "DD/MM/YYYY",
    number_format: "1,234.56",
  }).select().maybeSingle(); // ignore if fails — region_configs may have unique constraint

  return country;
}

export async function toggleCountryActive(countryId: string, isActive: boolean): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("countries")
    .update({ is_active: isActive })
    .eq("id", countryId);
  if (error) throw error;
}

export async function updateCountrySortOrder(updates: { id: string; sort_order: number }[]): Promise<void> {
  const supabase = createClient();
  await Promise.all(
    updates.map(({ id, sort_order }) =>
      supabase.from("countries").update({ sort_order }).eq("id", id)
    )
  );
}

export async function addLanguageToCountry(
  countryId: string,
  languageId: string,
  isoAlpha2: string
): Promise<void> {
  const supabase = createClient();
  const localeId = `${languageId}-${isoAlpha2.toUpperCase()}`;
  const { error } = await supabase.from("locales").insert({
    id: localeId,
    country_id: countryId,
    language_id: languageId,
    is_default: false,
    is_active: true,
  });
  if (error) throw error;
}

export async function removeLanguageFromCountry(localeId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("locales").delete().eq("id", localeId);
  if (error) throw error;
}
