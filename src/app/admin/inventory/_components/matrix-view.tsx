"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, AlertTriangle, CheckCircle2, PackageX } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { buildProductGroups, type InventoryRowData, type CellData } from "../shared-types";
import type { AdjustmentTarget } from "./adjustment-modal";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  rows: InventoryRowData[];
  onAdjust: (target: AdjustmentTarget) => void;
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

// ── Cell ──────────────────────────────────────────────────────────────────────

function StockCell({
  cell,
  onAdjust,
}: {
  cell: CellData | undefined;
  onAdjust: (target: AdjustmentTarget) => void;
}) {
  if (!cell) {
    return (
      <td className="px-1 py-1">
        <div className="flex h-9 w-full min-w-[52px] items-center justify-center rounded border border-dashed text-xs text-muted-foreground/40">
          —
        </div>
      </td>
    );
  }

  const avail = cell.available;
  const isOOS = avail <= 0;
  const isLow = avail > 0 && avail <= 5;

  return (
    <td className="px-1 py-1">
      <button
        onClick={() =>
          onAdjust({
            variantId: cell.variantId,
            sku: cell.sku,
            productName: cell.productName,
            variantLabel: cell.variantLabel,
            currentQuantity: cell.quantity,
            reserved: cell.reserved,
          })
        }
        title={`${cell.variantLabel} — ${avail} available (${cell.quantity} in stock, ${cell.reserved} reserved)`}
        className={cn(
          "flex h-9 w-full min-w-[52px] cursor-pointer items-center justify-center rounded border text-sm font-semibold tabular-nums transition-all",
          "hover:ring-2 hover:ring-primary/40 hover:shadow-sm",
          isOOS
            ? "border-red-300 bg-red-50 text-red-700"
            : isLow
            ? "border-amber-300 bg-amber-50 text-amber-700"
            : "border-green-200 bg-green-50 text-green-800 hover:bg-green-100",
        )}
      >
        {avail}
      </button>
    </td>
  );
}

// ── Product Row ───────────────────────────────────────────────────────────────

function ProductMatrixSection({
  group,
  onAdjust,
}: {
  group: ReturnType<typeof buildProductGroups>[number];
  onAdjust: (target: AdjustmentTarget) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="rounded-lg border">
      {/* Product header */}
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-3 text-left">
          {collapsed ? (
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}
          <div>
            <span className="font-semibold text-sm">{group.productName}</span>
            {group.productCode && (
              <code className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs font-mono text-muted-foreground">
                {group.productCode}
              </code>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-muted-foreground tabular-nums">
            {group.totalUnits.toLocaleString()} units
          </span>
          {group.hasOOS && (
            <Badge variant="destructive" className="gap-1 text-xs py-0">
              <PackageX className="h-3 w-3" />
              OOS
            </Badge>
          )}
          {group.hasLowStock && !group.hasOOS && (
            <Badge variant="outline" className="gap-1 text-xs py-0 border-amber-300 text-amber-700 bg-amber-50">
              <AlertTriangle className="h-3 w-3" />
              Low
            </Badge>
          )}
          {!group.hasLowStock && !group.hasOOS && (
            <Badge variant="outline" className="gap-1 text-xs py-0 border-green-300 text-green-700 bg-green-50">
              <CheckCircle2 className="h-3 w-3" />
              OK
            </Badge>
          )}
        </div>
      </button>

      {/* Matrix table */}
      {!collapsed && (
        <div className="overflow-x-auto border-t px-4 py-3">
          <table className="w-full border-separate border-spacing-0">
            <thead>
              <tr>
                <th className="py-1 pr-3 text-left text-xs font-medium text-muted-foreground w-24">Color</th>
                {group.allSizes.map((size) => (
                  <th key={size} className="px-1 py-1 text-center text-xs font-medium text-muted-foreground min-w-[52px]">
                    {size}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {group.colors.map((colorGroup) => (
                <tr key={colorGroup.color}>
                  <td className="py-1 pr-3 text-sm font-medium text-muted-foreground align-middle whitespace-nowrap">
                    {colorGroup.color}
                  </td>
                  {group.allSizes.map((size) => (
                    <StockCell
                      key={size}
                      cell={colorGroup.cells.get(size)}
                      onAdjust={onAdjust}
                    />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-muted-foreground">
            Click any cell to adjust stock for that variant.
          </p>
        </div>
      )}
    </div>
  );
}

// ── Matrix View ───────────────────────────────────────────────────────────────

export function MatrixView({ rows, onAdjust, currentPage, totalPages, onPageChange }: Props) {
  const groups = useMemo(() => buildProductGroups(rows), [rows]);

  if (groups.length === 0) {
    return (
      <div className="rounded-lg border py-16 text-center text-sm text-muted-foreground">
        No products found.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-6 rounded border border-green-200 bg-green-50" />
          In Stock
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-6 rounded border border-amber-300 bg-amber-50" />
          Low (≤5)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-6 rounded border border-red-300 bg-red-50" />
          Out of Stock
        </span>
        <span className="flex items-center gap-1.5 text-muted-foreground/70">
          <span className="inline-block h-3 w-6 rounded border border-dashed" />
          No variant
        </span>
      </div>

      {/* Product groups */}
      <div className="space-y-3">
        {groups.map((group) => (
          <ProductMatrixSection key={group.productId} group={group} onAdjust={onAdjust} />
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-sm text-muted-foreground">
            Page {currentPage} of {totalPages}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage <= 1}
              onClick={() => onPageChange(currentPage - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage >= totalPages}
              onClick={() => onPageChange(currentPage + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
