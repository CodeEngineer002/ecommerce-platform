"use client";

import Image from "next/image";
import Link from "next/link";
import {
  CheckCircle2,
  Circle,
  Package,
  PackageX,
  RefreshCcw,
  RotateCcw,
  XCircle,
} from "lucide-react";

import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { OrderStatus } from "@/domain/order/order-state-machine";
import { isOrderCancellable } from "@/domain/order/order-state-machine";
import {
  ORDER_JOURNEY,
  TRACK_STEPS,
  type OrderTab,
} from "@/domain/order/order-journey";

interface OrderItem {
  id:           string;
  product_name: string;
  variant_name: string | null;
  quantity:     number;
  unit_price:   number;
  total:        number;
  image_url:    string | null;
}

interface ReturnRow {
  id:         string;
  status:     string;
  created_at: string;
}

export interface OrderCardData {
  id:             string;
  order_number:   string;
  status:         string;
  created_at:     string;
  total:          number;
  subtotal:       number;
  shipping:       number;
  tax:            number;
  discount:       number;
  items:          OrderItem[];
  returns:        ReturnRow[];
  hasTracking:    boolean;
  /** ISO timestamp of when the order was marked delivered (from order_status_history) */
  delivered_at:   string | null;
}

interface Props {
  order:      OrderCardData;
  orderHref:  string;
  returnHref: string;
  fmt:        (n: number) => string;
}

