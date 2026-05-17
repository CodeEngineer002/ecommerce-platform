"use client";

/**
 * Shared country-scoped inventory hooks extracted from the original page.tsx.
 * Used by SkuTable to show country-specific quantities when a country filter is active.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-hot-toast";
import { createClient } from "@/lib/supabase/client";

async function getCountryInventory(variantId: string, countryId: string) {
  const supabase = createClient();
  const { data } = await supabase
    .from("country_inventory")
    .select("*")
    .eq("variant_id", variantId)
    .eq("country_id", countryId)
    .maybeSingle();
  return data;
}

async function upsertCountryInventory(variantId: string, countryId: string, quantity: number) {
  const supabase = createClient();
  const { error } = await supabase
    .from("country_inventory")
    .upsert(
      { variant_id: variantId, country_id: countryId, quantity, reserved: 0 },
      { onConflict: "variant_id,country_id" },
    );
  if (error) throw error;
}

export function useCountryInventory(variantId: string, countryId: string | null | undefined) {
  return useQuery({
    queryKey: ["country_inventory", variantId, countryId],
    queryFn: () => getCountryInventory(variantId, countryId!),
    enabled: !!countryId && countryId !== "global",
    staleTime: 30 * 1000,
  });
}

export function useUpsertCountryInventory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      variantId,
      countryId,
      quantity,
    }: {
      variantId: string;
      countryId: string;
      quantity: number;
    }) => upsertCountryInventory(variantId, countryId, quantity),
    onSuccess: (_, { variantId, countryId }) => {
      queryClient.invalidateQueries({ queryKey: ["country_inventory", variantId, countryId] });
      toast.success("Inventory updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
