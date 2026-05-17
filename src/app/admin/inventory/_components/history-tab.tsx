"use client";

import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LoadingState } from "@/components/feedback/loading-state";
import { useInventoryMovements } from "@/features/admin/hooks/use-admin-inventory";
import { ADJUSTMENT_REASON_LABELS } from "@/features/admin/services/admin-inventory.service";
import type { InventoryMovement } from "@/features/admin/services/admin-inventory.service";
import { cn } from "@/lib/utils";

// ── Helpers ───────────────────────────────────────────────────────────────────

type MovementType = InventoryMovement["type"] | "all";

const TYPE_CONFIG: Record<
  InventoryMovement["type"],
  { label: string; className: string }
> = {
  purchase: { label: "Purchase", className: "border-blue-200 bg-blue-50 text-blue-700" },
  sale: { label: "Sale", className: "border-purple-200 bg-purple-50 text-purple-700" },
  return: { label: "Return", className: "border-teal-200 bg-teal-50 text-teal-700" },
  adjustment: { label: "Adjustment", className: "border-orange-200 bg-orange-50 text-orange-700" },
  transfer: { label: "Transfer", className: "border-gray-200 bg-gray-50 text-gray-700" },
};

function TypeBadge({ type }: { type: InventoryMovement["type"] }) {
  const config = TYPE_CONFIG[type] ?? { label: type, className: "border-border" };
  return (
    <Badge variant="outline" className={cn("text-xs font-normal capitalize", config.className)}>
      {config.label}
    </Badge>
  );
}

function ChangeDisplay({
  quantity,
  previous,
  next,
  type,
}: {
  quantity: number;
  previous: number | null;
  next: number | null;
  type: InventoryMovement["type"];
}) {
  const isPositive = type === "purchase" || type === "return" || type === "transfer";
  const isNegative = type === "sale";
  const delta = next !== null && previous !== null ? next - previous : null;

  return (
    <div className="flex items-center gap-2 tabular-nums">
      <span
        className={cn(
          "text-sm font-medium",
          delta === null
            ? "text-foreground"
            : delta > 0
            ? "text-green-700"
            : delta < 0
            ? "text-red-700"
            : "text-muted-foreground",
        )}
      >
        {delta !== null ? (delta > 0 ? "+" : "") + delta : `${isPositive ? "+" : isNegative ? "-" : "±"}${quantity}`}
      </span>
      {previous !== null && next !== null && (
        <span className="text-xs text-muted-foreground">
          {previous} → {next}
        </span>
      )}
    </div>
  );
}

function formatDateTime(iso: string) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

// ── Component ─────────────────────────────────────────────────────────────────

const PAGE_SIZE = 25;

export function HistoryTab() {
  const [movementType, setMovementType] = useState<MovementType>("all");
  const [days, setDays] = useState<number>(30);
  const [page, setPage] = useState(1);

  const { data, isLoading, isError } = useInventoryMovements({
    movementType,
    days,
    page,
    pageSize: PAGE_SIZE,
  });

  const movements = data?.data ?? [];
  const totalCount = data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <div className="space-y-4">
      {/* Filters row */}
      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={movementType}
          onValueChange={(v) => { setMovementType(v as MovementType); setPage(1); }}
        >
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {(Object.keys(TYPE_CONFIG) as InventoryMovement["type"][]).map((t) => (
              <SelectItem key={t} value={t}>{TYPE_CONFIG[t].label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={String(days)}
          onValueChange={(v) => { setDays(Number(v)); setPage(1); }}
        >
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
            <SelectItem value="365">Last year</SelectItem>
          </SelectContent>
        </Select>

        {totalCount > 0 && (
          <p className="ml-auto text-sm text-muted-foreground">
            {totalCount.toLocaleString()} records
          </p>
        )}
      </div>

      {/* Table */}
      {isLoading ? (
        <LoadingState text="Loading movement history…" />
      ) : isError ? (
        <div className="rounded-lg border py-10 text-center text-sm text-red-600">
          Failed to load movement history. Please try again.
        </div>
      ) : movements.length === 0 ? (
        <div className="rounded-lg border py-12 text-center text-sm text-muted-foreground">
          No inventory movements found for the selected filters.
        </div>
      ) : (
        <div className="rounded-lg border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50">
              <tr>
                <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide whitespace-nowrap">
                  Time
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  SKU
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Product / Variant
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Type
                </th>
                <th className="px-3 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide whitespace-nowrap">
                  Change
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Reason
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Note
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Actor
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {movements.map((mov) => {
                const variantOptions = mov.variant?.options ?? {};
                const variantLabel = Object.values(variantOptions).join(" / ");
                return (
                  <tr key={mov.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                      {formatDateTime(mov.created_at)}
                    </td>
                    <td className="px-3 py-2.5">
                      {mov.variant?.sku ? (
                        <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">
                          {mov.variant.sku}
                        </code>
                      ) : (
                        <span className="text-muted-foreground/40 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <p className="text-sm font-medium">
                        {mov.variant?.product?.name ?? "—"}
                      </p>
                      {variantLabel && (
                        <p className="text-xs text-muted-foreground">{variantLabel}</p>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <TypeBadge type={mov.type} />
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <ChangeDisplay
                        quantity={mov.quantity}
                        previous={mov.previous_quantity}
                        next={mov.new_quantity}
                        type={mov.type}
                      />
                    </td>
                    <td className="px-3 py-2.5 text-sm text-muted-foreground">
                      {mov.adjustment_reason
                        ? ADJUSTMENT_REASON_LABELS[mov.adjustment_reason]
                        : <span className="text-muted-foreground/40">—</span>}
                    </td>
                    <td className="px-3 py-2.5 max-w-[200px]">
                      {mov.note ? (
                        <p className="text-xs text-muted-foreground truncate" title={mov.note}>
                          {mov.note}
                        </p>
                      ) : (
                        <span className="text-muted-foreground/40 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">
                      {mov.created_by ? (
                        <code className="font-mono text-[10px]">
                          {mov.created_by.slice(0, 8)}…
                        </code>
                      ) : (
                        <span className="text-muted-foreground/40">system</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
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
