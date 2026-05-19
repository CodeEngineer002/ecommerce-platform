"use client";

import { Heart } from "lucide-react";

import { ProductGrid } from "@/components/ecommerce/product-grid";
import { EmptyState } from "@/components/feedback/empty-state";
import { ROUTES } from "@/lib/constants";
import { useWishlistStore } from "@/store/wishlist-store";

export default function WishlistPage() {
  const { items } = useWishlistStore();

  return (
    <div className="container py-8">
      <h1 className="mb-8 text-2xl font-bold">My Wishlist ({items.length})</h1>

      {items.length === 0 ? (
        <EmptyState
          icon={Heart}
          title="Your wishlist is empty"
          description="Save items you love to come back to them later."
          action={{ label: "Browse Products", href: ROUTES.products }}
        />
      ) : (
        <ProductGrid
          products={items.map((p) => ({
            ...p,
            category: p.category ?? null,
          }))}
        />
      )}
    </div>
  );
}
