"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-hot-toast";

import {
  addCountry,
  addLanguageToCountry,
  getActiveCountries,
  getAllCountries,
  getAllLanguages,
  getCountryLocales,
  removeLanguageFromCountry,
  toggleCountryActive,
  type AddCountryPayload,
} from "../services/country-management.service";

export const countryKeys = {
  all: ["countries"] as const,
  active: ["countries", "active"] as const,
  locales: (countryId: string) => ["countries", countryId, "locales"] as const,
  languages: ["languages"] as const,
};

export function useAllCountries() {
  return useQuery({
    queryKey: countryKeys.all,
    queryFn: getAllCountries,
    staleTime: 5 * 60 * 1000,
  });
}

export function useActiveCountries() {
  return useQuery({
    queryKey: countryKeys.active,
    queryFn: getActiveCountries,
    staleTime: 5 * 60 * 1000,
  });
}

export function useCountryLocales(countryId: string) {
  return useQuery({
    queryKey: countryKeys.locales(countryId),
    queryFn: () => getCountryLocales(countryId),
    enabled: !!countryId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useAllLanguages() {
  return useQuery({
    queryKey: countryKeys.languages,
    queryFn: getAllLanguages,
    staleTime: 60 * 60 * 1000,
  });
}

export function useAddCountry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: AddCountryPayload) => addCountry(payload),
    onSuccess: (country) => {
      queryClient.invalidateQueries({ queryKey: countryKeys.all });
      queryClient.invalidateQueries({ queryKey: countryKeys.active });
      toast.success(`${country.name} added successfully`);
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useToggleCountryActive() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      toggleCountryActive(id, isActive),
    onSuccess: (_, { isActive }) => {
      queryClient.invalidateQueries({ queryKey: countryKeys.all });
      queryClient.invalidateQueries({ queryKey: countryKeys.active });
      toast.success(isActive ? "Country enabled" : "Country disabled");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useAddLanguageToCountry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      countryId,
      languageId,
      isoAlpha2,
    }: {
      countryId: string;
      languageId: string;
      isoAlpha2: string;
    }) => addLanguageToCountry(countryId, languageId, isoAlpha2),
    onSuccess: (_, { countryId }) => {
      queryClient.invalidateQueries({ queryKey: countryKeys.locales(countryId) });
      queryClient.invalidateQueries({ queryKey: countryKeys.active });
      toast.success("Language added");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useRemoveLanguageFromCountry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      localeId,
      countryId,
    }: {
      localeId: string;
      countryId: string;
    }) => removeLanguageFromCountry(localeId),
    onSuccess: (_, { countryId }) => {
      queryClient.invalidateQueries({ queryKey: countryKeys.locales(countryId) });
      toast.success("Language removed");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
