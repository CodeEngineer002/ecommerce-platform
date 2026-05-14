"use client";

import { useState } from "react";

import { DataTable, type ColumnDef } from "@/components/common/data-table";
import { PageHeader } from "@/components/common/page-header";
import { StatusBadge } from "@/components/common/status-badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  useAdminOrders,
  useAdminUpdateOrderStatus,
} from "@/features/admin/hooks/use-admin-orders";
import { ORDER_STATUSES } from "@/lib/constants";
import { formatDate, formatPrice } from "@/lib/utils";
import type { OrderStatus, OrderWithItems } from "@/types";

const columns = (
  onStatusChange: (orderId: string, status: OrderStatus) => void,
): ColumnDef<OrderWithItems>[] => [
  {
    header: "Order",
    cell: (o) => (
      <>
        <p className="font-mono font-medium">{o.order_number}</p>
        <p className="text-xs text-muted-foreground">
          {o.items.length} item{o.items.length !== 1 ? "s" : ""}
        </p>
      </>
    ),
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
    cell: (o) => <StatusBadge status={o.status} />,
  },
  {
    header: "Update Status",
    align: "center",
    cell: (o) => (
      <Select
        defaultValue={o.status}
        onValueChange={(v) => onStatusChange(o.id, v as OrderStatus)}
      >
        <SelectTrigger className="h-8 w-36">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(ORDER_STATUSES).map(([value, { label }]) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    ),
  },
];

export default function AdminOrdersPage() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useAdminOrders(page);
  const { mutate: updateStatus } = useAdminUpdateOrderStatus();

  const orders = data?.data ?? [];
  const total = data?.count ?? 0;
  const totalPages = Math.ceil(total / 20);

  return (
    <div className="space-y-6">
      <PageHeader title="Orders" description={`${total} total orders`} />

      <DataTable
        columns={columns((orderId, status) => updateStatus({ orderId, status }))}
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
