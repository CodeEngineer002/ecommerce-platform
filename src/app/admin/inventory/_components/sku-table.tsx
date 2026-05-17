"use client";

import { useState, useMemo } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useCountryInventory } from "./country-inventory-hooks";
import type { InventoryRowData } from "../shared-types";
import type { AdjustmentTarget } from "./adjustment-modal";

const PAGE_SIZE = 25;

// ── Stock status badge ────────────────────────────────────────────────────────

function StockStatusBadge({ available }: { available: number }) {
  if (available <= 0) {
    return (
      <Badge variant="destructive" className="text-xs font-normal">
        Out of Stock
      </Badge>
    );
  }
  if (available <= 5) {
    return (
      <Badge variant="outline" className="text-xs font-normal border-amber-300 text-amber-700 bg-amber-50">
        Low Stock
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-xs font-normal border-green-300 text-green-700 bg-green-50">
      In Stock
    </Badge>
  );
}

// ── Single row ────────────────────────────────────────────────────────────────

function SkuRow({
  row,
  selectedCountry,
  onAdjust,
}: {
  row: InventoryRowData;
  selectedCountry: string;
  onAdjust: (target: AdjustmentTarget) => void;
}) {
  const isCountryMode = selectedCountry !== "global";
  const { data: countryInv } = useCountryInventory(row.variantId, selectedCountry);

  const inv = isCountryMode ? (countryInv ?? null) : null;
  const quantity = inv ? inv.quantity : row.quantity;
  const reserved = inv ? (inv.reserved ?? 0) : row.reserved;
  const available = quantity - reserved;
  const isFallback = isCountryMode && !countryInv;

  return (
    <tr className="hover:bg-muted/30 transition-colors">
      <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">
        {row.productCode ?? <span className="text-muted-foreground/40">—</span>}
      </td>
      <td className="px-3 py-2.5 text-sm font-medium">{row.productName}</td>
      <td className="px-3 py-2.5">
        {row.sku ? (
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">{row.sku}</code>
        ) : (
          <span className="text-amber-600 text-xs">No SKU</span>
        )}
      </td>
      <td className="px-3 py-2.5 text-sm text-muted-foreground">
        {row.color ?? <span className="text-muted-foreground/40 text-xs">—</span>}
        {row.colorCode && (
          <span className="ml-1 font-mono text-[10px] text-muted-foreground/50">{row.colorCode}</span>
        )}
      </td>
      <td className="px-3 py-2.5 text-sm text-muted-foreground">
        {row.size ?? <span className="text-muted-foreground/40 text-xs">—</span>}
      </td>
      <td className="px-3 py-2.5 text-right text-sm tabular-nums">
        {quantity}
        {isFallback && <span className="ml-1 text-[10px] text-muted-foreground">global</span>}
      </td>
      <td className="px-3 py-2.5 text-right text-sm text-muted-foreground tabular-nums">{reserved}</td>
      <td className={cn(
        "px-3 py-2.5 text-right text-sm font-medium tabular-nums",
        available <= 0 ? "text-red-600" : available <= 5 ? "text-amber-600" : "text-green-600",
      )}>
        {available}
      </td>
      <td className="px-3 py-2.5">
        <StockStatusBadge available={available} />
      </td>
      <td className="px-3 py-2.5 text-right">
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          onClick={() =>
            onAdjust({
              variantId: row.variantId,
              sku: row.sku,
              productName: row.productName,
              variantLabel:
                [row.color, row.size].filter(Boolean).join(" / ") || row.variantName,
              currentQuantity: quantity,
              reserved,
            })
          }
        >
          Adjust
        </Button>
      </td>
    </tr>
  );
}

// ── SKU Table ─────────────────────────────────────────────────────────────────

interface Props {
  rows: InventoryRowData[];
  selectedCountry: string;
  onAdjust: (target: AdjustmentTarget) => void;
}

export function SkuTable({ rows, selectedCountry, onAdjust }: Props) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);

  const pageRows = useMemo(
    () => rows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [rows, safePage],
  );

  return (
    <div className="space-y-3">
      <div className="rounded-lg border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50">
            <tr>
              <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Code</th>
              <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Product</th>
              <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">SKU</th>
              <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Color</th>
              <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Size</th>
              <th className="px-3 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide">In Stock</th>
              <th className="px-3 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide">Reserved</th>
              <th className="px-3 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide">Available</th>
              <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Status</th>
              <th className="px-3 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {pageRows.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-4 py-10 text-center text-sm text-muted-foreground">
                  No variants match the current filters.
                </td>
              </tr>
            ) : (
              pageRows.map((row) => (
                <SkuRow
                  key={`${row.variantId}-${selectedCountry}`}
                  row={row}
                  selectedCountry={selectedCountry}
                  onAdjust={onAdjust}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, rows.length)} of {rows.length} variants
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={safePage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
