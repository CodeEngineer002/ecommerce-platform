"use client";

import { useState } from "react";

import { PageHeader } from "@/components/common/page-header";
import { Pagination } from "@/components/common/pagination";
import { StatusBadge } from "@/components/common/status-badge";
import { LoadingState } from "@/components/feedback/loading-state";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ORDER_STATUSES } from "@/lib/constants";
import { formatDate, formatPrice } from "@/lib/utils";
import {
  useAdminOrders,
  useAdminUpdateOrderStatus,
} from "@/features/admin/hooks/use-admin-orders";
import type { OrderStatus } from "@/types";

export default function AdminOrdersPage() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useAdminOrders(page);
  const { mutate: updateStatus } = useAdminUpdateOrderStatus();

  const orders = data?.data ?? [];
  const total = data?.count ?? 0;
  const totalPages = Math.ceil(total / 20);

  if (isLoading) return <LoadingState text="Loading orders…" />;

  return (
    <div className="space-y-6">
      <PageHeader title="Orders" description={`${total} total orders`} />

      <div className="rounded-lg border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Order</th>
              <th className="px-4 py-3 text-left font-medium">Date</th>
              <th className="px-4 py-3 text-right font-medium">Total</th>
              <th className="px-4 py-3 text-center font-medium">Status</th>
              <th className="px-4 py-3 text-center font-medium">Update Status</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {orders.map((order) => (
              <tr key={order.id} className="hover:bg-muted/30">
                <td className="px-4 py-3">
                  <p className="font-mono font-medium">{order.order_number}</p>
                  <p className="text-xs text-muted-foreground">
                    {order.items.length} item{order.items.length !== 1 ? "s" : ""}
                  </p>
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {formatDate(order.created_at)}
                </td>
                <td className="px-4 py-3 text-right font-medium">
                  {formatPrice(order.total)}
                </td>
                <td className="px-4 py-3 text-center">
                  <StatusBadge status={order.status} />
                </td>
                <td className="px-4 py-3">
                  <Select
                    defaultValue={order.status}
                    onValueChange={(v) =>
                      updateStatus({ orderId: order.id, status: v as OrderStatus })
                    }
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
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex justify-center">
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
        </div>
      )}
    </div>
  );
}
