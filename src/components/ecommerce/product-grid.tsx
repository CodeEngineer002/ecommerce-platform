import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { ProductWithDetails } from "@/types";

import { ProductCard } from "./product-card";

interface ProductGridProps {
  products: ProductWithDetails[];
  loading?: boolean;
  skeletonCount?: number;
  className?: string;
}

export function ProductGrid({
  products,
  loading,
  skeletonCount = 8,
  className,
}: ProductGridProps) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4",
        className
      )}
    >
      {loading
        ? Array.from({ length: skeletonCount }).map((_, i) => (
            <ProductCardSkeleton key={i} />
          ))
        : products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
    </div>
  );
}

function ProductCardSkeleton() {
  return (
    <div className="rounded-lg border bg-card">
      <Skeleton className="aspect-square rounded-t-lg rounded-b-none" />
      <div className="space-y-2 p-3">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-5 w-1/3" />
      </div>
    </div>
  );
}
