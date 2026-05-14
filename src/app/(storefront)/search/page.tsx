"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { ProductGrid } from "@/components/ecommerce/product-grid";
import { EmptyState } from "@/components/feedback/empty-state";
import { SearchBar } from "@/components/common/search-bar";
import { useProductSearch } from "@/features/products/hooks/use-products";
import { SearchX } from "lucide-react";

function SearchResults() {
  const searchParams = useSearchParams();
  const query = searchParams.get("q") ?? "";
  const { data: results = [], isLoading } = useProductSearch(query);

  return (
    <div className="container py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Search</h1>
        {query && (
          <p className="text-sm text-muted-foreground">
            {isLoading ? "Searching…" : `${results.length} results for "${query}"`}
          </p>
        )}
      </div>
      <SearchBar defaultValue={query} className="max-w-xl" />
      {!isLoading && query && results.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title="No results found"
          description={`We couldn't find anything for "${query}". Try a different search term.`}
        />
      ) : (
        <ProductGrid products={results} loading={isLoading} />
      )}
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense>
      <SearchResults />
    </Suspense>
  );
}
