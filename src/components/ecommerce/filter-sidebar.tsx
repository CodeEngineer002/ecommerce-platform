"use client";

import { SlidersHorizontal } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { SORT_OPTIONS } from "@/lib/constants";
import { useFormatPrice } from "@/hooks/use-format-price";
import type { Category, ProductFilters } from "@/types";

interface FilterSidebarProps {
  filters: ProductFilters;
  categories: Category[];
  onChange: (filters: ProductFilters) => void;
  onReset: () => void;
}

const PRICE_MIN = 0;
const PRICE_MAX = 50_000;

export function FilterSidebar({ filters, categories, onChange, onReset }: FilterSidebarProps) {
  // Local slider state — commit to parent only on pointer-up to avoid query-per-px
  const [priceRange, setPriceRange] = useState<[number, number]>([
    filters.minPrice ?? PRICE_MIN,
    filters.maxPrice ?? PRICE_MAX,
  ]);

  // Keep local state in sync when external reset fires
  useEffect(() => {
    setPriceRange([filters.minPrice ?? PRICE_MIN, filters.maxPrice ?? PRICE_MAX]);
  }, [filters.minPrice, filters.maxPrice]);

  const isPriceActive =
    priceRange[0] !== PRICE_MIN || priceRange[1] !== PRICE_MAX;

  const fmt = useFormatPrice();
  const formatPrice = (n: number) => fmt(n, { notation: "compact", maximumFractionDigits: 1 });

  function commitPrice(range: [number, number]) {
    onChange({
      ...filters,
      minPrice: range[0] > PRICE_MIN ? range[0] : undefined,
      maxPrice: range[1] < PRICE_MAX ? range[1] : undefined,
      page: 1,
    });
  }

  return (
    <aside className="w-full space-y-6 lg:w-64 lg:shrink-0">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 font-semibold">
          <SlidersHorizontal className="h-4 w-4" />
          Filters
        </div>
        <Button variant="ghost" size="sm" onClick={onReset} className="h-auto p-0 text-xs">
          Clear all
        </Button>
      </div>

      <Separator />

      {/* Sort */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Sort By</h3>
        <Select
          value={filters.sortBy ?? "newest"}
          onValueChange={(v) =>
            onChange({ ...filters, sortBy: v as ProductFilters["sortBy"], page: 1 })
          }
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Separator />

      {/* Categories */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Category</h3>
        <ul className="space-y-2">
          {categories.map((cat) => (
            <li key={cat.id} className="flex items-center gap-2">
              <Checkbox
                id={`cat-${cat.id}`}
                checked={filters.category === cat.slug}
                onCheckedChange={(checked) =>
                  onChange({ ...filters, category: checked ? cat.slug : undefined, page: 1 })
                }
              />
              <Label htmlFor={`cat-${cat.id}`} className="cursor-pointer font-normal">
                {cat.name}
              </Label>
            </li>
          ))}
        </ul>
      </div>

      <Separator />

      {/* Price range slider */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Price Range</h3>
          {isPriceActive && (
            <button
              type="button"
              onClick={() => {
                setPriceRange([PRICE_MIN, PRICE_MAX]);
                onChange({ ...filters, minPrice: undefined, maxPrice: undefined, page: 1 });
              }}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Reset
            </button>
          )}
        </div>

        <Slider
          min={PRICE_MIN}
          max={PRICE_MAX}
          step={100}
          value={priceRange}
          onValueChange={(v) => setPriceRange(v as [number, number])}
          onValueCommit={(v) => commitPrice(v as [number, number])}
          className="mt-2"
        />

        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{formatPrice(priceRange[0])}</span>
          <span>{formatPrice(priceRange[1])}</span>
        </div>
      </div>

      <Separator />

      {/* Featured */}
      <div className="flex items-center gap-2">
        <Checkbox
          id="featured"
          checked={!!filters.isFeatured}
          onCheckedChange={(checked) =>
            onChange({ ...filters, isFeatured: checked ? true : undefined, page: 1 })
          }
        />
        <Label htmlFor="featured" className="cursor-pointer font-normal">
          Featured only
        </Label>
      </div>
    </aside>
  );
}

