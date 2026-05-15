"use client";

import { useState } from "react";

import { PageHeader } from "@/components/common/page-header";
import { LoadingState } from "@/components/feedback/loading-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAdminProducts, useAdminUpdateInventory } from "@/features/admin/hooks/use-admin-products";
import { useActiveCountries } from "@/features/admin/hooks/use-country-management";
import { createClient } from "@/lib/supabase/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-hot-toast";

// ── Country inventory helpers ─────────────────────────────────────────────────

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
      { onConflict: "variant_id,country_id" }
    );
  if (error) throw error;
}

function useCountryInventory(variantId: string, countryId: string | null) {
  return useQuery({
    queryKey: ["country_inventory", variantId, countryId],
    queryFn: () => getCountryInventory(variantId, countryId!),
    enabled: !!countryId && countryId !== "global",
    staleTime: 30 * 1000,
  });
}

function useUpsertCountryInventory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ variantId, countryId, quantity }: { variantId: string; countryId: string; quantity: number }) =>
      upsertCountryInventory(variantId, countryId, quantity),
    onSuccess: (_, { variantId, countryId }) => {
      queryClient.invalidateQueries({ queryKey: ["country_inventory", variantId, countryId] });
      toast.success("Inventory updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

// ── Inventory row ─────────────────────────────────────────────────────────────

function InventoryRow({
  productName,
  variant,
  selectedCountry,
}: {
  productName: string;
  variant: { id: string; name: string; inventory?: { quantity: number; reserved: number } | null };
  selectedCountry: string;
}) {
  const isCountryMode = selectedCountry !== "global";
  const { data: countryInv } = useCountryInventory(variant.id, selectedCountry);
  const { mutate: updateGlobal } = useAdminUpdateInventory();
  const { mutate: updateCountry, isPending } = useUpsertCountryInventory();

  const globalInv = variant.inventory;
  const inv = isCountryMode ? (countryInv ?? globalInv) : globalInv;
  const quantity = inv?.quantity ?? 0;
  const reserved = inv?.reserved ?? 0;
  const available = quantity - reserved;
  const isFallback = isCountryMode && !countryInv;

  const [inputVal, setInputVal] = useState<number | null>(null);

  function handleSave() {
    const qty = inputVal ?? quantity;
    if (isCountryMode) {
      updateCountry({ variantId: variant.id, countryId: selectedCountry, quantity: qty });
    } else {
      updateGlobal({ variantId: variant.id, quantity: qty });
    }
    setInputVal(null);
  }

  return (
    <tr className="hover:bg-muted/30">
      <td className="px-4 py-3 font-medium">{productName}</td>
      <td className="px-4 py-3 text-muted-foreground">{variant.name}</td>
      <td className="px-4 py-3 text-right">
        {quantity}
        {isFallback && <span className="ml-1 text-[10px] text-muted-foreground">global</span>}
      </td>
      <td className="px-4 py-3 text-right text-muted-foreground">{reserved}</td>
      <td className={`px-4 py-3 text-right font-medium ${available <= 5 ? "text-red-600" : "text-green-600"}`}>
        {available}
      </td>
      <td className="px-4 py-3 text-right">
        <div className="flex items-center justify-end gap-2">
          <Input
            type="number"
            className="h-8 w-20 text-right"
            value={inputVal ?? quantity}
            min={0}
            onChange={(e) => setInputVal(Number(e.target.value))}
          />
          <Button size="sm" variant="outline" disabled={isPending || inputVal === null} onClick={handleSave}>
            Save
          </Button>
        </div>
      </td>
    </tr>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AdminInventoryPage() {
  const { data: productsData, isLoading } = useAdminProducts();
  const { data: countries = [] } = useActiveCountries();
  const products = productsData?.data ?? [];
  const [selectedCountry, setSelectedCountry] = useState("global");

  if (isLoading) return <LoadingState text="Loading inventory…" />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeader title="Inventory" description="Manage stock levels. Switch scope to set per-country stock." />
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm text-muted-foreground">Scope:</span>
          <button
            onClick={() => setSelectedCountry("global")}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              selectedCountry === "global" ? "bg-primary text-primary-foreground shadow-sm" : "border hover:bg-muted"
            }`}
          >
            Global
          </button>
          {countries.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedCountry(c.id)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                selectedCountry === c.id ? "bg-primary text-primary-foreground shadow-sm" : "border hover:bg-muted"
              }`}
            >
              {c.iso_alpha2} · {c.name}
            </button>
          ))}
          {selectedCountry !== "global" && (
            <Badge variant="outline" className="text-xs">
              Country pool — falls back to Global if not set
            </Badge>
          )}
        </div>
      </div>

      <div className="rounded-lg border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Product</th>
              <th className="px-4 py-3 text-left font-medium">Variant</th>
              <th className="px-4 py-3 text-right font-medium">In Stock</th>
              <th className="px-4 py-3 text-right font-medium">Reserved</th>
              <th className="px-4 py-3 text-right font-medium">Available</th>
              <th className="px-4 py-3 text-right font-medium">Update</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {products.flatMap((product) => {
              const p = product as typeof product & {
                variants?: Array<{ id: string; name: string; inventory?: { quantity: number; reserved: number } | null }>;
              };
              return (p.variants ?? []).map((variant) => (
                <InventoryRow
                  key={`${variant.id}-${selectedCountry}`}
                  productName={product.name}
                  variant={variant}
                  selectedCountry={selectedCountry}
                />
              ));
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
