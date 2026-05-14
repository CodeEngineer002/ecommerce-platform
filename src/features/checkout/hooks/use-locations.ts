"use client";

import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";

import { queryKeys } from "@/lib/query-keys";

// ── Types (mirrors location-service server types, safe for client) ────────────

export interface Region {
  code: string;
  name: string;
  type: string;
}

export interface CityOption {
  id: string;
  name: string;
  administrative_region_code: string;
}

export interface LocationAddressRules {
  country_code: string;
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

// ── useRegions — load all regions for a country ───────────────────────────────

export function useRegions(countryCode: string) {
  return useQuery<Region[]>({
    queryKey: queryKeys.locations.regions(countryCode),
    queryFn: async () => {
      const res = await fetch(`/api/locations/regions?country=${countryCode}`);
      if (!res.ok) throw new Error("Failed to load regions");
      const json = await res.json() as { data?: { regions: Region[] } };
      return json.data?.regions ?? [];
    },
    enabled: !!countryCode && countryCode.length === 2,
    staleTime: 60 * 60 * 1000, // 1 hour — reference data
    gcTime: 24 * 60 * 60 * 1000,
  });
}

// ── useLocationRules — load address form rules for a country ──────────────────

export function useLocationRules(countryCode: string) {
  return useQuery<LocationAddressRules>({
    queryKey: queryKeys.locations.addressRules(countryCode),
    queryFn: async () => {
      const res = await fetch(`/api/locations/address-rules?country=${countryCode}`);
      if (!res.ok) throw new Error("Failed to load address rules");
      const json = await res.json() as { data?: { rules: LocationAddressRules } };
      return json.data!.rules;
    },
    enabled: !!countryCode && countryCode.length === 2,
    staleTime: 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
  });
}

// ── useCitySearch — debounced async city search ───────────────────────────────

export function useCitySearch(
  countryCode: string,
  regionCode: string,
  query: string,
  debounceMs = 300,
) {
  const [debouncedQuery, setDebouncedQuery] = useState(query);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setDebouncedQuery(query), debounceMs);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [query, debounceMs]);

  return useQuery<CityOption[]>({
    queryKey: queryKeys.locations.cities(countryCode, regionCode, debouncedQuery),
    queryFn: async () => {
      const params = new URLSearchParams({
        country: countryCode,
        region: regionCode,
        q: debouncedQuery,
        limit: "20",
      });
      const res = await fetch(`/api/locations/cities?${params.toString()}`);
      if (!res.ok) return [];
      const json = await res.json() as { data?: { cities: CityOption[] } };
      return json.data?.cities ?? [];
    },
    enabled: !!countryCode && !!regionCode,
    staleTime: 5 * 60 * 1000, // 5 min
    placeholderData: (prev) => prev,
  });
}

// ── useCitySearchState — helper managing city input + search state ─────────────

export function useCitySearchState(countryCode: string, regionCode: string) {
  const [inputValue, setInputValue] = useState("");
  const { data: cities = [], isFetching } = useCitySearch(
    countryCode,
    regionCode,
    inputValue,
  );

  const reset = useCallback(() => setInputValue(""), []);

  return { inputValue, setInputValue, cities, isFetching, reset };
}
