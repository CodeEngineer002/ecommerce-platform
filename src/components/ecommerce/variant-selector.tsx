"use client";

import { cn } from "@/lib/utils";
import type { Inventory, ProductVariant } from "@/types";

const SIZE_ORDER = ["XS", "S", "M", "L", "XL", "XXL"];

const COLOR_SWATCHES: Record<string, string> = {
  Black: "#1a1a1a",
  Beige: "#d4c5a9",
  Olive: "#6b7c4d",
  Navy: "#1e3a5f",
  Charcoal: "#4a4a4a",
};

type VariantWithInventory = ProductVariant & { inventory: Inventory | null };

interface Props {
  variants: VariantWithInventory[];
  selectedColor: string | null;
  selectedSize: string | null;
  onColorChange: (color: string) => void;
  onSizeChange: (size: string) => void;
}

function availableStock(v: VariantWithInventory) {
  return (v.inventory?.quantity ?? 0) - (v.inventory?.reserved ?? 0);
}

export function VariantSelector({
  variants,
  selectedColor,
  selectedSize,
  onColorChange,
  onSizeChange,
}: Props) {
  const options = variants.map((v) => {
    const opts = v.options as { color?: string; size?: string } | null;
    return { variant: v, color: opts?.color ?? "", size: opts?.size ?? "" };
  });

  const colors = [...new Set(options.map((o) => o.color).filter(Boolean))];

  const sizesForColor = SIZE_ORDER.filter((s) =>
    options.some((o) => o.color === selectedColor && o.size === s)
  );

  const selectedColorVariant = options.find(
    (o) => o.color === selectedColor && o.size === selectedSize
  )?.variant;
  const stock = selectedColorVariant ? availableStock(selectedColorVariant) : null;
  const lowStock = stock !== null && stock > 0 && stock <= 3;

  return (
    <div className="space-y-4">
      {/* Color selector */}
      <div className="space-y-2">
        <p className="text-sm font-medium">
          Color{selectedColor ? <span className="ml-1 font-normal text-muted-foreground">— {selectedColor}</span> : null}
        </p>
        <div className="flex flex-wrap gap-2">
          {colors.map((color) => {
            const swatch = COLOR_SWATCHES[color];
            return (
              <button
                key={color}
                onClick={() => onColorChange(color)}
                title={color}
                className={cn(
                  "h-8 w-8 rounded-full border-2 transition-all",
                  color === selectedColor
                    ? "border-primary ring-2 ring-primary ring-offset-2"
                    : "border-transparent hover:border-muted-foreground"
                )}
                style={{ backgroundColor: swatch ?? "#cccccc" }}
                aria-label={color}
                aria-pressed={color === selectedColor}
              />
            );
          })}
        </div>
      </div>

      {/* Size selector */}
      {selectedColor && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Size</p>
          <div className="flex flex-wrap gap-2">
            {sizesForColor.map((size) => {
              const o = options.find((x) => x.color === selectedColor && x.size === size);
              const inStock = o ? availableStock(o.variant) > 0 : false;

              return (
                <button
                  key={size}
                  onClick={() => inStock && onSizeChange(size)}
                  disabled={!inStock}
                  className={cn(
                    "min-w-[44px] rounded-md border px-3 py-1.5 text-sm font-medium transition-colors",
                    size === selectedSize
                      ? "border-primary bg-primary/10 text-primary"
                      : inStock
                      ? "hover:border-primary/50"
                      : "cursor-not-allowed border-dashed opacity-40 line-through"
                  )}
                  aria-label={`Size ${size}${inStock ? "" : ", out of stock"}`}
                  aria-pressed={size === selectedSize}
                >
                  {size}
                </button>
              );
            })}
          </div>

          {/* Stock warnings */}
          {!selectedSize && (
            <p className="text-xs text-muted-foreground">Please select a size</p>
          )}
          {lowStock && stock !== null && (
            <p className="text-xs text-amber-600">Only {stock} left in stock</p>
          )}
        </div>
      )}
    </div>
  );
}
