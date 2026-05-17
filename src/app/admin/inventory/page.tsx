"use client";

import { useMemo, useState } from "react";

import { PageHeader } from "@/components/common/page-header";
import { LoadingState } from "@/components/feedback/loading-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAdminProducts } from "@/features/admin/hooks/use-admin-products";
import { useActiveCountries } from "@/features/admin/hooks/use-country-management";

import { AdjustmentModal, type AdjustmentTarget } from "./_components/adjustment-modal";
import { HistoryTab } from "./_components/history-tab";
import { MatrixView } from "./_components/matrix-view";
import { OverviewTab } from "./_components/overview-tab";
import { SkuTable } from "./_components/sku-table";
import type { InventoryRowData } from "./shared-types";

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AdminInventoryPage() {
  // Data
  const [currentPage, setCurrentPage] = useState(1);
  const { data: productsData, isLoading } = useAdminProducts(currentPage);
  const { data: countries = [] } = useActiveCountries();
  const products = productsData?.data ?? [];
  const totalPages = productsData?.totalPages ?? 1;

  // Scope
  const [selectedCountry, setSelectedCountry] = useState("global");

  // Shared filters (visible on Matrix + SKU tabs)
  const [searchQuery, setSearchQuery] = useState("");
  const [filterColor, setFilterColor] = useState("all");
  const [filterSize, setFilterSize] = useState("all");
  const [filterStock, setFilterStock] = useState<"all" | "low" | "oos">("all");

  // Adjustment modal state
  const [adjustmentTarget, setAdjustmentTarget] = useState<AdjustmentTarget | null>(null);

  // ── Flatten products → flat row list ──────────────────────────────────────
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
        const opts = (variant.options ?? {}) as Record<string, string>;
        const invLevel = variant.inventory_levels?.[0] ?? variant.inventory ?? null;
        return {
          variantId: variant.id,
          productId: p.id,
          productName: p.name,
          productCode: p.product_code ?? null,
          sku: variant.sku ?? null,
          variantName: variant.name,
          color: opts.color ?? null,
          colorCode: variant.color_code ?? null,
          size: opts.size ?? null,
          sizeCode: variant.size_code ?? null,
          quantity: invLevel?.quantity ?? 0,
          reserved: invLevel?.reserved ?? 0,
        };
      });
    });
  }, [products]);

  // ── Derive filter options ─────────────────────────────────────────────────
  const colorOptions = useMemo(() => {
    const seen = new Set<string>();
    allRows.forEach((r) => { if (r.color) seen.add(r.color); });
    return Array.from(seen).sort();
  }, [allRows]);

  const sizeOptions = useMemo(() => {
    const seen = new Set<string>();
    allRows.forEach((r) => { if (r.size) seen.add(r.size); });
    const sizeOrder = ["XS", "S", "M", "L", "XL", "XXL", "XXXL"];
    return Array.from(seen).sort((a, b) => {
      const ai = sizeOrder.indexOf(a);
      const bi = sizeOrder.indexOf(b);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return a.localeCompare(b);
    });
  }, [allRows]);

  // ── Apply filters ─────────────────────────────────────────────────────────
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

  const hasFilters = searchQuery || filterColor !== "all" || filterSize !== "all" || filterStock !== "all";

  function clearFilters() {
    setSearchQuery("");
    setFilterColor("all");
    setFilterSize("all");
    setFilterStock("all");
  }

  if (isLoading) return <LoadingState text="Loading inventory…" />;

  return (
    <div className="space-y-5">
      {/* ── Header row ───────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeader
          title="Inventory"
          description="Manage stock levels across your catalog."
        />
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
            <Badge variant="outline" className="text-xs">
              Falls back to Global if not set
            </Badge>
          )}
        </div>
      </div>

      {/* ── Tab shell ────────────────────────────────────────────────────── */}
      <Tabs defaultValue="matrix">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="matrix">By Product</TabsTrigger>
            <TabsTrigger value="sku">SKU View</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>

          {/* Page navigation (shared across product-data tabs) */}
          {totalPages > 1 && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>Page {currentPage} of {totalPages}</span>
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              >
                Prev
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </Button>
            </div>
          )}
        </div>

        {/* ── Shared search + filters row (shown for Matrix + SKU tabs) ── */}
        <TabsContent value="matrix" className="mt-4 space-y-4">
          <FilterBar
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            filterColor={filterColor}
            setFilterColor={setFilterColor}
            filterSize={filterSize}
            setFilterSize={setFilterSize}
            filterStock={filterStock}
            setFilterStock={setFilterStock}
            colorOptions={colorOptions}
            sizeOptions={sizeOptions}
            hasFilters={!!hasFilters}
            onClear={clearFilters}
            totalRows={allRows.length}
            filteredCount={filteredRows.length}
          />
          <MatrixView
            rows={filteredRows}
            onAdjust={setAdjustmentTarget}
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
          />
        </TabsContent>

        <TabsContent value="sku" className="mt-4 space-y-4">
          <FilterBar
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            filterColor={filterColor}
            setFilterColor={setFilterColor}
            filterSize={filterSize}
            setFilterSize={setFilterSize}
            filterStock={filterStock}
            setFilterStock={setFilterStock}
            colorOptions={colorOptions}
            sizeOptions={sizeOptions}
            hasFilters={!!hasFilters}
            onClear={clearFilters}
            totalRows={allRows.length}
            filteredCount={filteredRows.length}
          />
          <SkuTable
            rows={filteredRows}
            selectedCountry={selectedCountry}
            onAdjust={setAdjustmentTarget}
          />
        </TabsContent>

        <TabsContent value="overview" className="mt-4">
          <OverviewTab rows={allRows} totalProducts={products.length} />
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <HistoryTab />
        </TabsContent>
      </Tabs>

      {/* ── Adjustment Modal (global, rendered at page level) ─────────── */}
      <AdjustmentModal
        target={adjustmentTarget}
        onClose={() => setAdjustmentTarget(null)}
      />
    </div>
  );
}

// ── Shared Filter Bar ─────────────────────────────────────────────────────────

interface FilterBarProps {
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  filterColor: string;
  setFilterColor: (v: string) => void;
  filterSize: string;
  setFilterSize: (v: string) => void;
  filterStock: "all" | "low" | "oos";
  setFilterStock: (v: "all" | "low" | "oos") => void;
  colorOptions: string[];
  sizeOptions: string[];
  hasFilters: boolean;
  onClear: () => void;
  totalRows: number;
  filteredCount: number;
}

function FilterBar({
  searchQuery, setSearchQuery,
  filterColor, setFilterColor,
  filterSize, setFilterSize,
  filterStock, setFilterStock,
  colorOptions, sizeOptions,
  hasFilters, onClear,
  totalRows, filteredCount,
}: FilterBarProps) {
  return (
    <div className="flex flex-wrap gap-2">
      <Input
        placeholder="Search SKU, code, product…"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className="h-9 w-64"
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
      <Select value={filterStock} onValueChange={(v) => setFilterStock(v as "all" | "low" | "oos")}>
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
        <>
          <Button variant="ghost" size="sm" className="h-9 text-muted-foreground" onClick={onClear}>
            Clear filters
          </Button>
          <span className="flex items-center text-sm text-muted-foreground">
            {filteredCount} of {totalRows} variants
          </span>
        </>
      )}
    </div>
  );
}
