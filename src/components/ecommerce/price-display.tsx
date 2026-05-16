"use client";

import { cn, calculateDiscount } from "@/lib/utils";
import { useFormatPrice } from "@/hooks/use-format-price";

interface PriceDisplayProps {
  price: number;
  comparePrice?: number | null;
  className?: string;
  size?: "sm" | "md" | "lg";
}

const sizeClasses = {
  sm: { price: "text-sm font-semibold", compare: "text-xs", badge: "text-xs px-1.5 py-0.5" },
  md: { price: "text-lg font-bold", compare: "text-sm", badge: "text-xs px-2 py-0.5" },
  lg: { price: "text-2xl font-bold", compare: "text-base", badge: "text-sm px-2.5 py-1" },
};

export function PriceDisplay({ price, comparePrice, className, size = "md" }: PriceDisplayProps) {
  const fmt = useFormatPrice();
  const discount = comparePrice ? calculateDiscount(price, comparePrice) : 0;
  const classes = sizeClasses[size];

  return (
    <div className={cn("flex items-center gap-2 flex-wrap", className)}>
      <span className={cn("text-foreground", classes.price)}>{fmt(price)}</span>
      {comparePrice && comparePrice > price && (
        <>
          <span className={cn("text-muted-foreground line-through", classes.compare)}>
            {fmt(comparePrice)}
          </span>
          {discount > 0 && (
            <span
              className={cn(
                "rounded bg-green-100 font-medium text-green-700",
                classes.badge
              )}
            >
              {discount}% off
            </span>
          )}
        </>
      )}
    </div>
  );
}

