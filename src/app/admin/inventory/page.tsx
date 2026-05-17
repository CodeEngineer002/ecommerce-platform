"use client";

import { useMemo, useState } from "react";

import { PageHeader } from "@/components/common/page-header";
import { LoadingState } from "@/components/feedback/loading-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

// ── Flat row type for display ─────────────────────────────────────────────────

interface InventoryRowData {
  variantId: string;
  productId: string;
  productName: string;
  productCode: string | null;
  sku: string | null;
  variantName: string;
  color: string | null;
  colorCode: string | null;
  size: string | null;
  sizeCode: string | null;
  quantity: number;
  reserved: number;
}

// ── Inventory row component ───────────────────────────────────────────────────

function InventoryRow({
  row,
  selectedCountry,
}: {
  row: InventoryRowData;
  selectedCountry: string;
}) {
  const isCountryMode = selectedCountry !== "global";
  const { data: countryInv } = useCountryInventory(row.variantId, selectedCountry);
  const { mutate: updateGlobal } = useAdminUpdateInventory();
  const { mutate: updateCountry, isPending } = useUpsertCountryInventory();

  const globalQuantity = row.quantity;
  const globalReserved = row.reserved;
  const inv = isCountryMode ? (countryInv ?? null) : null;
  const quantity = inv ? inv.quantity : globalQuantity;
  const reserved = inv ? (inv.reserved ?? 0) : globalReserved;
  const available = quantity - reserved;
  const isFallback = isCountryMode && !countryInv;

  const [inputVal, setInputVal] = useState<number | null>(null);

  function handleSave() {
    const qty = inputVal ?? quantity;
    if (isCountryMode) {
      updateCountry({ variantId: row.variantId, countryId: selectedCountry, quantity: qty });
    } else {
      updateGlobal({ variantId: row.variantId, quantity: qty });
    }
    setInputVal(null);
  }

  return (
    <tr className="hover:bg-muted/30">
      <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">
        {row.productCode ?? <span className="text-amber-500 text-[10px]">—</span>}
      </td>
      <td className="px-3 py-2.5 font-medium text-sm">{row.productName}</td>
      <td className="px-3 py-2.5">
        {row.sku ? (
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">{row.sku}</code>
        ) : (
          <span className="text-amber-500 text-xs">No SKU</span>
        )}
      </td>
      <td className="px-3 py-2.5 text-sm text-muted-foreground">
        {row.color ?? <span className="text-muted-foreground/40 text-xs">—</span>}
        {row.colorCode && (
          <span className="ml-1 font-mono text-[10px] text-muted-foreground/60">{row.colorCode}</span>
        )}
      </td>
      <td className="px-3 py-2.5 text-sm text-muted-foreground">
        {row.size ?? <span className="text-muted-foreground/40 text-xs">—</span>}
      </td>
      <td className="px-3 py-2.5 text-right text-sm">
        {quantity}
        {isFallback && <span className="ml-1 text-[10px] text-muted-foreground">global</span>}
      </td>
      <td className="px-3 py-2.5 text-right text-sm text-muted-foreground">{reserved}</td>
      <td className={`px-3 py-2.5 text-right text-sm font-medium ${available === 0 ? "text-red-600" : available <= 5 ? "text-amber-600" : "text-green-600"}`}>
        {available}
      </td>
      <td className="px-3 py-2.5 text-right">
        <div className="flex items-center justify-end gap-2">
          <Input
            type="number"
            className="h-7 w-20 text-right text-sm"
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
  const [searchQuery, setSearchQuery] = useState("");
  const [filterColor, setFilterColor] = useState("all");
  const [filterSize, setFilterSize] = useState("all");
  const [filterStock, setFilterStock] = useState<"all" | "low" | "oos">("all");

  // ── Flatten products → variants into rows ──────────────────────────────────
  const allRows = useMemo((): InventoryRowData[] => {
    return products.flatMap((product) => {
      const p = product as typeof product & {
        product_code?: string | null;
        variants?: Array<{
          id: string;
          name: string;
          sku?: string | null;
          color_code?: string | null;
          size_code?: string | null;
          options?: Record<string, string> | null;
          inventory_levels?: Array<{ quantity: number; reserved: number }> | null;
          inventory?: { quantity: number; reserved: number } | null;
        }>;
      };

      return (p.variants ?? []).map((variant) => {
        const opts = variant.options ?? {};
        const invLevel = variant.inventory_levels?.[0] ?? variant.inventory ?? null;
        return {
          variantId: variant.id,
          productId: p.id,
          productName: p.name,
          productCode: p.product_code ?? null,
          sku: variant.sku ?? null,
          variantName: variant.name,
          color: (opts as Record<string, string>).color ?? null,
          colorCode: variant.color_code ?? null,
          size: (opts as Record<string, string>).size ?? null,
          sizeCode: variant.size_code ?? null,
          quantity: invLevel?.quantity ?? 0,
          reserved: invLevel?.reserved ?? 0,
        };
      });
    });
  }, [products]);

  // ── Derive filter options ──────────────────────────────────────────────────
  const colorOptions = useMemo(() => {
    const seen = new Set<string>();
    allRows.forEach((r) => { if (r.color) seen.add(r.color); });
    return Array.from(seen).sort();
  }, [allRows]);

  const sizeOptions = useMemo(() => {
    const seen = new Set<string>();
    allRows.forEach((r) => { if (r.size) seen.add(r.size); });
    const sizeOrder = ["XS", "S", "M", "L", "XL", "XXL"];
    return Array.from(seen).sort((a, b) => {
      const ai = sizeOrder.indexOf(a);
      const bi = sizeOrder.indexOf(b);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return a.localeCompare(b);
    });
  }, [allRows]);

  // ── Apply filters ──────────────────────────────────────────────────────────
  const filteredRows = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return allRows.filter((row) => {
      if (q) {
        const matchesSku = row.sku?.toLowerCase().includes(q);
        const matchesCode = row.productCode?.toLowerCase().includes(q);
        const matchesName = row.productName.toLowerCase().includes(q);
        const matchesVariant = row.variantName.toLowerCase().includes(q);
        if (!matchesSku && !matchesCode && !matchesName && !matchesVariant) return false;
      }
      if (filterColor !== "all" && row.color !== filterColor) return false;
      if (filterSize !== "all" && row.size !== filterSize) return false;
      const available = row.quantity - row.reserved;
      if (filterStock === "oos" && available > 0) return false;
      if (filterStock === "low" && (available === 0 || available > 5)) return false;
      return true;
    });
  }, [allRows, searchQuery, filterColor, filterSize, filterStock]);

  // ── Stats ──────────────────────────────────────────────────────────────────
  const totalVariants = allRows.length;
  const oosCount = allRows.filter((r) => (r.quantity - r.reserved) === 0).length;
  const lowStockCount = allRows.filter((r) => { const a = r.quantity - r.reserved; return a > 0 && a <= 5; }).length;
  const noSkuCount = allRows.filter((r) => !r.sku).length;

  if (isLoading) return <LoadingState text="Loading inventory…" />;

  const hasFilters = searchQuery || filterColor !== "all" || filterSize !== "all" || filterStock !== "all";

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeader title="Inventory" description="Manage stock levels. Switch scope to set per-country stock." />
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Scope:</span>
          <Select value={selectedCountry} onValueChange={setSelectedCountry}>
            <SelectTrigger className="h-9 w-52">
              <SelectValue placeholder="Select scope" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="global">Global</SelectItem>
              {countries.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.iso_alpha2} · {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedCountry !== "global" && (
            <Badge variant="outline" className="text-xs">Falls back to Global if not set</Badge>
          )}
        </div>
      </div>

      {/* Stats bar */}
      <div className="flex flex-wrap gap-3">
        <div className="rounded-md border px-3 py-2 text-sm">
          <span className="text-muted-foreground">Total variants: </span>
          <span className="font-medium">{totalVariants}</span>
        </div>
        {oosCount > 0 && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm">
            <span className="text-red-700 font-medium">{oosCount} out of stock</span>
          </div>
        )}
        {lowStockCount > 0 && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm">
            <span className="text-amber-700 font-medium">{lowStockCount} low stock (≤5)</span>
          </div>
        )}
        {noSkuCount > 0 && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm">
            <span className="text-amber-700 font-medium">{noSkuCount} variants missing SKU</span>
          </div>
        )}
      </div>

      {/* Search + filters */}
      <div className="flex flex-wrap gap-2">
        <Input
          placeholder="Search by SKU, product code, name…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="h-9 w-72"
        />
        <Select value={filterColor} onValueChange={setFilterColor}>
          <SelectTrigger className="h-9 w-36">
            <SelectValue placeholder="Color" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All colors</SelectItem>
            {colorOptions.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterSize} onValueChange={setFilterSize}>
          <SelectTrigger className="h-9 w-32">
            <SelectValue placeholder="Size" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sizes</SelectItem>
            {sizeOptions.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterStock} onValueChange={(v) => setFilterStock(v as typeof filterStock)}>
          <SelectTrigger className="h-9 w-40">
            <SelectValue placeholder="Stock status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All stock</SelectItem>
            <SelectItem value="low">Low stock (≤5)</SelectItem>
            <SelectItem value="oos">Out of stock</SelectItem>
          </SelectContent>
        </Select>
        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            className="h-9 text-muted-foreground"
            onClick={() => { setSearchQuery(""); setFilterColor("all"); setFilterSize("all"); setFilterStock("all"); }}
          >
            Clear filters
          </Button>
        )}
        {hasFilters && (
          <span className="flex items-center text-sm text-muted-foreground">
            {filteredRows.length} of {totalVariants} variants
          </span>
        )}
      </div>

      {/* Table */}
      <div className="rounded-lg border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50">
            <tr>
              <th className="px-3 py-3 text-left font-medium text-xs text-muted-foreground uppercase tracking-wide">Code</th>
              <th className="px-3 py-3 text-left font-medium text-xs text-muted-foreground uppercase tracking-wide">Product</th>
              <th className="px-3 py-3 text-left font-medium text-xs text-muted-foreground uppercase tracking-wide">SKU</th>
              <th className="px-3 py-3 text-left font-medium text-xs text-muted-foreground uppercase tracking-wide">Color</th>
              <th className="px-3 py-3 text-left font-medium text-xs text-muted-foreground uppercase tracking-wide">Size</th>
              <th className="px-3 py-3 text-right font-medium text-xs text-muted-foreground uppercase tracking-wide">In Stock</th>
              <th className="px-3 py-3 text-right font-medium text-xs text-muted-foreground uppercase tracking-wide">Reserved</th>
              <th className="px-3 py-3 text-right font-medium text-xs text-muted-foreground uppercase tracking-wide">Available</th>
              <th className="px-3 py-3 text-right font-medium text-xs text-muted-foreground uppercase tracking-wide">Update</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filteredRows.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-muted-foreground text-sm">
                  {hasFilters ? "No variants match the current filters." : "No inventory data found."}
                </td>
              </tr>
            ) : (
              filteredRows.map((row) => (
                <InventoryRow
                  key={`${row.variantId}-${selectedCountry}`}
                  row={row}
                  selectedCountry={selectedCountry}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
