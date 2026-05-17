"use client";

import { AlertTriangle, Archive, CheckCircle2, Package, PackageX, Layers } from "lucide-react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { InventoryRowData } from "../shared-types";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  rows: InventoryRowData[];
  totalProducts: number;
}

interface MetricCard {
  label: string;
  value: number | string;
  sub?: string;
  icon: React.ElementType;
  variant: "neutral" | "success" | "warning" | "danger" | "info";
}

// ── Component ─────────────────────────────────────────────────────────────────

export function OverviewTab({ rows, totalProducts }: Props) {
  const totalSkus = rows.length;
  const totalUnits = rows.reduce((sum, r) => sum + r.quantity, 0);
  const totalReserved = rows.reduce((sum, r) => sum + r.reserved, 0);
  const oosSkus = rows.filter((r) => r.quantity - r.reserved <= 0).length;
  const lowStockSkus = rows.filter((r) => {
    const avail = r.quantity - r.reserved;
    return avail > 0 && avail <= 5;
  }).length;
  const inStockSkus = totalSkus - oosSkus - lowStockSkus;
  const missingSkuCount = rows.filter((r) => !r.sku).length;

  const cards: MetricCard[] = [
    {
      label: "Total Products",
      value: totalProducts,
      sub: "active catalog products",
      icon: Package,
      variant: "neutral",
    },
    {
      label: "Total SKUs",
      value: totalSkus,
      sub: missingSkuCount > 0 ? `${missingSkuCount} missing SKU` : "all SKUs assigned",
      icon: Layers,
      variant: missingSkuCount > 0 ? "warning" : "neutral",
    },
    {
      label: "In Stock",
      value: inStockSkus,
      sub: `${Math.round((inStockSkus / Math.max(totalSkus, 1)) * 100)}% of SKUs`,
      icon: CheckCircle2,
      variant: "success",
    },
    {
      label: "Low Stock",
      value: lowStockSkus,
      sub: "≤5 units available",
      icon: AlertTriangle,
      variant: lowStockSkus > 0 ? "warning" : "neutral",
    },
    {
      label: "Out of Stock",
      value: oosSkus,
      sub: oosSkus > 0 ? "needs restocking" : "none",
      icon: PackageX,
      variant: oosSkus > 0 ? "danger" : "neutral",
    },
    {
      label: "Total Units",
      value: totalUnits.toLocaleString(),
      sub: `${totalReserved.toLocaleString()} reserved`,
      icon: Archive,
      variant: "info",
    },
  ];

  const variantColors: Record<MetricCard["variant"], string> = {
    neutral: "border-border",
    success: "border-green-200 bg-green-50/50",
    warning: "border-amber-200 bg-amber-50/50",
    danger: "border-red-200 bg-red-50/50",
    info: "border-blue-200 bg-blue-50/50",
  };

  const iconColors: Record<MetricCard["variant"], string> = {
    neutral: "text-muted-foreground",
    success: "text-green-600",
    warning: "text-amber-600",
    danger: "text-red-600",
    info: "text-blue-600",
  };

  const valueColors: Record<MetricCard["variant"], string> = {
    neutral: "text-foreground",
    success: "text-green-700",
    warning: "text-amber-700",
    danger: "text-red-700",
    info: "text-blue-700",
  };

  return (
    <div className="space-y-6">
      {/* Metric cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Card
              key={card.label}
              className={cn(
                "flex flex-col gap-3 p-4 transition-shadow hover:shadow-sm",
                variantColors[card.variant],
              )}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {card.label}
                </span>
                <Icon className={cn("h-4 w-4", iconColors[card.variant])} />
              </div>
              <div>
                <p className={cn("text-2xl font-bold tabular-nums", valueColors[card.variant])}>
                  {card.value}
                </p>
                {card.sub && (
                  <p className="mt-0.5 text-xs text-muted-foreground">{card.sub}</p>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {/* Health summary */}
      {(oosSkus > 0 || lowStockSkus > 0 || missingSkuCount > 0) && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium">Attention Required</h3>
          <div className="flex flex-wrap gap-2">
            {oosSkus > 0 && (
              <div className="flex items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-sm text-red-800">
                <PackageX className="h-3.5 w-3.5" />
                <span>{oosSkus} SKU{oosSkus > 1 ? "s" : ""} out of stock</span>
              </div>
            )}
            {lowStockSkus > 0 && (
              <div className="flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm text-amber-800">
                <AlertTriangle className="h-3.5 w-3.5" />
                <span>{lowStockSkus} SKU{lowStockSkus > 1 ? "s" : ""} low stock (≤5)</span>
              </div>
            )}
            {missingSkuCount > 0 && (
              <div className="flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm text-amber-800">
                <AlertTriangle className="h-3.5 w-3.5" />
                <span>{missingSkuCount} variant{missingSkuCount > 1 ? "s" : ""} missing SKU</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Stock distribution bar */}
      {totalSkus > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium">Stock Health Distribution</h3>
          <div className="flex h-3 overflow-hidden rounded-full border">
            {inStockSkus > 0 && (
              <div
                className="bg-green-500"
                style={{ width: `${(inStockSkus / totalSkus) * 100}%` }}
                title={`In stock: ${inStockSkus}`}
              />
            )}
            {lowStockSkus > 0 && (
              <div
                className="bg-amber-400"
                style={{ width: `${(lowStockSkus / totalSkus) * 100}%` }}
                title={`Low stock: ${lowStockSkus}`}
              />
            )}
            {oosSkus > 0 && (
              <div
                className="bg-red-500"
                style={{ width: `${(oosSkus / totalSkus) * 100}%` }}
                title={`Out of stock: ${oosSkus}`}
              />
            )}
          </div>
          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
              In Stock ({inStockSkus})
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full bg-amber-400" />
              Low Stock ({lowStockSkus})
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full bg-red-500" />
              Out of Stock ({oosSkus})
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
