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

  // Reverse map: variantId → color string
  const variantIdToColor = useMemo(() => {
    const map = new Map<string, string>();
    for (const v of activeVariants) {
      const opts = v.options as { color?: string } | null;
      if (opts?.color) map.set(v.id, opts.color);
    }
    return map;
  }, [activeVariants]);

  // Group product images by color (via assigned variant_id → color lookup)
  const imagesByColor = useMemo(() => {
    const map = new Map<string, typeof product.images>();
    for (const img of product.images) {
      const vid = (img as typeof img & { variant_id?: string | null }).variant_id;
      if (!vid) continue;
      const color = variantIdToColor.get(vid);
      if (!color) continue;
      if (!map.has(color)) map.set(color, []);
      map.get(color)!.push(img);
    }
    return map;
  }, [product.images, variantIdToColor]);

  // Images shown in gallery — strictly filtered to selected color.
  // Returns empty array when no color-specific images exist so the gallery
  // shows a "No preview available" placeholder instead of unrelated images.
  const displayImages = useMemo(() => {
    if (!hasColorSize || !selectedColor) return product.images;
    const colorImgs = imagesByColor.get(selectedColor);
    if (colorImgs && colorImgs.length > 0) return colorImgs;
    return [];
  }, [hasColorSize, selectedColor, imagesByColor, product.images]);

  // Thumbnail click: in flat mode only — color+size mode handles it via color swatch
  const handleVariantImageClick = (variantId: string) => {
    if (!hasColorSize) setFlatVariantId(variantId);
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
      {/* Left column — color-filtered images; gallery resets via firstImageId effect */}
      <ProductGallery
        images={displayImages}
        productName={product.name}
        selectedVariantId={hasColorSize ? undefined : selectedVariantId}
        onVariantImageClick={hasColorSize ? undefined : handleVariantImageClick}
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
