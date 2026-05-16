"use client";

import { useMemo, useState, type ReactNode } from "react";

import { AddToCartSection } from "@/app/(storefront)/products/[slug]/add-to-cart-section";
import { ProductGallery } from "@/components/ecommerce/product-gallery";
import { VariantSelector } from "@/components/ecommerce/variant-selector";
import type { ProductWithDetails } from "@/types";

interface Props {
  product: ProductWithDetails;
  /**
   * Static metadata rendered above the variant selector in the right column.
   * Passed from the server page so those elements remain server-rendered.
   */
  children: ReactNode;
}

/**
 * Client wrapper that owns variant selection state and keeps
 * ProductGallery, VariantSelector, and AddToCartSection in sync.
 *
 * Color+size model (e.g. hoodies):
 *   selectedColor + selectedSize → derived selectedVariantId
 *   Gallery syncs to the canonical image for the selected color.
 *   Thumbnail click → color change (bidirectional).
 *
 * Flat model (single-option variants):
 *   selectedVariantId managed directly, gallery syncs as before.
 */
export function ProductDetailClient({ product, children }: Props) {
  const activeVariants = product.variants.filter((v) => v.is_active);

  // Detect whether variants use a color+size model
  const hasColorSize = activeVariants.some((v) => {
    const opts = v.options as { color?: string; size?: string } | null;
    return Boolean(opts?.color && opts?.size);
  });

  // --- Color+size state ---
  const colors = useMemo(() => {
    if (!hasColorSize) return [];
    const seen = new Set<string>();
    const result: string[] = [];
    for (const v of activeVariants) {
      const opts = v.options as { color?: string } | null;
      if (opts?.color && !seen.has(opts.color)) {
        seen.add(opts.color);
        result.push(opts.color);
      }
    }
    return result;
  }, [hasColorSize, activeVariants]);

  const [selectedColor, setSelectedColor] = useState<string | null>(colors[0] ?? null);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);

  // --- Flat variant state (fallback for non-color+size products) ---
  const [flatVariantId, setFlatVariantId] = useState<string | null>(
    activeVariants[0]?.id ?? null
  );

  // Derived: the SKU variant that goes into the cart
  const selectedVariant = hasColorSize
    ? activeVariants.find((v) => {
        const opts = v.options as { color?: string; size?: string } | null;
        return opts?.color === selectedColor && opts?.size === selectedSize;
      }) ?? null
    : activeVariants.find((v) => v.id === flatVariantId) ?? null;

  const selectedVariantId = selectedVariant?.id ?? null;

  // Map: color → the variant_id that has a linked product_image (canonical per color)
  const colorToGalleryVariantId = useMemo(() => {
    const map: Record<string, string> = {};
    for (const img of product.images) {
      if (!img.variant_id) continue;
      const v = activeVariants.find((vv) => vv.id === img.variant_id);
      const opts = v?.options as { color?: string } | null;
      if (opts?.color && !map[opts.color]) {
        map[opts.color] = img.variant_id;
      }
    }
    return map;
  }, [product.images, activeVariants]);

  // Variant ID forwarded to gallery for image sync
  const galleryVariantId = hasColorSize
    ? (selectedColor ? colorToGalleryVariantId[selectedColor] ?? null : null)
    : selectedVariantId;

  // Thumbnail click: in color+size mode, resolve to a color change
  const handleVariantImageClick = (variantId: string) => {
    if (hasColorSize) {
      const v = activeVariants.find((vv) => vv.id === variantId);
      const opts = v?.options as { color?: string } | null;
      if (opts?.color) handleColorChange(opts.color);
    } else {
      setFlatVariantId(variantId);
    }
  };

  const handleColorChange = (color: string) => {
    setSelectedColor(color);
    // Keep selected size — the size buttons handle OOS display per color
  };

  const handleSizeChange = (size: string) => {
    setSelectedSize(size);
  };

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      {/* Left column — ALL product images so thumbnails always show */}
      <ProductGallery
        images={product.images}
        productName={product.name}
        selectedVariantId={galleryVariantId}
        onVariantImageClick={handleVariantImageClick}
      />

      {/* Right column — server-rendered metadata + interactive controls */}
      <div className="space-y-6">
        {children}

        {hasColorSize ? (
          <VariantSelector
            variants={activeVariants}
            selectedColor={selectedColor}
            selectedSize={selectedSize}
            onColorChange={handleColorChange}
            onSizeChange={handleSizeChange}
          />
        ) : null}

        <AddToCartSection
          product={product}
          selectedVariantId={selectedVariantId}
          showVariantSelector={!hasColorSize}
          onVariantChange={setFlatVariantId}
        />
      </div>
    </div>
  );
}
