import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { ProductWithDetails } from "@/types";

import { ProductCard } from "./product-card";

export type ProductGridPriceMap = Record<
  string,
  { price: number; compare_price: number | null }
>;

interface ProductGridProps {
  products: ProductWithDetails[];
  loading?: boolean;
  skeletonCount?: number;
  className?: string;
  /**
   * Optional per-product display price overrides keyed by product.id.
   * Used by PLP / category / search grids to render the customer's currency
   * after a client-side resolve_variant_pricing_batch fetch. Pages that
   * don't (yet) opt in continue to show product.base_price.
   */
  priceMap?: ProductGridPriceMap;
}

export function ProductGrid({
  products,
  loading,
  skeletonCount = 8,
  className,
  priceMap,
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
        : products.map((product) => {
            const override = priceMap?.[product.id];
            return (
              <ProductCard
                key={product.id}
                product={product}
                displayPrice={override?.price}
                displayComparePrice={override?.compare_price}
              />
            );
          })}
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
