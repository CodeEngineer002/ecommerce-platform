"use client";

import { Search, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ProductFilters } from "../catalog-utils";

interface Props {
  filters: ProductFilters;
  onChange: (filters: ProductFilters) => void;
  categories: Array<{ id: string; name: string }>;
  totalCount: number;
  filteredCount: number;
}

export function ProductFilterBar({ filters, onChange, categories, totalCount, filteredCount }: Props) {
  const [searchInput, setSearchInput] = useState(filters.search);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== filters.search) {
        onChange({ ...filters, search: searchInput });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const hasFilters =
    filters.search ||
    filters.category !== "all" ||
    filters.status !== "all" ||
    filters.stock !== "all" ||
    filters.featured !== "all";

  const clearAll = useCallback(() => {
    setSearchInput("");
    onChange({ search: "", category: "all", status: "all", stock: "all", featured: "all" });
  }, [onChange]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {/* Search */}
        <Input
          placeholder="Search by name, product code, SKU…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          leftIcon={<Search className="h-4 w-4" />}
          className="h-9 w-72"
        />

        {/* Category */}
        <Select
          value={filters.category}
          onValueChange={(v) => onChange({ ...filters, category: v })}
        >
          <SelectTrigger className="h-9 w-44">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Status */}
        <Select
          value={filters.status}
          onValueChange={(v) => onChange({ ...filters, status: v as ProductFilters["status"] })}
        >
          <SelectTrigger className="h-9 w-36">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>

        {/* Stock */}
        <Select
          value={filters.stock}
          onValueChange={(v) => onChange({ ...filters, stock: v as ProductFilters["stock"] })}
        >
          <SelectTrigger className="h-9 w-36">
            <SelectValue placeholder="Stock" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Stock</SelectItem>
            <SelectItem value="low">Low Stock (≤5)</SelectItem>
            <SelectItem value="oos">Out of Stock</SelectItem>
          </SelectContent>
        </Select>

        {/* Featured */}
        <Select
          value={filters.featured}
          onValueChange={(v) => onChange({ ...filters, featured: v as ProductFilters["featured"] })}
        >
          <SelectTrigger className="h-9 w-36">
            <SelectValue placeholder="Featured" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Products</SelectItem>
            <SelectItem value="featured">Featured Only</SelectItem>
          </SelectContent>
        </Select>

        {/* Clear */}
        {hasFilters && (
          <Button variant="ghost" size="sm" className="h-9 gap-1.5 text-muted-foreground" onClick={clearAll}>
            <X className="h-3.5 w-3.5" />
            Clear
          </Button>
        )}
      </div>

      {/* Result count */}
      {hasFilters && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          Showing <Badge variant="secondary">{filteredCount}</Badge> of {totalCount} products
        </div>
      )}
    </div>
  );
}
