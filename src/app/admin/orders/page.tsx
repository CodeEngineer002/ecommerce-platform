"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowDownAZ,
  ArrowUpAZ,
  Banknote,
  Download,
  Loader2,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";

import { DataTable, type ColumnDef } from "@/components/common/data-table";
import { PageHeader } from "@/components/common/page-header";
import { StatusBadge } from "@/components/common/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  useAdminOrders,
  useAdminUpdateOrderStatus,
} from "@/features/admin/hooks/use-admin-orders";
import { ORDER_STATUSES } from "@/lib/constants";
import { formatDate, formatPrice } from "@/lib/utils";
import type { AdminOrderFilters } from "@/features/admin/services/admin-order.service";
import type { OrderStatus, OrderWithItems } from "@/types";

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

/** Order statuses for the filter dropdown (excludes return/replacement sub-statuses). */
const ORDER_STATUS_KEYS = [
  "draft", "pending", "pending_payment", "confirmed", "processing",
  "packed", "shipped", "out_for_delivery", "delivered",
  "cancelled", "failed",
  "return_requested", "return_approved", "return_rejected", "return_in_transit", "returned",
  "replacement_requested", "replacement_approved", "replacement_rejected",
  "replacement_shipped", "replacement_delivered",
  "refund_requested", "refund_processing",
  "partially_returned", "partially_refunded", "refunded",
] as const;

const SORT_OPTIONS = [
  { value: "created_at",   label: "Order Date" },
  { value: "total",        label: "Order Total" },
  { value: "order_number", label: "Order #" },
] as const;

/**
 * Valid next statuses for each current status.
 * Must stay in sync with ORDER_TRANSITIONS in domain/order/order-state-machine.ts
 */
const ALLOWED_TRANSITIONS: Record<string, OrderStatus[]> = {
  draft:                   ["pending", "pending_payment", "cancelled"],
  pending:                 ["confirmed", "pending_payment", "cancelled"],
  pending_payment:         ["confirmed", "cancelled", "failed"],
  confirmed:               ["processing", "cancelled"],
  processing:              ["packed", "shipped", "cancelled"],
  packed:                  ["shipped", "cancelled"],
  shipped:                 ["out_for_delivery", "delivered", "cancelled"],
  out_for_delivery:        ["delivered"],
  delivered:               ["return_requested", "replacement_requested", "refund_requested",
                            "partially_returned", "partially_refunded", "refunded"],
  return_requested:        ["return_approved", "return_rejected"],
  return_approved:         ["return_in_transit"],
  return_in_transit:       ["returned"],
  returned:                ["refunded", "replacement_shipped"],
  replacement_requested:   ["replacement_approved", "replacement_rejected"],
  replacement_approved:    [],
  replacement_shipped:     ["replacement_delivered"],
  refund_requested:        ["refund_processing"],
  refund_processing:       ["refunded", "partially_refunded"],
  partially_returned:      ["return_requested", "replacement_requested", "refund_requested",
                            "refunded", "partially_refunded"],
  partially_refunded:      ["refunded"],
  cancelled:               ["refunded"],
  failed:                  ["pending_payment"],
  return_rejected:         [],
  replacement_rejected:    [],
  replacement_delivered:   [],
  refunded:                [],
};

// ─── Column definitions ───────────────────────────────────────────────────────

