"use client";

import { ImageOff } from "lucide-react";
import Image from "next/image";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";
import type { ProductImage } from "@/types";

interface ProductGalleryProps {
  images: ProductImage[];
  productName: string;
  /** When set, the gallery syncs its active image to match the selected variant. */
  selectedVariantId?: string | null;
  /**
   * Called when the user clicks a thumbnail whose image is variant-specific
   * (image.variant_id is set). Allows bidirectional sync: thumbnail click
   * also switches the active variant.
   */
  onVariantImageClick?: (variantId: string) => void;
}

export function ProductGallery({
  images,
  productName,
  selectedVariantId,
  onVariantImageClick,
}: ProductGalleryProps) {
  const [activeIndex, setActiveIndex] = useState(0);

  // Reset to first image when the image set changes (e.g., color switch sends new images array)
  const firstImageId = images[0]?.id;
  useEffect(() => {
    setActiveIndex(0);
  }, [firstImageId]);

  // For flat-variant products: sync to selected variant's image when changed externally
  useEffect(() => {
    if (!selectedVariantId) return;
    const idx = images.findIndex((img) => img.variant_id === selectedVariantId);
    if (idx !== -1) setActiveIndex(idx);
  }, [selectedVariantId, images]);

  const activeImage = images[activeIndex];

  if (!images.length) {
    return (
      <div className="aspect-square w-full rounded-lg bg-muted flex flex-col items-center justify-center gap-3">
        <ImageOff className="h-14 w-14 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">No preview available</p>
      </div>
    );
  }

  const handleThumbnailClick = (i: number) => {
    setActiveIndex(i);
    // Bidirectional: thumbnail click also switches the variant when the image
    // is tagged to a specific variant.
    const img = images[i];
    if (img.variant_id) onVariantImageClick?.(img.variant_id);
  };

  return (
    <div className="space-y-3">
      {/* Main image */}
      <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-muted">
        <Image
          src={activeImage.url}
          alt={activeImage.alt_text ?? productName}
          fill
          priority
          quality={90}
          className="object-cover"
          sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 600px"
        />
      </div>

      {/* Thumbnails */}
      {images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {images.map((img, i) => (
            <button
              key={img.id}
              onClick={() => handleThumbnailClick(i)}
              className={cn(
                "relative h-16 w-16 shrink-0 overflow-hidden rounded-md border-2 bg-muted transition-colors",
                i === activeIndex
                  ? "border-primary"
                  : "border-transparent hover:border-muted-foreground"
              )}
              aria-label={img.alt_text ?? `View image ${i + 1}`}
            >
              <Image
                src={img.url}
                alt={img.alt_text ?? `${productName} ${i + 1}`}
                fill
                className="object-cover"
                sizes="64px"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
