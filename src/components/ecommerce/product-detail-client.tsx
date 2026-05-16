"use client";

import { useState, type ReactNode } from "react";

import { AddToCartSection } from "@/app/(storefront)/products/[slug]/add-to-cart-section";
import { ProductGallery } from "@/components/ecommerce/product-gallery";
import type { ProductWithDetails } from "@/types";

interface Props {
  product: ProductWithDetails;
  /**
   * Static metadata rendered above AddToCartSection in the right column.
   * Passed from the server page so those elements remain server-rendered.
   */
  children: ReactNode;
}

/**
 * Client wrapper that owns `selectedVariantId` and keeps
 * ProductGallery and AddToCartSection in sync.
 *
 * State flow:
 *   selectedVariantId (here)
 *     ↓ prop                          ↓ prop + callback
 *   ProductGallery              AddToCartSection
 *   – shows ALL product images   – controlled variant selection
 *   – activeIndex synced via      – fires setSelectedVariantId
 *     useEffect on variant change    on button click
 *   – thumbnail click fires
 *     setSelectedVariantId if
 *     image is variant-tagged
 *     (bidirectional sync)
 */
export function ProductDetailClient({ product, children }: Props) {
  const activeVariants = product.variants.filter((v) => v.is_active);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(
    activeVariants[0]?.id ?? null
  );

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      {/* Left column — ALL product images passed so thumbnails always show */}
      <ProductGallery
        images={product.images}
        productName={product.name}
        selectedVariantId={selectedVariantId}
        onVariantImageClick={setSelectedVariantId}
      />

      {/* Right column — server-rendered metadata + interactive controls */}
      <div className="space-y-6">
        {children}

        <AddToCartSection
          product={product}
          selectedVariantId={selectedVariantId}
          onVariantChange={setSelectedVariantId}
        />
      </div>
    </div>
  );
}
