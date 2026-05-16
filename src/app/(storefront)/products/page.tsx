"use client";

import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useState } from "react";

import { Pagination } from "@/components/common/pagination";
import { SearchBar } from "@/components/common/search-bar";
import { FilterSidebar } from "@/components/ecommerce/filter-sidebar";
import { ProductGrid } from "@/components/ecommerce/product-grid";
import { EmptyState } from "@/components/feedback/empty-state";
import { useCategories } from "@/features/products/hooks/use-categories";
import { useProducts } from "@/features/products/hooks/use-products";
import type { ProductFilters } from "@/types";

function ProductsPageContent() {
  const searchParams = useSearchParams();
  const params = useParams<{ country?: string }>();
  const countryId = params.country ?? undefined;
  const { data: categories = [] } = useCategories();

  const [filters, setFilters] = useState<ProductFilters>({
    category: searchParams.get("category") ?? undefined,
    sortBy: (searchParams.get("sort") as ProductFilters["sortBy"]) ?? "newest",
    search: searchParams.get("q") ?? undefined,
    page: 1,
    pageSize: 12,
    countryId,
  });

  const { data, isLoading, isFetching } = useProducts(filters);

  const handleFiltersChange = useCallback((newFilters: ProductFilters) => {
    setFilters(newFilters);
  }, []);

  const handleReset = useCallback(() => {
    setFilters({ sortBy: "newest", page: 1, pageSize: 12, countryId });
  }, [countryId]);

  return (
    <div className="container py-8">
      {/* Top bar */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">All Products</h1>
          {data && (
            <p className="text-sm text-muted-foreground">
              {data.count} product{data.count !== 1 ? "s" : ""} found
            </p>
          )}
        </div>
        <SearchBar
          defaultValue={filters.search ?? ""}
          onSearch={(q) =>
            setFilters((f) => {
              const newSearch = q || undefined;
              // Skip re-render + refetch if value hasn't changed
              if (f.search === newSearch) return f;
              return { ...f, search: newSearch, page: 1 };
            })
          }
          className="w-72"
        />
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
              <div className={isFetching && !isLoading ? "opacity-60 transition-opacity duration-200" : "transition-opacity duration-200"}>
                <ProductGrid
                  products={data?.data ?? []}
                  loading={isLoading}
                  skeletonCount={12}
                />
              </div>
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
