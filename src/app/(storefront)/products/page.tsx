"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useState } from "react";

import { Pagination } from "@/components/common/pagination";
import { SearchBar } from "@/components/common/search-bar";
import { FilterSidebar } from "@/components/ecommerce/filter-sidebar";
import { ProductGrid } from "@/components/ecommerce/product-grid";
import { EmptyState } from "@/components/feedback/empty-state";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCategories } from "@/features/products/hooks/use-categories";
import { useProducts } from "@/features/products/hooks/use-products";
import { SORT_OPTIONS } from "@/lib/constants";
import type { ProductFilters } from "@/types";

function ProductsPageContent() {
  const searchParams = useSearchParams();
  const { data: categories = [] } = useCategories();

  const [filters, setFilters] = useState<ProductFilters>({
    category: searchParams.get("category") ?? undefined,
    sortBy: (searchParams.get("sort") as ProductFilters["sortBy"]) ?? "newest",
    search: searchParams.get("q") ?? undefined,
    page: 1,
    pageSize: 12,
  });

  const { data, isLoading } = useProducts(filters);

  const handleFiltersChange = useCallback((newFilters: ProductFilters) => {
    setFilters(newFilters);
  }, []);

  const handleReset = useCallback(() => {
    setFilters({ sortBy: "newest", page: 1, pageSize: 12 });
  }, []);

  return (
    <div className="container py-8">
      {/* Top bar */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">All Products</h1>
          {data && (
            <p className="text-sm text-muted-foreground">
              {data.count} products found
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <SearchBar
            defaultValue={filters.search}
            onSearch={(q) => setFilters((f) => ({ ...f, search: q, page: 1 }))}
            className="w-64"
          />
          <Select
            value={filters.sortBy}
            onValueChange={(v) =>
              setFilters((f) => ({ ...f, sortBy: v as ProductFilters["sortBy"], page: 1 }))
            }
          >
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex gap-8">
        {/* Filters */}
        <FilterSidebar
          filters={filters}
          categories={categories}
          onChange={handleFiltersChange}
          onReset={handleReset}
        />

        {/* Products */}
        <div className="flex-1 space-y-6">
          {!isLoading && data?.data.length === 0 ? (
            <EmptyState
              title="No products found"
              description="Try adjusting your filters or search query"
              action={{ label: "Clear filters", onClick: handleReset }}
            />
          ) : (
            <>
              <ProductGrid
                products={data?.data ?? []}
                loading={isLoading}
                skeletonCount={12}
              />
              {data && data.totalPages > 1 && (
                <div className="flex justify-center">
                  <Pagination
                    page={filters.page ?? 1}
                    totalPages={data.totalPages}
                    onPageChange={(p) => setFilters((f) => ({ ...f, page: p }))}
                  />
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ProductsPage() {
  return (
    <Suspense>
      <ProductsPageContent />
    </Suspense>
  );
}
