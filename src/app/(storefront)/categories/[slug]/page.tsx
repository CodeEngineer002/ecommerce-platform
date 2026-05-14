"use client";

import { notFound, useParams } from "next/navigation";
import { useState } from "react";

import { Pagination } from "@/components/common/pagination";
import { ProductGrid } from "@/components/ecommerce/product-grid";
import { EmptyState } from "@/components/feedback/empty-state";
import { useCategory } from "@/features/products/hooks/use-categories";
import { useProducts } from "@/features/products/hooks/use-products";


export default function CategoryPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data: category, isLoading: catLoading } = useCategory(slug);
  const [page, setPage] = useState(1);
  const { data, isLoading: productsLoading } = useProducts({ category: slug, page, pageSize: 12 });

  if (!catLoading && !category) notFound();

  return (
    <div className="container py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{category?.name ?? "Category"}</h1>
        {category?.description && (
          <p className="text-muted-foreground">{category.description}</p>
        )}
        {data && <p className="text-sm text-muted-foreground">{data.count} products</p>}
      </div>

      {!productsLoading && data?.data.length === 0 ? (
        <EmptyState title="No products in this category" action={{ label: "Browse All Products", href: "/products" }} />
      ) : (
        <>
          <ProductGrid products={data?.data ?? []} loading={productsLoading} />
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
