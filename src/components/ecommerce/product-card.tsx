"use client";

import { Heart, ShoppingCart, Star } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAddCartItem } from "@/features/cart/hooks/use-cart-mutations";
import { IMAGE_PLACEHOLDER, ROUTES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { useCartStore } from "@/store/cart-store";
import { useWishlistStore } from "@/store/wishlist-store";
import type { ProductWithDetails } from "@/types";

import { PriceDisplay } from "./price-display";

interface ProductCardProps {
  product: ProductWithDetails;
  className?: string;
  showQuickAdd?: boolean;
}

export function ProductCard({ product, className, showQuickAdd = true }: ProductCardProps) {
  const primaryImage = product.images.find((i) => i.is_primary) ?? product.images[0];
  const defaultVariant = product.variants[0];
  const { toggleItem, hasItem } = useWishlistStore();
  const { openCart } = useCartStore();
  const { mutate: addCartItem } = useAddCartItem();

  // Defer wishlist reads until after hydration — Zustand persist loads from
  // localStorage on the client only, so server-rendered HTML never knows the
  // wishlist state. Without this guard the aria-label and Heart className differ
  // between SSR and client, causing a React hydration mismatch.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const isWishlisted = mounted && hasItem(product.id);

  const handleQuickAdd = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!defaultVariant) return;
    addCartItem(
      {
        variantId: defaultVariant.id,
        quantity: 1,
        optimisticItem: {
          id: `${defaultVariant.id}-${Date.now()}`,
          cart_id: "",
          variant_id: defaultVariant.id,
          quantity: 1,
          unit_price_snapshot: null,
          added_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          variant: { ...defaultVariant, product: { ...product, images: product.images } },
        },
      },
    );
    openCart();
  };

  const discount =
    product.compare_price && product.compare_price > product.base_price
      ? Math.round(((product.compare_price - product.base_price) / product.compare_price) * 100)
      : 0;

  return (
    <div className={cn("group relative flex flex-col rounded-lg border bg-card transition-shadow hover:shadow-md", className)}>
      {/* Image */}
      <Link href={ROUTES.product(product.slug)} className="relative block overflow-hidden rounded-t-lg bg-muted">
        <div className="aspect-square">
          <Image
            src={primaryImage?.url ?? IMAGE_PLACEHOLDER}
            alt={primaryImage?.alt_text ?? product.name}
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
          />
        </div>

        {/* Discount badge */}
        {discount > 0 && (
          <Badge className="absolute left-2 top-2 bg-red-500 text-white hover:bg-red-600">
            -{discount}%
          </Badge>
        )}

        {/* Featured badge */}
        {product.is_featured && !discount && (
          <Badge variant="brand" className="absolute left-2 top-2">
            Featured
          </Badge>
        )}

        {/* Wishlist */}
        <button
          onClick={(e) => {
            e.preventDefault();
            toggleItem(product);
          }}
          className="absolute right-2 top-2 rounded-full bg-white/90 p-1.5 shadow transition-colors hover:bg-white"
          aria-label={isWishlisted ? "Remove from wishlist" : "Add to wishlist"}
        >
          <Heart
            className={cn("h-4 w-4", isWishlisted ? "fill-red-500 text-red-500" : "text-gray-600")}
          />
        </button>

        {/* Quick add – appears on hover */}
        {showQuickAdd && defaultVariant && (
          <div className="absolute inset-x-0 bottom-0 translate-y-full transition-transform duration-200 group-hover:translate-y-0">
            <Button
              className="w-full rounded-none rounded-b-none"
              size="sm"
              onClick={handleQuickAdd}
            >
              <ShoppingCart className="mr-1 h-4 w-4" />
              Add to Cart
            </Button>
          </div>
        )}
      </Link>

      {/* Info */}
      <div className="flex flex-1 flex-col p-3">
        <Link href={ROUTES.product(product.slug)} className="flex-1">
          <p className="line-clamp-2 text-sm font-medium hover:text-primary">{product.name}</p>
        </Link>

        {/* Rating */}
        {product.avg_rating && (
          <div className="mt-1 flex items-center gap-1">
            <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
            <span className="text-xs text-muted-foreground">
              {product.avg_rating} ({product.review_count ?? 0})
            </span>
          </div>
        )}

        <div className="mt-2">
          <PriceDisplay
            price={product.base_price}
            comparePrice={product.compare_price}
            size="sm"
          />
        </div>
      </div>
    </div>
  );
}
