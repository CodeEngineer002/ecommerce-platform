"use client";

import { ExternalLink, PackageSearch } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ROUTES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { AdminVariant } from "../catalog-utils";

interface Props {
  productId: string;
  productCode?: string | null;
  variants: AdminVariant[];
}

function StockBadge({ available }: { available: number }) {
  if (available <= 0) {
    return <Badge variant="destructive" className="text-[10px] py-0 px-1.5 h-4">OOS</Badge>;
  }
  if (available <= 5) {
    return <Badge variant="warning" className="text-[10px] py-0 px-1.5 h-4">Low</Badge>;
  }
  return <Badge variant="success" className="text-[10px] py-0 px-1.5 h-4">OK</Badge>;
}

export function InventorySection({ productId: _productId, productCode, variants }: Props) {
  const inventoryUrl = ROUTES.admin.inventory + (productCode ? `?q=${productCode}` : "");

  const totalStock = variants.reduce((sum, v) => {
    const levels = v.inventory_levels ?? [];
    return sum + levels.reduce((s, l) => s + Math.max(0, l.quantity - l.reserved), 0);
  }, 0);
  const oosCount = variants.filter((v) => {
    const levels = v.inventory_levels ?? [];
    return levels.reduce((s, l) => s + Math.max(0, l.quantity - l.reserved), 0) === 0;
  }).length;
  const lowCount = variants.filter((v) => {
    const levels = v.inventory_levels ?? [];
    const avail = levels.reduce((s, l) => s + Math.max(0, l.quantity - l.reserved), 0);
    return avail > 0 && avail <= 5;
  }).length;

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Stock</p>
            <p className="text-2xl font-bold tabular-nums mt-1">{totalStock}</p>
            <p className="text-xs text-muted-foreground">units available</p>
          </CardContent>
        </Card>
        <Card className={oosCount > 0 ? "border-red-200 bg-red-50/50" : ""}>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Out of Stock</p>
            <p className={cn("text-2xl font-bold tabular-nums mt-1", oosCount > 0 && "text-red-700")}>
              {oosCount}
            </p>
            <p className="text-xs text-muted-foreground">variants</p>
          </CardContent>
        </Card>
        <Card className={lowCount > 0 ? "border-amber-200 bg-amber-50/50" : ""}>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Low Stock</p>
            <p className={cn("text-2xl font-bold tabular-nums mt-1", lowCount > 0 && "text-amber-700")}>
              {lowCount}
            </p>
            <p className="text-xs text-muted-foreground">variants (≤5)</p>
          </CardContent>
        </Card>
      </div>

      {/* Per-variant table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Stock by Variant</CardTitle>
            <CardDescription>Read-only overview. Use the Inventory module to adjust stock.</CardDescription>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href={inventoryUrl} target="_blank" className="gap-2">
              <PackageSearch className="h-4 w-4" />
              Open Inventory
              <ExternalLink className="h-3 w-3 text-muted-foreground" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50">
                <tr>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase">SKU</th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase">Variant</th>
                  <th className="px-3 py-2.5 text-right text-xs font-medium text-muted-foreground uppercase">In Stock</th>
                  <th className="px-3 py-2.5 text-right text-xs font-medium text-muted-foreground uppercase">Reserved</th>
                  <th className="px-3 py-2.5 text-right text-xs font-medium text-muted-foreground uppercase">Available</th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {variants.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">
                      No variants yet. Add variants in the Variants tab.
                    </td>
                  </tr>
                )}
                {variants.map((v) => {
                  const opts = (v.options ?? {}) as Record<string, string>;
                  const label = [opts.color, opts.size].filter(Boolean).join(" / ") || v.name;
                  const levels = v.inventory_levels ?? [];
                  const qty = levels.reduce((s, l) => s + l.quantity, 0);
                  const reserved = levels.reduce((s, l) => s + l.reserved, 0);
                  const available = qty - reserved;
                  return (
                    <tr key={v.id} className="hover:bg-muted/20">
                      <td className="px-3 py-2.5">
                        {v.sku ? (
                          <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">{v.sku}</code>
                        ) : (
                          <span className="text-amber-600 text-xs">No SKU</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-sm">{label}</td>
                      <td className="px-3 py-2.5 text-right text-sm tabular-nums">{qty}</td>
                      <td className="px-3 py-2.5 text-right text-sm text-muted-foreground tabular-nums">{reserved}</td>
                      <td className={cn(
                        "px-3 py-2.5 text-right text-sm font-medium tabular-nums",
                        available <= 0 ? "text-red-600" : available <= 5 ? "text-amber-600" : "text-green-600",
                      )}>
                        {available}
                      </td>
                      <td className="px-3 py-2.5">
                        <StockBadge available={available} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
