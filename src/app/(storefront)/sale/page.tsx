"use client";

import { Tag } from "lucide-react";
import { useState } from "react";

import { Pagination } from "@/components/common/pagination";
import { ProductGrid } from "@/components/ecommerce/product-grid";
import { EmptyState } from "@/components/feedback/empty-state";
import { useSaleProducts } from "@/features/products/hooks/use-products";
import { ROUTES } from "@/lib/constants";

export default function SalePage() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useSaleProducts(page);

  return (
    <div className="container py-8 space-y-6">
      {/* Header */}
      <div className="rounded-xl bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border px-6 py-5">
        <div className="flex items-center gap-3">
          <Tag className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Sale</h1>
            <p className="text-sm text-muted-foreground">
              {data ? `${data.count} discounted product${data.count !== 1 ? "s" : ""}` : "Loading…"}
            </p>
          </div>
        </div>
      </div>

      {/* Grid */}
      {!isLoading && data?.data.length === 0 ? (
        <EmptyState
          icon={Tag}
          title="No sale items right now"
          description="Check back soon — new deals drop regularly."
          action={{ label: "Browse All Products", href: ROUTES.products }}
        />
      ) : (
        <>
          <ProductGrid products={data?.data ?? []} loading={isLoading} />
          {data && data.totalPages > 1 && (
            <div className="flex justify-center">
              <Pagination page={page} totalPages={data.totalPages} onPageChange={setPage} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