// Mini step-progress bar (3 dots max for list view)
function MiniProgress({ status }: { status: OrderStatus }) {
  const journey = ORDER_JOURNEY[status];
  if (!journey || journey.track === "cancelled") return null;

  const isRejected =
    status === "return_rejected" || status === "replacement_rejected";

  const steps   = TRACK_STEPS[journey.track];
  const current = journey.step;

  // Show only 3 contextual steps: prev → current → next
  const from  = Math.max(0, current - 1);
  const slice = steps.slice(from, from + 3);
  const rel   = current - from; // index within slice

  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      {slice.map((stepLabel, i) => {
        const done        = i < rel;
        const isCurrent   = i === rel;
        const stepReject  = isRejected && isCurrent;
        return (
          <div key={stepLabel} className="flex items-center gap-1.5">
            {i > 0 && (
              <div
                className={`h-px w-6 ${
                  done || isCurrent
                    ? stepReject ? "bg-destructive/40" : "bg-primary"
                    : "bg-muted-foreground/30"
                }`}
              />
            )}
            <div className="flex items-center gap-1">
              {done ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
              ) : stepReject ? (
                <XCircle className="h-3.5 w-3.5 text-destructive" />
              ) : isCurrent ? (
                <Circle className="h-3.5 w-3.5 fill-primary text-primary" />
              ) : (
                <Circle className="h-3.5 w-3.5 text-muted-foreground/40" />
              )}
              <span
                className={
                  stepReject
                    ? "font-medium text-destructive"
                    : isCurrent
                      ? "font-medium text-foreground"
                      : ""
                }
              >
                {stepLabel}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Track icon shown on each card
function TrackIcon({ status }: { status: OrderStatus }) {
  const track = ORDER_JOURNEY[status]?.track;
  const cls   = "h-5 w-5";
  if (track === "return" || track === "return_rejected")             return <RotateCcw      className={cls} />;
  if (track === "replacement" || track === "replacement_rejected")   return <RefreshCcw     className={cls} />;
  if (track === "refund")      return <RefreshCcw     className={cls} />;
  if (track === "cancelled")   return <XCircle        className={cls} />;
  return                              <Package        className={cls} />;
}

// Contextual action buttons depending on status
function OrderActions({
  order,
  orderHref,
  returnHref,
}: {
  order:      OrderCardData;
  orderHref:  string;
  returnHref: string;
}) {
  const status  = order.status as OrderStatus;
  const journey = ORDER_JOURNEY[status];
  const track   = journey?.track ?? "active";

  const canCancel = isOrderCancellable(status);
  const canReturn = (status === "delivered" || status === "partially_returned") &&
    !order.returns.some((r) =>
      ["requested", "approved", "pickup_scheduled", "in_transit"].includes(r.status),
    );

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" size="sm" asChild>
        <Link href={orderHref}>View Details</Link>
      </Button>

      {canReturn && (
        <Button variant="outline" size="sm" asChild className="gap-1.5">
          <Link href={returnHref}>
            <PackageX className="h-3.5 w-3.5" />
            Return / Replace
          </Link>
        </Button>
      )}

      {/* "Track Order" if shipped */}
      {(status === "shipped" || status === "out_for_delivery") && order.hasTracking && (
        <Button variant="outline" size="sm" asChild>
          <Link href={orderHref}>Track Order</Link>
        </Button>
      )}

      {/* Cancel available */}
      {canCancel && (
        <Button variant="ghost" size="sm" asChild className="text-destructive hover:text-destructive">
          <Link href={orderHref}>Cancel</Link>
        </Button>
      )}

      {/* Return in progress — show status context */}
      {track === "return" && (
        <Button variant="ghost" size="sm" asChild>
          <Link href={orderHref}>View Return Status</Link>
        </Button>
      )}

      {track === "replacement" && (
        <Button variant="ghost" size="sm" asChild>
          <Link href={orderHref}>View Replacement Status</Link>
        </Button>
      )}

      {track === "refund" && (
        <Button variant="ghost" size="sm" asChild>
          <Link href={orderHref}>View Refund Status</Link>
        </Button>
      )}
    </div>
  );
}

export function OrderCard({ order, orderHref, returnHref, fmt }: Props) {
  const status  = order.status as OrderStatus;
  const journey = ORDER_JOURNEY[status] ?? { label: status, color: "gray", hint: "", track: "active" };

  const colorClass: Record<string, string> = {
    green:  "border-l-green-500 bg-green-50/30 dark:bg-green-950/10",
    blue:   "border-l-blue-500 bg-blue-50/30 dark:bg-blue-950/10",
    purple: "border-l-purple-500 bg-purple-50/30 dark:bg-purple-950/10",
    yellow: "border-l-amber-400 bg-amber-50/30 dark:bg-amber-950/10",
    red:    "border-l-red-500 bg-red-50/30 dark:bg-red-950/10",
    orange: "border-l-orange-500 bg-orange-50/30 dark:bg-orange-950/10",
    gray:   "border-l-gray-400 bg-gray-50/30 dark:bg-gray-950/10",
  };

  return (
    <Card className={`overflow-hidden border-l-4 ${colorClass[journey.color] ?? colorClass.gray}`}>
      <CardContent className="p-0">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3 px-5 pt-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="text-muted-foreground shrink-0">
              <TrackIcon status={status} />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-sm leading-tight">
                Order #{order.order_number}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {new Date(order.created_at).toLocaleDateString("en-IN", {
                  day: "numeric", month: "short", year: "numeric",
                })}
              </p>
            </div>
          </div>
          <StatusBadge status={status} />
        </div>

        {/* Status hint */}
        {journey.hint && (
          <p className="px-5 pt-1.5 text-xs text-muted-foreground">{journey.hint}</p>
        )}

        {/* Delivery date + time — shown only for delivered orders */}
        {status === "delivered" && order.delivered_at && (
          <p className="px-5 pt-1 text-xs font-medium text-green-600 dark:text-green-400">
            Delivered on{" "}
            {new Date(order.delivered_at).toLocaleDateString("en-IN", {
              day: "numeric", month: "short", year: "numeric",
            })}{" "}
            at{" "}
            {new Date(order.delivered_at).toLocaleTimeString("en-IN", {
              hour: "2-digit", minute: "2-digit", hour12: true,
            })}
          </p>
        )}

        {/* Mini progress bar */}
        <div className="px-5 pt-3">
          <MiniProgress status={status} />
        </div>

        {/* Items (collapsed — show first 2 only) */}
        <div className="mx-5 mt-3 divide-y rounded-md border bg-background">
          {order.items.slice(0, 2).map((item) => (
            <div key={item.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
              {/* Thumbnail */}
              <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded border bg-muted">
                {item.image_url ? (
                  <Image
                    src={item.image_url}
                    alt={item.product_name}
                    fill
                    className="object-cover"
                    sizes="56px"
                  />
                ) : (
                  <div className="h-full w-full bg-muted" />
                )}
              </div>

              {/* Details */}
              <div className="min-w-0 flex-1">
                <p className="font-medium truncate">{item.product_name}</p>
                {item.variant_name && (
                  <p className="text-xs text-muted-foreground">{item.variant_name}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  {fmt(item.unit_price)} × {item.quantity}
                </p>
              </div>

              <span className="shrink-0 font-semibold text-sm">{fmt(item.total)}</span>
            </div>
          ))}
          {order.items.length > 2 && (
            <p className="px-3 py-2 text-xs text-muted-foreground">
              +{order.items.length - 2} more item{order.items.length - 2 > 1 ? "s" : ""}
            </p>
          )}
        </div>

        {/* Return requests summary */}
        {order.returns.length > 0 && (
          <div className="mx-5 mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs dark:border-amber-800 dark:bg-amber-950/30">
            <span className="font-medium">Return request: </span>
            <span className="capitalize text-muted-foreground">
              {order.returns[0].status.replace(/_/g, " ")}
            </span>
          </div>
        )}

        {/* Footer row */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pb-4 pt-3">
          <div>
            <p className="text-xs text-muted-foreground">Order Total</p>
            <p className="font-semibold">{fmt(order.total)}</p>
          </div>
          <OrderActions
            order={order}
            orderHref={orderHref}
            returnHref={returnHref}
          />
        </div>
      </CardContent>
    </Card>
  );
}

// ── Tab filter helper (used by parent page) ────────────────────────────────
export function filterOrdersByTab(orders: OrderCardData[], tab: OrderTab): OrderCardData[] {
  if (tab === "all") return orders;

  return orders.filter((o) => {
    const status  = o.status as OrderStatus;
    const journey = ORDER_JOURNEY[status];
    const track   = journey?.track ?? "active";

    if (tab === "active")    return track === "active" && status !== "delivered";
    if (tab === "delivered") return status === "delivered";
    if (tab === "cancelled") return track === "cancelled";
    if (tab === "returns")   return track === "return" || track === "replacement";
    if (tab === "refunds")   return track === "refund";
    return true;
  });
}
