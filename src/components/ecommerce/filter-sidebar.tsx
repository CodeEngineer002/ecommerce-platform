"use client";

import { SlidersHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import type { Category, ProductFilters } from "@/types";

interface FilterSidebarProps {
  filters: ProductFilters;
  categories: Category[];
  onChange: (filters: ProductFilters) => void;
  onReset: () => void;
}

export function FilterSidebar({ filters, categories, onChange, onReset }: FilterSidebarProps) {
  const priceRanges = [
    { label: "Under ₹500", min: 0, max: 500 },
    { label: "₹500 – ₹2,000", min: 500, max: 2000 },
    { label: "₹2,000 – ₹10,000", min: 2000, max: 10000 },
    { label: "Over ₹10,000", min: 10000, max: undefined },
  ];

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

      {/* Price */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Price Range</h3>
        <ul className="space-y-2">
          {priceRanges.map((range) => (
            <li key={range.label} className="flex items-center gap-2">
              <Checkbox
                id={`price-${range.label}`}
                checked={filters.minPrice === range.min && filters.maxPrice === range.max}
                onCheckedChange={(checked) =>
                  onChange({
                    ...filters,
                    minPrice: checked ? range.min : undefined,
                    maxPrice: checked ? range.max : undefined,
                    page: 1,
                  })
                }
              />
              <Label htmlFor={`price-${range.label}`} className="cursor-pointer font-normal">
                {range.label}
              </Label>
            </li>
          ))}
        </ul>
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
