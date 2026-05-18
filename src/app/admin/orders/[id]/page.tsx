import { ArrowLeft, ExternalLink, PackageX, RefreshCw, Undo2 } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CodCollectionPanel } from "@/components/admin/orders/cod-collection-panel";
import { AdminTrackingForm } from "@/components/admin/orders/tracking-form";
import type { FulfillmentData } from "@/components/admin/orders/tracking-form";
import { AdminReturnActions } from "@/components/admin/orders/return-actions";
import { StatusBadge } from "@/components/common/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
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
    .select(
      "id, order_number, status, created_at, shipping_address, subtotal, tax, shipping, discount, total, user_id, items:order_items(*)",
    )
    .eq("id", orderId)
    .single();

  if (!order) notFound();

  // Fetch fulfillments, payment, and return requests in parallel
  const [{ data: allFulfillmentsRaw }, { data: paymentRaw }, { data: returnsRaw }] = await Promise.all([
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
  ]);

  type AllFulfillmentRow = FulfillmentData & { shipment_type: string; request_id: string | null };
  const allFulfillments = (allFulfillmentsRaw ?? []) as unknown as AllFulfillmentRow[];

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

  // Show COD panel when order is in a collection-eligible status
  const codEligibleStatuses = ["out_for_delivery", "delivered", "confirmed", "processing", "packed", "shipped"];
  // Show pending panel when COD payment is awaiting collection
  // Show collected panel only when there's a real cod_collected_at timestamp (prevents
  // erroneously-set 'succeeded' from showing the collected banner)
  const codActuallyCollected = isCod && payment?.status === "succeeded" && Boolean(codCollectedAt);
  const showCodPanel = isCod && (codPending || codActuallyCollected) && codEligibleStatuses.includes(order.status);

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
          <h1 className="text-2xl font-bold">Order #{order.order_number}</h1>
          <p className="text-sm text-muted-foreground">
            Placed {formatDate(order.created_at)} at{" "}
            {new Date(order.created_at).toLocaleTimeString("en-IN", {
              hour: "2-digit",
              minute: "2-digit",
              hour12: true,
            })}
          </p>
        </div>
        <StatusBadge status={order.status} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">

        {/* ── Left column ────────────────────────────────────────────── */}
        <div className="space-y-6">

          {/* ── COD Collection Panel ──────────────────────────────────── */}
          {showCodPanel && (
            <CodCollectionPanel
              orderId={orderId}
              orderTotal={Number(order.total)}
              paymentStatus={payment?.status ?? "cod_pending_collection"}
              collectedAt={codCollectedAt}
            />
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

                      {/* Approve / reject actions (client component) */}
                      {r.status === "requested" && (
                        <AdminReturnActions returnId={r.id} requestType={r.request_type} />
                      )}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}
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
                      {payment.status === "cod_pending_collection"
                        ? "Pending Collection"
                        : payment.status.charAt(0).toUpperCase() + payment.status.slice(1)}
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
        </div>
      </div>
    </div>
  );
}
