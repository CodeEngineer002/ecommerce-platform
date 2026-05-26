import { ArrowLeft, CheckCircle2, Circle, ExternalLink, PackageX, RefreshCw, Undo2, XCircle } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CodCollectionPanel } from "@/components/admin/orders/cod-collection-panel";
import { CodVerificationPanel } from "@/components/admin/orders/cod-verification-panel";
import { DeliveryRefusalPanel } from "@/components/admin/orders/delivery-refusal-panel";
import { AdminTrackingForm } from "@/components/admin/orders/tracking-form";
import type { FulfillmentData } from "@/components/admin/orders/tracking-form";
import { AdminReturnActions } from "@/components/admin/orders/return-actions";
import { ReturnPickupActions } from "@/components/admin/orders/return-pickup-actions";
import { AdminRefundPanel } from "@/components/admin/orders/refund-panel";
import { AdminOrderNotesPanel } from "@/components/admin/orders/order-notes-panel";
import { ReturnLifecycleActions } from "@/components/admin/orders/return-lifecycle-actions";
import { StatusBadge } from "@/components/common/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ORDER_JOURNEY } from "@/domain/order/order-journey";
import type { OrderStatus } from "@/domain/order/order-state-machine";
import { PERMISSIONS } from "@/lib/admin/permissions";
import { requireAdminPermission } from "@/lib/admin/with-admin-permission";
import { formatDate, formatPrice } from "@/lib/utils";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function AdminOrderDetailPage({ params }: Props) {
  const { id: orderId } = await params;

  // Admin auth
  const { db } = await requireAdminPermission(PERMISSIONS.ORDERS_READ);

  // Fetch order with items
  const { data: order } = await db
    .from("orders")
    .select("*, items:order_items(*)")
    .eq("id", orderId)
    .single();

  if (!order) notFound();

  const typedOrder = order as typeof order & {
    order_type: string;
    parent_order_id: string | null;
    replacement_request_id: string | null;
  };
  const isReplacementOrder = typedOrder.order_type === "replacement";

  // Fetch fulfillments, payment, return requests, status history, order_events and linked orders in parallel
  const [
    { data: allFulfillmentsRaw },
    { data: paymentRaw },
    { data: returnsRaw },
    { data: statusHistoryRaw },
    { data: replacementOrdersRaw },
    { data: parentOrderRaw },
    { data: orderEventsRaw },
  ] = await Promise.all([
    db
      .from("order_fulfillments")
      .select("id, carrier, tracking_number, tracking_url, estimated_delivery, status, shipment_type, request_id")
      .eq("order_id", orderId)
      .order("created_at", { ascending: true }),
    db
      .from("payments")
      .select("id, provider, status, amount, metadata, created_at")
      .eq("order_id", orderId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    db
      .from("order_returns")
      .select(`
        id, order_id, request_type, reason, status, created_at, reviewed_at, review_note,
        items:order_return_items(id, order_item_id, quantity, reason, condition,
          order_item:order_items(product_name, variant_name))
      `)
      .eq("order_id", orderId)
      .order("created_at", { ascending: false }),
    db
      .from("order_status_history")
      .select("id, from_status, to_status, reason, created_at, changed_by, source")
      .eq("order_id", orderId)
      .order("created_at", { ascending: true }),
    // Fetch system-generated replacement orders linked to this parent order
    db
      .from("orders")
      .select("id, order_number, status, replacement_request_id")
      .eq("parent_order_id", orderId)
      .eq("order_type", "replacement"),
    // If this IS a replacement order, fetch the parent order number for the back-link
    typedOrder.parent_order_id
      ? db
          .from("orders")
          .select("id, order_number")
          .eq("id", typedOrder.parent_order_id)
          .single()
      : Promise.resolve({ data: null }),
    // P2-5: order_events for rich admin timeline
    db
      .from("order_events")
      .select("id, event_type, description, actor_type, actor_id, source, created_at")
      .eq("order_id", orderId)
      .order("created_at", { ascending: true }),
  ]);

  type AllFulfillmentRow = FulfillmentData & { shipment_type: string; request_id: string | null };
  const allFulfillments = (allFulfillmentsRaw ?? []) as unknown as AllFulfillmentRow[];

  type LinkedReplacementOrder = {
    id: string;
    order_number: string;
    status: string;
    replacement_request_id: string | null;
  };
  const linkedReplacementOrderMap = new Map<string, LinkedReplacementOrder>();
  for (const ro of (replacementOrdersRaw ?? []) as unknown as LinkedReplacementOrder[]) {
    if (ro.replacement_request_id) {
      linkedReplacementOrderMap.set(ro.replacement_request_id, ro);
    }
  }

  const parentOrder = parentOrderRaw as { id: string; order_number: string } | null;

  // Original outbound fulfillment for the tracking form
  const fulfillment = (
    allFulfillments.find((f) => f.shipment_type === "outbound_original" || !f.shipment_type)
    ?? allFulfillments[0]
    ?? null
  ) as FulfillmentData | null;

  // Separate return/replacement shipments keyed by request_id
  const returnShipmentMap = new Map<string, AllFulfillmentRow>();
  const replacementShipmentMap = new Map<string, AllFulfillmentRow>();
  for (const f of allFulfillments) {
    if (f.request_id) {
      if (f.shipment_type === "return_pickup" || f.shipment_type === "exchange_pickup") {
        returnShipmentMap.set(f.request_id, f);
      } else if (f.shipment_type === "replacement_outbound") {
        replacementShipmentMap.set(f.request_id, f);
      }
    }
  }

  type ReturnItemRow = {
    id: string; order_item_id: string; quantity: number;
    reason: string | null; condition: string | null;
    order_item: { product_name: string; variant_name: string | null } | null;
  };
  type ReturnRow = {
    id: string; order_id: string; request_type: string; reason: string;
    status: string; created_at: string; reviewed_at: string | null; review_note: string | null;
    items: ReturnItemRow[];
  };

  const typedReturns = (returnsRaw ?? []) as unknown as ReturnRow[];

  type StatusHistoryRow = {
    id: string;
    from_status: string | null;
    to_status: string;
    reason: string | null;
    created_at: string;
    changed_by: string | null;
    source: string | null;
  };
  const statusHistory = (statusHistoryRaw ?? []) as unknown as StatusHistoryRow[];

  type OrderEventRow = {
    id: string;
    event_type: string;
    description: string;
    actor_type: string | null;
    actor_id: string | null;
    source: string;
    created_at: string;
  };
  const orderEvents = (orderEventsRaw ?? []) as unknown as OrderEventRow[];

  const payment = paymentRaw as {
    id: string;
    provider: string;
    status: string;
    amount: number;
    metadata: Record<string, unknown> | null;
    created_at: string;
  } | null;

  const isCod          = payment?.provider === "cod";
  const codPending     = isCod && (payment?.status === "cod_pending_collection" || payment?.status === "pending");
  const codCollectedAt = isCod ? (payment?.metadata?.cod_collected_at as string | null ?? null) : null;

  // Statuses where COD cash can actually be collected — must match the API route
  // (cod-collect/route.ts eligibleStatuses) and the DB RPC (confirm_cod_cash_collected
  // v_allowed_statuses). Keeping these in sync prevents showing an action button
  // that will always fail with an OrderStateError.
  const COD_COLLECT_ELIGIBLE = ["out_for_delivery", "delivered"] as const;

  // Statuses where the order is heading toward delivery but not yet eligible for
  // cash collection — show an informational notice instead of the action panel.
  const COD_IN_TRANSIT_STATUSES = ["confirmed", "processing", "packed", "shipped"];

  // Show collected panel only when there's a real cod_collected_at timestamp (prevents
  // erroneously-set 'succeeded' from showing the collected banner)
  const codActuallyCollected = isCod && payment?.status === "succeeded" && Boolean(codCollectedAt);
  const showCodPanel    = isCod && (codPending || codActuallyCollected) && (COD_COLLECT_ELIGIBLE as readonly string[]).includes(order.status);
  const showCodInTransit = isCod && codPending && COD_IN_TRANSIT_STATUSES.includes(order.status);

  const shipping = order.shipping_address as Record<string, string> | null;
  const fmt = (n: number) => formatPrice(n);

  return (
    <div className="space-y-6">
      {/* Back navigation */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild className="gap-2">
          <Link href="/admin/orders">
            <ArrowLeft className="h-4 w-4" /> Back to Orders
          </Link>
        </Button>
      </div>

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold">Order #{order.order_number}</h1>
            {isReplacementOrder && (
              <span className="inline-flex items-center rounded-full bg-purple-100 px-2.5 py-1 text-sm font-semibold text-purple-700 dark:bg-purple-950 dark:text-purple-300">
                Replacement Order
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Placed {formatDate(order.created_at)} at{" "}
            {new Date(order.created_at).toLocaleTimeString("en-IN", {
              hour: "2-digit",
              minute: "2-digit",
              hour12: true,
            })}
          </p>
          {isReplacementOrder && parentOrder && (
            <p className="mt-1 text-sm text-purple-600 dark:text-purple-400">
              Replacement for{" "}
              <Link
                href={`/admin/orders/${parentOrder.id}`}
                className="font-medium underline hover:text-purple-800"
              >
                #{parentOrder.order_number}
              </Link>
            </p>
          )}
        </div>
        <StatusBadge status={order.status} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">

        {/* ── Left column ────────────────────────────────────────────── */}
        <div className="space-y-6">

          {/* ── COD Verification Panel (P0-3) ─────────────────────────────
              Renders for high-value COD orders awaiting an admin verification
              call. Auto-queue cron skips these until verified. */}
          <CodVerificationPanel
            orderId={orderId}
            verificationRequired={
              (order as { cod_verification_required?: boolean }).cod_verification_required ?? false
            }
            verifiedAt={(order as { cod_verified_at?: string | null }).cod_verified_at ?? null}
          />

          {/* ── COD Collection Panel ──────────────────────────────────── */}
          {showCodPanel && (
            <CodCollectionPanel
              orderId={orderId}
              orderTotal={Number(order.total)}
              paymentStatus={payment?.status ?? "cod_pending_collection"}
              collectedAt={codCollectedAt}
            />
          )}

          {/* ── Delivery Refusal / RTO Panel (Phase 2.1) ─────────────────
              Visible only when status ∈ {shipped, out_for_delivery,
              delivery_refused, return_to_origin}; the panel renders nothing
              otherwise. */}
          <DeliveryRefusalPanel orderId={orderId} status={order.status} />

          {/* ── COD in-transit notice ─────────────────────────────────── */}
          {/* Shown when order is heading toward delivery but cash collection
              is not yet allowed (API/RPC only permits out_for_delivery/delivered).
              Keeps admins informed without showing a button that would fail. */}
          {showCodInTransit && (
            <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800/40 dark:bg-amber-900/20 dark:text-amber-300">
              <span className="mt-0.5 text-base leading-none">💰</span>
              <div>
                <p className="font-medium">COD — Cash collection pending</p>
                <p className="mt-0.5 text-amber-700 dark:text-amber-400">
                  The &ldquo;Confirm Cash Collected&rdquo; button will appear once the order
                  is marked <strong>Out for Delivery</strong> or <strong>Delivered</strong>.
                </p>
              </div>
            </div>
          )}

          {/* ── Tracking ──────────────────────────────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle>
                {fulfillment?.tracking_number ? "Update Tracking" : "Set Shipment Tracking"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {/* Current tracking info banner */}
              {fulfillment?.tracking_number && (
                <div className="mb-4 rounded-lg bg-blue-50 p-3 text-sm dark:bg-blue-950/30">
                  <p className="font-medium text-blue-900 dark:text-blue-100">
                    Current tracking
                    {fulfillment.carrier ? ` — ${fulfillment.carrier}` : ""}
                  </p>
                  <p className="font-mono text-blue-700 dark:text-blue-300">
                    {fulfillment.tracking_number}
                  </p>
                  {fulfillment.tracking_url && (
                    <a
                      href={fulfillment.tracking_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-flex items-center gap-1 text-blue-600 hover:underline"
                    >
                      View on carrier site <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                  {fulfillment.estimated_delivery && (
                    <p className="mt-1 text-muted-foreground">
                      Est. delivery:{" "}
                      {new Date(fulfillment.estimated_delivery).toLocaleDateString("en-IN", {
                        day: "numeric", month: "short", year: "numeric",
                      })}
                    </p>
                  )}
                </div>
              )}

              <AdminTrackingForm orderId={orderId} orderCreatedAt={order.created_at} fulfillment={fulfillment} />
            </CardContent>
          </Card>

          {/* ── Order Items ─────────────────────────────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle>Items Ordered</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-y">
                {(order.items as Array<{
                  id: string;
                  product_name: string;
                  variant_name: string | null;
                  sku: string | null;
                  quantity: number;
                  unit_price: number;
                  total: number;
                }>).map((item) => (
                  <li key={item.id} className="flex justify-between py-3 text-sm">
                    <div>
                      <p className="font-medium">{item.product_name}</p>
                      {item.variant_name && (
                        <p className="text-xs text-muted-foreground">{item.variant_name}</p>
                      )}
                      {item.sku && (
                        <p className="font-mono text-xs text-muted-foreground">SKU: {item.sku}</p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {fmt(item.unit_price)} × {item.quantity}
                      </p>
                    </div>
                    <span className="font-medium">{fmt(item.total)}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {/* ── Return / Replacement Requests ───────────────────────────── */}
          {typedReturns.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Return / Replacement Requests</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6 text-sm">
                {typedReturns.map((r) => {
                  const isReplacement = r.request_type === "replacement";
                  const pickupShipment = returnShipmentMap.get(r.id);
                  const replacementShipment = replacementShipmentMap.get(r.id);
                  const linkedReplacementOrder = linkedReplacementOrderMap.get(r.id);

                  return (
                    <div key={r.id} className="space-y-4 rounded-lg border p-4">
                      {/* Header */}
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="space-y-1">
                          <Badge
                            variant="outline"
                            className={isReplacement
                              ? "border-blue-300 text-blue-700 dark:border-blue-700 dark:text-blue-300"
                              : "border-orange-300 text-orange-700 dark:border-orange-700 dark:text-orange-300"
                            }
                          >
                            {isReplacement
                              ? <><RefreshCw className="mr-1 h-3 w-3" /> Replacement Request</>
                              : <><Undo2 className="mr-1 h-3 w-3" /> Return Request</>
                            }
                          </Badge>
                          <p className="capitalize font-medium">{r.reason}</p>
                          <p className="text-xs text-muted-foreground">
                            Submitted {formatDate(r.created_at)}
                          </p>
                        </div>
                        <StatusBadge status={r.status} />
                      </div>

                      {/* Items */}
                      {r.items.length > 0 && (
                        <ul className="space-y-1">
                          {r.items.map((item) => (
                            <li key={item.id} className="flex items-center justify-between rounded border px-3 py-2 text-xs">
                              <div>
                                <p className="font-medium">{item.order_item?.product_name ?? "Item"}</p>
                                {item.order_item?.variant_name && (
                                  <p className="text-muted-foreground">{item.order_item.variant_name}</p>
                                )}
                                {item.condition && (
                                  <p className="text-muted-foreground capitalize">Condition: {item.condition}</p>
                                )}
                              </div>
                              <span className="text-muted-foreground">Qty: {item.quantity}</span>
                            </li>
                          ))}
                        </ul>
                      )}

                      {/* Review note */}
                      {r.review_note && (
                        <div className="rounded-md bg-muted/50 p-3">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                            {r.status === "rejected" ? "Rejection reason" : "Admin note"}
                          </p>
                          <p>{r.review_note}</p>
                        </div>
                      )}

                      {/* Return pickup tracking */}
                      {pickupShipment?.tracking_number && (
                        <div className="rounded-md bg-muted/50 p-3 space-y-1">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            Return Pickup Tracking
                          </p>
                          <p className="font-mono text-xs">{pickupShipment.tracking_number}</p>
                          {pickupShipment.carrier && (
                            <p className="text-xs text-muted-foreground">via {pickupShipment.carrier}</p>
                          )}
                          {pickupShipment.tracking_url && (
                            <a
                              href={pickupShipment.tracking_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                            >
                              View tracking <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </div>
                      )}

                      {/* Replacement outbound tracking */}
                      {isReplacement && replacementShipment?.tracking_number && (
                        <div className="rounded-md bg-muted/50 p-3 space-y-1">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            Replacement Shipment Tracking
                          </p>
                          <p className="font-mono text-xs">{replacementShipment.tracking_number}</p>
                          {replacementShipment.carrier && (
                            <p className="text-xs text-muted-foreground">via {replacementShipment.carrier}</p>
                          )}
                          {replacementShipment.tracking_url && (
                            <a
                              href={replacementShipment.tracking_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                            >
                              View tracking <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </div>
                      )}

                      {/* Cancelled by customer */}
                      {r.status === "cancelled" && (
                        <div className="rounded-md bg-muted/50 p-3">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                            Cancelled by customer
                          </p>
                          <p className="text-xs text-muted-foreground">
                            The customer withdrew this request. No further action needed.
                          </p>
                        </div>
                      )}

                      {/* Linked replacement order — shown when system auto-created one on approval */}
                      {isReplacement && linkedReplacementOrder && (
                        <div className="rounded-md border border-purple-200 bg-purple-50/60 p-3 dark:border-purple-800 dark:bg-purple-950/20">
                          <p className="text-xs font-medium text-purple-700 dark:text-purple-300 uppercase tracking-wide mb-2">
                            Replacement Order Auto-Created
                          </p>
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <p className="text-sm font-semibold font-mono">#{linkedReplacementOrder.order_number}</p>
                              <p className="text-xs text-muted-foreground capitalize">
                                {linkedReplacementOrder.status.replace(/_/g, " ")}
                              </p>
                            </div>
                            <Button variant="outline" size="sm" asChild>
                              <Link href={`/admin/orders/${linkedReplacementOrder.id}`}>
                                Open Order <ExternalLink className="ml-1.5 h-3 w-3" />
                              </Link>
                            </Button>
                          </div>
                        </div>
                      )}

                      {/* Approve / reject actions — only for pending requests */}
                      {r.status === "requested" && (
                        <AdminReturnActions returnId={r.id} requestType={r.request_type} />
                      )}

                      {/* Return pickup lifecycle — shown once approved through received */}
                      {["approved", "pickup_scheduled", "in_transit", "received"].includes(r.status) && (
                        <ReturnPickupActions returnId={r.id} returnStatus={r.status} />
                      )}

                      {/* Post-warehouse lifecycle — inspected → accepted → closed */}
                      {["received", "inspected", "accepted", "refunded", "replaced"].includes(r.status) && (
                        <ReturnLifecycleActions returnId={r.id} returnStatus={r.status} />
                      )}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}
          {/* ── Admin Order Notes ────────────────────────────────────── */}
          <AdminOrderNotesPanel orderId={orderId} />

        </div>

        {/* ── Right column ────────────────────────────────────────────── */}
        <div className="space-y-6">

          {/* Order summary */}
          <Card className="h-fit">
            <CardHeader>
              <CardTitle>Order Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span>{fmt(order.subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tax</span>
                <span>{fmt(order.tax)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Shipping</span>
                <span>{order.shipping === 0 ? "FREE" : fmt(order.shipping)}</span>
              </div>
              {order.discount > 0 && (
                <div className="flex justify-between text-green-600">
                  <span>Discount</span>
                  <span>-{fmt(order.discount)}</span>
                </div>
              )}
              <Separator />
              <div className="flex justify-between font-semibold">
                <span>Total</span>
                <span>{fmt(order.total)}</span>
              </div>

              {/* Payment method + status */}
              {payment && (
                <>
                  <Separator />
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Payment</span>
                    <span className="font-medium uppercase">{payment.provider}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Payment status</span>
                    <span className={
                      payment.status === "succeeded"
                        ? "text-green-600 font-medium"
                        : payment.status === "cancelled"
                          ? "text-red-500 font-medium"
                          : "text-amber-600 font-medium"
                    }>
                      {payment.status === "succeeded"
                        ? "Paid"
                        : payment.status === "cod_pending_collection" || payment.status === "pending"
                          ? "Pending Collection"
                          : payment.status === "cancelled"
                            ? "Cancelled"
                            : payment.status === "refunded"
                              ? "Refunded"
                              : payment.status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                    </span>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Shipping address */}
          {shipping && (
            <Card>
              <CardHeader>
                <CardTitle>Shipping Address</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                {shipping.full_name && (
                  <p className="font-medium">{shipping.full_name}</p>
                )}
                {shipping.phone && <p>{shipping.phone}</p>}
                <p>{shipping.address_line1}</p>
                {shipping.address_line2 && <p>{shipping.address_line2}</p>}
                <p>
                  {shipping.city}
                  {shipping.state ? `, ${shipping.state}` : ""}
                  {shipping.postal_code ? ` – ${shipping.postal_code}` : ""}
                </p>
                <p>{shipping.country}</p>
              </CardContent>
            </Card>
          )}

          {/* ── Admin Refund Panel ────────────────────────────────── */}
          <AdminRefundPanel
            orderId={orderId}
            orderStatus={order.status}
            paymentProvider={payment?.provider ?? "cod"}
            items={(order.items as Array<{
              id: string; product_name: string; variant_name: string | null;
              quantity: number; unit_price: number;
            }>)}
            orderShipping={Number(order.shipping)}
          />

          {/* Order Progress — status history with timestamps */}
          <Card>
            <CardHeader>
              <CardTitle>Order Progress</CardTitle>
            </CardHeader>
            <CardContent>
              {statusHistory.length === 0 ? (
                <p className="text-sm text-muted-foreground">No status history recorded yet.</p>
              ) : (
                <ol className="relative space-y-0">
                  {/* Vertical connector */}
                  <div className="absolute left-[13px] top-3 bottom-3 w-px bg-border" />

                  {[...statusHistory].reverse().map((entry, idx) => {
                    const isFirst   = idx === 0; // most recent (reversed)
                    const toJourney = ORDER_JOURNEY[entry.to_status as OrderStatus];
                    const isTerminalBad =
                      entry.to_status === "cancelled" ||
                      entry.to_status === "failed" ||
                      entry.to_status === "return_rejected" ||
                      entry.to_status === "replacement_rejected";

                    const entryDate = new Date(entry.created_at);

                    // P2-3: source → human-readable actor label
                    const sourceLabel: string | null = entry.source
                      ? entry.source === "admin_override"
                        ? "Admin"
                        : entry.source === "customer_action"
                          ? "Customer"
                          : entry.source === "webhook"
                            ? "Payment Webhook"
                            : entry.source === "system"
                              ? "System"
                              : entry.source.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
                      : null;

                    const actorShort = entry.changed_by
                      ? entry.changed_by.slice(0, 8) + "…"
                      : null;

                    return (
                      <li key={entry.id} className="relative flex gap-3 pb-5 last:pb-0">
                        {/* Step icon */}
                        <div className="relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-background ring-1 ring-border">
                          {isFirst ? (
                            isTerminalBad ? (
                              <XCircle className="h-4 w-4 text-destructive" />
                            ) : (
                              <Circle className="h-3 w-3 rounded-full bg-primary ring-2 ring-primary/30" />
                            )
                          ) : (
                            <CheckCircle2 className="h-4 w-4 text-primary" />
                          )}
                        </div>

                        {/* Content */}
                        <div className="min-w-0 flex-1 pt-0.5 space-y-0.5">
                          <p className={`text-sm font-medium leading-tight ${
                            isTerminalBad && isFirst ? "text-destructive" : "text-foreground"
                          }`}>
                            {toJourney?.label ?? entry.to_status.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
                          </p>

                          {/* Date + time */}
                          <p className="text-xs text-muted-foreground">
                            {entryDate.toLocaleDateString("en-IN", {
                              day: "numeric", month: "short", year: "numeric",
                            })}{" "}
                            at{" "}
                            {entryDate.toLocaleTimeString("en-IN", {
                              hour: "2-digit", minute: "2-digit", hour12: true,
                            })}
                          </p>

                          {/* P2-3: Actor + source */}
                          {(sourceLabel || actorShort) && (
                            <p className="text-xs text-muted-foreground">
                              {sourceLabel && (
                                <span className="inline-flex items-center rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[10px] leading-none mr-1">
                                  {sourceLabel}
                                </span>
                              )}
                              {actorShort && (
                                <span className="font-mono text-[10px]">uid:{actorShort}</span>
                              )}
                            </p>
                          )}

                          {/* Reason/note if present */}
                          {entry.reason && (
                            <p className="text-xs text-muted-foreground italic truncate">
                              {entry.reason}
                            </p>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </CardContent>
          </Card>

          {/* ── P2-5: Order Events log ──────────────────────────────── */}
          {orderEvents.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Event Log</CardTitle>
              </CardHeader>
              <CardContent>
                <ol className="space-y-3">
                  {[...orderEvents].reverse().map((ev) => {
                    const evDate = new Date(ev.created_at);
                    const sourceTag = ev.source && ev.source !== "system"
                      ? ev.source.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
                      : null;
                    return (
                      <li key={ev.id} className="flex gap-3 text-sm">
                        <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-muted-foreground/40 ring-2 ring-border" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium capitalize">
                              {ev.event_type.replace(/_/g, " ")}
                            </span>
                            {sourceTag && (
                              <span className="inline-flex items-center rounded-sm bg-muted px-1.5 py-0.5 text-[10px] font-mono leading-none text-muted-foreground">
                                {sourceTag}
                              </span>
                            )}
                            {ev.actor_type && (
                              <span className="inline-flex items-center rounded-sm border px-1.5 py-0.5 text-[10px] font-mono leading-none text-muted-foreground">
                                {ev.actor_type}
                              </span>
                            )}
                          </div>
                          <p className="text-muted-foreground text-xs mt-0.5">{ev.description}</p>
                          <p className="text-muted-foreground text-xs mt-0.5">
                            {evDate.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                            {" at "}
                            {evDate.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