function buildColumns(
  onStatusChange: (orderId: string, status: OrderStatus) => void,
  updatingOrderId: string | null,
): ColumnDef<OrderWithItems>[] {
  return [
    {
      header: "Order",
      cell: (o) => {
        const orderType = (o as OrderWithItems & { order_type?: string }).order_type ?? "purchase";
        return (
          <Link href={`/admin/orders/${o.id}`} className="hover:underline">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-mono font-medium text-primary">{o.order_number}</p>
              {orderType === "replacement" && (
                <span className="inline-flex items-center rounded-full bg-purple-100 px-1.5 py-0.5 text-xs font-semibold text-purple-700 dark:bg-purple-950 dark:text-purple-300">
                  Replacement
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {o.items.length} item{o.items.length !== 1 ? "s" : ""}
            </p>
          </Link>
        );
      },
    },
    {
      header: "Customer",
      cell: (o) => {
        const addr = o.shipping_address as Record<string, string> | null;
        const name = addr?.full_name ?? addr?.name ?? "—";
        const phone = addr?.phone ?? null;
        return (
          <div>
            <p className="text-sm font-medium">{name}</p>
            {phone && <p className="text-xs text-muted-foreground">{phone}</p>}
          </div>
        );
      },
    },
    {
      header: "Date",
      cell: (o) => <span className="text-muted-foreground whitespace-nowrap">{formatDate(o.created_at)}</span>,
    },
    {
      header: "Total",
      align: "right",
      cell: (o) => <span className="font-medium whitespace-nowrap">{formatPrice(o.total)}</span>,
    },
    {
      header: "Status",
      align: "center",
      cell: (o) => {
        const isUpdating = updatingOrderId === o.id;
        return (
          <div className="flex items-center justify-center gap-2">
            <StatusBadge status={o.status} />
            {isUpdating && (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
            )}
          </div>
        );
      },
    },
    {
      header: "Update Status",
      align: "center",
      cell: (o) => {
        const nextStatuses = ALLOWED_TRANSITIONS[o.status] ?? [];
        const isUpdating = updatingOrderId === o.id;

        if (nextStatuses.length === 0) {
          return <span className="text-xs text-muted-foreground">—</span>;
        }

        if (isUpdating) {
          return (
            <div className="flex h-8 w-40 items-center justify-center gap-2 rounded-md border bg-muted/50 px-3 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Updating…
            </div>
          );
        }

        return (
          <Select
            onValueChange={(v) => onStatusChange(o.id, v as OrderStatus)}
            disabled={isUpdating}
          >
            <SelectTrigger className="h-8 w-40">
              <SelectValue placeholder="Move to…" />
            </SelectTrigger>
            <SelectContent>
              {nextStatuses.map((value) => (
                <SelectItem key={value} value={value}>
                  {ORDER_STATUSES[value]?.label ?? value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      },
    },
    {
      header: "Actions",
      align: "center",
      cell: (o) => (
        <Button variant="outline" size="sm" asChild>
          <Link href={`/admin/orders/${o.id}`}>Details</Link>
        </Button>
      ),
    },
  ];
}

// ─── Filter chip button ───────────────────────────────────────────────────────

function ChipButton({
  active, onClick, children, icon,
}: {
  active:   boolean;
  onClick:  () => void;
  children: React.ReactNode;
  icon?:    React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-background text-muted-foreground hover:text-foreground hover:bg-muted",
      ].join(" ")}
    >
      {icon}
      {children}
    </button>
  );
}

// ─── CSV export ───────────────────────────────────────────────────────────────

function csvEscape(value: unknown): string {
  if (value == null) return "";
  const s = String(value);
  if (/[",\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function exportOrdersToCsv(orders: OrderWithItems[]) {
  if (orders.length === 0) return;

  const headers = [
    "order_number", "created_at", "status",
    "customer_name", "phone", "shipping_address",
    "payment_provider", "payment_status",
    "total", "currency", "items_count",
  ];

  const rows = orders.map((o) => {
    const addr = (o.shipping_address ?? {}) as Record<string, string>;
    const payment = (o as OrderWithItems & {
      payment?: { provider?: string; status?: string };
    }).payment ?? null;
    const fullAddress = [addr.line1, addr.line2, addr.city, addr.state, addr.postal_code]
      .filter(Boolean).join(", ");

    return [
      o.order_number,
      o.created_at,
      o.status,
      addr.full_name ?? addr.name ?? "",
      addr.phone ?? "",
      fullAddress,
      payment?.provider ?? "",
      payment?.status ?? "",
      o.total,
      (o as OrderWithItems & { currency?: string }).currency ?? "INR",
      o.items.length,
    ];
  });

  const csv = [headers.join(","), ...rows.map((r) => r.map(csvEscape).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  const date = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `orders-manifest-${date}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function useUrlFilters() {
  const router    = useRouter();
  const pathname  = usePathname();
  const params    = useSearchParams();

  const search   = params.get("q")       ?? "";
  const status   = params.get("status")  ?? "";
  const payment  = (params.get("payment")  ?? "") as "" | "cod" | "stripe" | "razorpay";
  const payState = (params.get("paystat") ?? "") as "" | NonNullable<AdminOrderFilters["paymentStatus"]>;
  const sortBy   = (params.get("sort")  ?? "created_at") as AdminOrderFilters["sortBy"];
  const sortDir  = (params.get("dir")   ?? "desc")        as AdminOrderFilters["sortDir"];
  const page     = Math.max(1, parseInt(params.get("page") ?? "1", 10));

  const push = useCallback(
    (patch: Record<string, string>) => {
      const next = new URLSearchParams(params.toString());
      Object.entries(patch).forEach(([k, v]) => {
        if (v) next.set(k, v);
        else next.delete(k);
      });
      // Reset to page 1 whenever filters change (but not when page changes explicitly)
      if (!("page" in patch)) next.set("page", "1");
      router.push(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [params, pathname, router],
  );

  const activeFilterCount = [search, status, payment, payState].filter(Boolean).length;

  const clearAll = useCallback(() => {
    router.push(pathname, { scroll: false });
  }, [router, pathname]);

  return { search, status, payment, payState, sortBy, sortDir, page, push, activeFilterCount, clearAll };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminOrdersPage() {
  const { search, status, payment, payState, sortBy, sortDir, page, push, activeFilterCount, clearAll } =
    useUrlFilters();

  // Local input state for the search box so typing feels instant.
  // We debounce before pushing to URL (and therefore re-fetching).
  const [searchInput, setSearchInput] = useState(search);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep local input in sync when the URL param changes externally (e.g. "clear all")
  useEffect(() => {
    setSearchInput(search);
  }, [search]);

  function handleSearchChange(value: string) {
    setSearchInput(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => push({ q: value }), 400);
  }

  const filters: AdminOrderFilters = {
    search:          search   || undefined,
    status:          status   || undefined,
    paymentProvider: payment  || undefined,
    paymentStatus:   payState || undefined,
    sortBy:          sortBy   || "created_at",
    sortDir:         sortDir  || "desc",
  };

  const { data, isLoading } = useAdminOrders(page, filters);
  const { mutate: updateStatus, isPending, variables } = useAdminUpdateOrderStatus();

  const orders     = data?.data  ?? [];
  const total      = data?.count ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const updatingOrderId = isPending ? (variables?.orderId ?? null) : null;

  const columns = buildColumns(
    (orderId, newStatus) => updateStatus({ orderId, status: newStatus }),
    updatingOrderId,
  );

  function toggleSortDir() {
    push({ sort: sortBy ?? "created_at", dir: sortDir === "asc" ? "desc" : "asc" });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Orders"
        description={`${total} order${total !== 1 ? "s" : ""}${activeFilterCount > 0 ? " (filtered)" : ""}`}
      />

      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative min-w-[220px] flex-1 max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by order #…"
            value={searchInput}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-8 h-9"
          />
          {searchInput && (
            <button
              onClick={() => handleSearchChange("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Status filter */}
        <Select value={status || "all"} onValueChange={(v) => push({ status: v === "all" ? "" : v })}>
          <SelectTrigger className="h-9 w-[185px]">
            <SlidersHorizontal className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent className="max-h-72 overflow-y-auto">
            <SelectItem value="all">All statuses</SelectItem>
            {ORDER_STATUS_KEYS.map((key) => (
              <SelectItem key={key} value={key}>
                {ORDER_STATUSES[key]?.label ?? key}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Sort column */}
        <Select
          value={sortBy ?? "created_at"}
          onValueChange={(v) => push({ sort: v, dir: sortDir ?? "desc" })}
        >
          <SelectTrigger className="h-9 w-[150px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map(({ value, label }) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Sort direction toggle */}
        <Button
          variant="outline"
          size="sm"
          onClick={toggleSortDir}
          className="h-9 gap-1.5"
          title={sortDir === "asc" ? "Ascending — click to switch to descending" : "Descending — click to switch to ascending"}
        >
          {sortDir === "asc"
            ? <><ArrowUpAZ className="h-4 w-4" /> Asc</>
            : <><ArrowDownAZ className="h-4 w-4" /> Desc</>}
        </Button>

        {/* Export current view as CSV manifest */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => exportOrdersToCsv(orders)}
          disabled={orders.length === 0}
          className="h-9 gap-1.5"
          title="Export visible orders as CSV (delivery manifest)"
        >
          <Download className="h-3.5 w-3.5" />
          Export CSV
        </Button>

        {/* Active filters count + clear button */}
        {activeFilterCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearAll}
            className="h-9 gap-1.5 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
            Clear filters
            <Badge variant="secondary" className="ml-0.5 px-1.5 py-0.5 text-xs">
              {activeFilterCount}
            </Badge>
          </Button>
        )}
      </div>

      {/* ── Payment / COD filter chips ──────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 -mt-3">
        <span className="text-xs uppercase text-muted-foreground mr-1">Payment:</span>
        <ChipButton
          active={!payment && !payState}
          onClick={() => push({ payment: "", paystat: "" })}
        >
          All
        </ChipButton>
        <ChipButton
          active={payment === "cod" && !payState}
          onClick={() => push({ payment: "cod", paystat: "" })}
          icon={<Banknote className="h-3 w-3" />}
        >
          COD
        </ChipButton>
        <ChipButton
          active={payment === "cod" && payState === "cod_pending_collection"}
          onClick={() => push({ payment: "cod", paystat: "cod_pending_collection" })}
          icon={<Banknote className="h-3 w-3" />}
        >
          COD — Cash Pending
        </ChipButton>
        <ChipButton
          active={payment === "cod" && payState === "succeeded"}
          onClick={() => push({ payment: "cod", paystat: "succeeded" })}
        >
          COD — Collected
        </ChipButton>
        <ChipButton
          active={payment === "stripe" || payment === "razorpay"}
          onClick={() => push({ payment: "stripe", paystat: "" })}
        >
          Online
        </ChipButton>
      </div>

      {/* ── Table ───────────────────────────────────────────────────────── */}
      <DataTable
        columns={columns}
        data={orders}
        keyFn={(o) => o.id}
        isLoading={isLoading}
        loadingText="Loading orders…"
        emptyTitle={activeFilterCount > 0 ? "No orders match your filters" : "No orders yet"}
        emptyDescription={
          activeFilterCount > 0
            ? "Try adjusting your search or filter criteria."
            : "Orders will appear here once customers start purchasing."
        }
        page={page}
        totalPages={totalPages}
        onPageChange={(p) => push({ page: String(p) })}
      />
    </div>
  );
}
