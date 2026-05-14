"use client";

import { Minus, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CART_MAX_QUANTITY } from "@/lib/constants";
import { cn } from "@/lib/utils";

interface QuantitySelectorProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  disabled?: boolean;
  className?: string;
}

export function QuantitySelector({
  value,
  onChange,
  min = 1,
  max = CART_MAX_QUANTITY,
  disabled,
  className,
}: QuantitySelectorProps) {
  return (
    <div className={cn("flex items-center rounded-md border", className)}>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 rounded-r-none"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={disabled || value <= min}
        aria-label="Decrease quantity"
      >
        <Minus className="h-3 w-3" />
      </Button>
      <span className="w-10 text-center text-sm font-medium tabular-nums">{value}</span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 rounded-l-none"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={disabled || value >= max}
        aria-label="Increase quantity"
      >
        <Plus className="h-3 w-3" />
      </Button>
    </div>
  );
}
