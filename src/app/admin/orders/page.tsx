"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";

import { DataTable, type ColumnDef } from "@/components/common/data-table";
import { PageHeader } from "@/components/common/page-header";
import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  useAdminOrders,
  useAdminUpdateOrderStatus,
} from "@/features/admin/hooks/use-admin-orders";
import { ORDER_STATUSES } from "@/lib/constants";
import { formatDate, formatPrice } from "@/lib/utils";
import type { OrderStatus, OrderWithItems } from "@/types";

/**
 * Valid next statuses for each current status.
 * Must stay in sync with ORDER_TRANSITIONS in domain/order/order-state-machine.ts
 * and the DB update_order_status() function.
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
  // After delivery: direct refund/partial paths added alongside the return/replace flow
  delivered:               ["return_requested", "replacement_requested", "refund_requested",
                            "partially_returned", "partially_refunded", "refunded"],
  return_requested:        ["return_approved", "return_rejected"],
  return_approved:         ["return_in_transit"],
  return_in_transit:       ["returned"],
  returned:                ["refunded", "replacement_shipped"],
  replacement_requested:   ["replacement_approved", "replacement_rejected"],
  // No manual transitions — replacement ORDER manages its own shipping lifecycle.
  // Parent order auto-closes to delivered when replacement order is delivered.
  replacement_approved:    [],
  replacement_shipped:     ["replacement_delivered"],
  refund_requested:        ["refund_processing"],
  refund_processing:       ["refunded", "partially_refunded"],
  // Partial return can still trigger another return/replace/refund cycle
  partially_returned:      ["return_requested", "replacement_requested", "refund_requested",
                            "refunded", "partially_refunded"],
  partially_refunded:      ["refunded"],
  cancelled:               ["refunded"],
  failed:                  [],
  // Terminal states — no further transitions
  return_rejected:         [],
  replacement_rejected:    [],
  replacement_delivered:   [],
  refunded:                [],
};

const columns = (
  onStatusChange: (orderId: string, status: OrderStatus) => void,
  updatingOrderId: string | null,
): ColumnDef<OrderWithItems>[] => [
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
    header: "Date",
    cell: (o) => <span className="text-muted-foreground">{formatDate(o.created_at)}</span>,
  },
  {
    header: "Total",
    align: "right",
    cell: (o) => <span className="font-medium">{formatPrice(o.total)}</span>,
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

export default function AdminOrdersPage() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useAdminOrders(page);
  const {
    mutate: updateStatus,
    isPending,
    variables,
  } = useAdminUpdateOrderStatus();

  const orders = data?.data ?? [];
  const total = data?.count ?? 0;
  const totalPages = Math.ceil(total / 20);

  // Which order row is currently being updated (null when idle)
  const updatingOrderId = isPending ? (variables?.orderId ?? null) : null;

  return (
    <div className="space-y-6">
      <PageHeader title="Orders" description={`${total} total orders`} />

      <DataTable
        columns={columns(
          (orderId, status) => updateStatus({ orderId, status }),
          updatingOrderId,
        )}
        data={orders}
        keyFn={(o) => o.id}
        isLoading={isLoading}
        loadingText="Loading orders…"
        emptyTitle="No orders yet"
        emptyDescription="Orders will appear here once customers start purchasing."
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
      />
    </div>
  );
}
