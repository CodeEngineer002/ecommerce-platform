import { ArrowLeft, Download } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { CodDueBanner } from "@/components/orders/cod-due-banner";
import { OrderActions } from "@/components/orders/order-actions";
import { OrderTimeline } from "@/components/orders/order-timeline";
import { ReturnCancelButton } from "@/components/orders/return-cancel-button";
import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { isOrderCancellable } from "@/domain/order/order-state-machine";
import { ORDER_JOURNEY } from "@/domain/order/order-journey";
import { isValidCountry, isValidLanguage, type CountryCode, type LanguageCode } from "@/lib/i18n/config";
import { REGION_CONFIGS } from "@/lib/i18n/region-config";
import { buildLocaleRoutes, type LocaleParams } from "@/lib/i18n/routing";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatPrice } from "@/lib/utils";

interface Props {
  params: Promise<{ country: string; lang: string; id: string }>;
}

export default async function LocaleOrderDetailPage({ params }: Props) {
  const { country, lang, id } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Query using the authenticated server client (respects RLS session)
  const { data: orderRaw } = await supabase
    .from("orders")
    .select("*, items:order_items(*), payments(*)")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!orderRaw) notFound();

  // P2-2: Fetch order_status_history for timestamped timeline
  const { data: statusHistoryRaw } = await supabase
    .from("order_status_history")
    .select("id, from_status, to_status, reason, created_at")
    .eq("order_id", id)
    .order("created_at", { ascending: true });

  type StatusHistoryRow = {
    id: string;
    from_status: string | null;
    to_status: string;
    reason: string | null;
    created_at: string;
  };
  const statusHistory = (statusHistoryRaw ?? []) as unknown as StatusHistoryRow[];

  // payments(*) returns an array — extract first record
  type PaymentRow = { id: string; provider: string; status: string; amount: number };
  const paymentsArr = (orderRaw as unknown as { payments: PaymentRow[] }).payments ?? [];
  const order = {
    ...(orderRaw as unknown as Record<string, unknown>),
    payment: paymentsArr[0] ?? null,
  } as typeof orderRaw & { payment: PaymentRow | null };

  const localeParams: LocaleParams = isValidCountry(country) && isValidLanguage(lang)
    ? { country: country as CountryCode, lang: lang as LanguageCode }
    : { country: "in", lang: "en" };
  const routes = buildLocaleRoutes(localeParams);

  const countryKey = isValidCountry(country) ? (country as CountryCode) : "in";
  const { currencyCode, currencyLocale } = REGION_CONFIGS[countryKey];
  const fmt = (amount: number) => formatPrice(amount, currencyCode, currencyLocale);

  const shipping = order.shipping_address as Record<string, string>;

  // Fetch all fulfillments for this order (separated by shipment_type)
  const { data: allFulfillments } = await supabase
    .from("order_fulfillments")
    .select("id, carrier, tracking_number, tracking_url, estimated_delivery, shipment_type, request_id")
    .eq("order_id", id)
    .order("created_at", { ascending: true });

  type FulfillmentRow = {
    id: string;
    carrier: string | null;
    tracking_number: string | null;
    tracking_url: string | null;
    estimated_delivery: string | null;
    shipment_type: string;
    request_id: string | null;
  };

  const allFulfillmentRows = (allFulfillments ?? []) as unknown as FulfillmentRow[];

  // Original outbound shipment (first outbound_original row)
  const typedFulfillment = allFulfillmentRows.find(
    (f) => f.shipment_type === "outbound_original" || !f.shipment_type,
  ) ?? (allFulfillmentRows[0] ?? null);

  // Return/replacement shipments keyed by request_id
  const returnShipmentMap = new Map<string, FulfillmentRow>();
  const replacementShipmentMap = new Map<string, FulfillmentRow>();
  for (const f of allFulfillmentRows) {
    if (f.request_id) {
      if (f.shipment_type === "return_pickup" || f.shipment_type === "exchange_pickup") {
        returnShipmentMap.set(f.request_id, f);
      } else if (f.shipment_type === "replacement_outbound") {
        replacementShipmentMap.set(f.request_id, f);
      }
    }
  }

  // Fetch return requests (include review_note for rejection reason display)
  const { data: returnsRaw } = await supabase
    .from("order_returns")
    .select("id, status, reason, request_type, created_at, review_note, reviewed_at")
    .eq("order_id", id)
    .order("created_at", { ascending: false });

  // Fetch linked replacement orders (system-generated when a replacement request is approved)
  const { data: replacementOrdersRaw } = await supabase
    .from("orders")
    .select("id, order_number, status, replacement_request_id")
    .eq("parent_order_id", id)
    .eq("order_type", "replacement");

  type ReplacementOrderLink = {
    id: string;
    order_number: string;
    status: string;
    replacement_request_id: string | null;
  };

  const replacementOrderMap = new Map<string, ReplacementOrderLink>();
  for (const ro of (replacementOrdersRaw ?? []) as unknown as ReplacementOrderLink[]) {
    if (ro.replacement_request_id) {
      replacementOrderMap.set(ro.replacement_request_id, ro);
    }
  }

  type ReturnRow = {
    id: string;
    status: string;
    reason: string;
    request_type: string;
    created_at: string;
    review_note: string | null;
    reviewed_at: string | null;
  };

  const typedReturns = (returnsRaw ?? []) as unknown as ReturnRow[];

  // Fetch color-aware product images for each order item
  type ImgRow = { url: string; variant_id?: string | null; variant?: { options?: Record<string, string> | null } | null };
  type VarRow  = { id: string; options: Record<string, string> | null; product: { images: ImgRow[] } | null };

  const itemImageMap   = new Map<string, string>();
  const itemVariantMap = new Map<string, { color?: string; size?: string }>();
  const variantIds = (order.items as Array<{ variant_id?: string | null }>)
    .map((i) => i.variant_id)
    .filter((v): v is string => Boolean(v));

  if (variantIds.length > 0) {
    const { data: varRows } = await supabase
      .from("product_variants")
      .select("id, options, product:products(images:product_images(url, variant_id, variant:product_variants(options)))")
      .in("id", variantIds);

    for (const v of (varRows ?? []) as unknown as VarRow[]) {
      const color = v.options?.color?.toLowerCase();
      const imgs  = v.product?.images ?? [];
      const direct    = imgs.find((img) => img.variant_id === v.id);
      const sameColor = !direct && color
        ? imgs.find((img) => img.variant?.options?.color?.toLowerCase() === color)
        : null;
      const url = (direct ?? sameColor ?? imgs[0])?.url;
      if (url) itemImageMap.set(v.id, url);

      // Store color + size for display
      if (v.options?.color || v.options?.size) {
        itemVariantMap.set(v.id, { color: v.options?.color, size: v.options?.size });
      }
    }
  }

  const canCancel = isOrderCancellable(order.status as Parameters<typeof isOrderCancellable>[0]);
  const canReturn = ["delivered", "partially_returned"].includes(order.status);
  // Active: anything not yet terminal (requested/approved/pickup_scheduled/in_transit)
  const activeReturn = typedReturns.find((r) =>
    ["requested", "approved", "pickup_scheduled", "in_transit"].includes(r.status),
  );
  const hasActiveReturn = Boolean(activeReturn);
  // Show original shipment tracking banner only when there is NO active return/replacement
  const showShipmentTracking = Boolean(typedFulfillment?.tracking_number) && !hasActiveReturn;

  return (
    <div className="container py-8">
      <Button variant="ghost" size="sm" asChild className="mb-6 gap-2">
        <Link href={routes.orders}>
          <ArrowLeft className="h-4 w-4" /> Back to Orders
        </Link>
      </Button>

      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Order #{order.order_number}</h1>
          <p className="text-sm text-muted-foreground">
            {formatDate(order.created_at)} at{" "}
            {new Date(order.created_at).toLocaleTimeString("en-IN", {
              hour: "2-digit",
              minute: "2-digit",
              hour12: true,
            })}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={order.status} />
          {/* Invoice download — direct link to PDF endpoint */}
          <Button variant="outline" size="sm" asChild>
            <a href={`/api/orders/${order.id}/invoice`} download>
              <Download className="mr-1.5 h-3.5 w-3.5" />
              Invoice
            </a>
          </Button>
          <OrderActions
            orderId={order.id}
            canCancel={canCancel}
            canReturn={canReturn && !hasActiveReturn}
            returnHref={routes.orderReturn(order.id)}
          />
        </div>
      </div>

      {/* Tracking banner — hidden when active return/replacement request exists */}
      {showShipmentTracking && (
        <Card className="mb-6 border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30">
          <CardContent className="py-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <div>
                <p className="font-medium">
                  {typedFulfillment.carrier ? `Shipped via ${typedFulfillment.carrier}` : "Shipment tracking"}
                </p>
                <p className="text-muted-foreground">
                  Tracking: <span className="font-mono">{typedFulfillment.tracking_number}</span>
                </p>
                {typedFulfillment.estimated_delivery && (
                  <p className="text-muted-foreground">
                    Estimated delivery:{" "}
                    {new Date(typedFulfillment.estimated_delivery).toLocaleDateString("en-IN", {
                      day: "numeric", month: "short", year: "numeric",
                    })}
                  </p>
                )}
              </div>
              {typedFulfillment.tracking_url && (
                <Button variant="outline" size="sm" asChild>
                  <a href={typedFulfillment.tracking_url} target="_blank" rel="noopener noreferrer">
                    Track Shipment
                  </a>
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Active return/replacement notice */}
      {hasActiveReturn && activeReturn && (
        <Card className="mb-6 border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30">
          <CardContent className="py-4 text-sm">
            <p className="font-medium">
              {activeReturn.request_type === "replacement"
                ? "Replacement in progress"
                : "Return in progress"}
            </p>
            <p className="text-muted-foreground">
              Your request is being processed. We will update you shortly.
            </p>
          </CardContent>
        </Card>
      )}

      {/* 3-column layout: items+returns+shipping | summary | timeline */}
      <div className="grid gap-6 lg:grid-cols-[1fr_280px_220px]">

        {/* ── Left column ─────────────────────────────────────────── */}
        <div className="space-y-6">

          {/* Items */}
          <Card>
            <CardHeader>
              <CardTitle>Items Ordered</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-y">
                {order.items.map((item) => {
                  const vid        = (item as typeof item & { variant_id?: string | null }).variant_id;
                  const imageUrl   = vid ? itemImageMap.get(vid) : undefined;
                  const variantInfo = vid ? itemVariantMap.get(vid) : undefined;

                  // Build variant label: prefer stored variant_name, fall back to options
                  const variantLabel = item.variant_name
                    ?? (variantInfo
                        ? [variantInfo.color, variantInfo.size].filter(Boolean).join(" / ")
                        : null);

                  return (
                    <li key={item.id} className="flex items-center gap-3 py-4 text-sm">
                      {/* Product thumbnail */}
                      <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md border bg-muted">
                        {imageUrl ? (
                          <Image
                            src={imageUrl}
                            alt={item.product_name}
                            fill
                            className="object-cover"
                            sizes="64px"
                          />
                        ) : (
                          <div className="h-full w-full bg-muted" />
                        )}
                      </div>

                      {/* Item details */}
                      <div className="flex flex-1 items-center justify-between gap-2">
                        <div>
                          <p className="font-medium">{item.product_name}</p>
                          {variantLabel && (
                            <p className="text-xs text-muted-foreground">{variantLabel}</p>
                          )}
                          <p className="text-xs text-muted-foreground">
                            {fmt(item.unit_price)} × {item.quantity}
                          </p>
                        </div>
                        <span className="font-semibold">{fmt(item.total)}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>

          {/* Return / Replacement requests */}
          {typedReturns.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Return / Replacement Requests</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5 text-sm">
                {typedReturns.map((r) => {
                  const isReplacement = r.request_type === "replacement";
                  const pickupShipment = returnShipmentMap.get(r.id);
                  const replacementShipment = replacementShipmentMap.get(r.id);
                  const isRejected = r.status === "rejected";
                  const isCancelled = r.status === "cancelled";
                  const linkedReplacementOrder = replacementOrderMap.get(r.id);

                  return (
                    <div
                      key={r.id}
                      className={`rounded-lg border p-4 space-y-3 ${
                        isRejected
                          ? "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/20"
                          : isCancelled
                            ? "border-muted bg-muted/30"
                            : ""
                      }`}
                    >
                      {/* Header: type badge + status */}
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="space-y-1">
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                            isReplacement
                              ? "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                              : "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300"
                          }`}>
                            {isReplacement ? "Replacement Request" : "Return Request"}
                          </span>
                          <p className="font-medium capitalize">{r.reason}</p>
                        </div>
                        <StatusBadge status={r.status} />
                      </div>

                      <p className="text-xs text-muted-foreground">
                        Submitted on {formatDate(r.created_at)}
                      </p>

                      {/* Rejection block — shows reason from admin + re-submit hint */}
                      {isRejected && (
                        <div className="rounded-md border border-red-200 bg-white px-3 py-2.5 space-y-1 dark:border-red-800 dark:bg-background">
                          <p className="text-xs font-semibold text-destructive uppercase tracking-wide">
                            Request Not Approved
                          </p>
                          {r.review_note ? (
                            <p className="text-xs text-foreground">
                              <span className="font-medium">Reason: </span>{r.review_note}
                            </p>
                          ) : (
                            <p className="text-xs text-muted-foreground">
                              No reason provided. Please contact customer support for details.
                            </p>
                          )}
                          {r.reviewed_at && (
                            <p className="text-xs text-muted-foreground">
                              Reviewed on {formatDate(r.reviewed_at)}
                            </p>
                          )}
                          <p className="text-xs text-muted-foreground pt-1">
                            If you believe this is a mistake, you may submit a new request or contact our support team.
                          </p>
                        </div>
                      )}

                      {/* Cancelled notice */}
                      {isCancelled && (
                        <p className="text-xs text-muted-foreground italic">
                          This request was cancelled by you.
                        </p>
                      )}

                      {/* Cancel button — only when request is still pending review */}
                      {r.status === "requested" && (
                        <ReturnCancelButton
                          orderId={order.id}
                          requestId={r.id}
                          requestType={r.request_type}
                        />
                      )}

                      {/* Return pickup status message — visible once approved */}
                      {r.status === "approved" && (
                        <div className="flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2.5 text-sm dark:border-blue-800 dark:bg-blue-950/30">
                          <span className="mt-0.5 shrink-0 text-blue-500">📦</span>
                          <div>
                            <p className="font-medium text-blue-800 dark:text-blue-300">Approved — Pickup Being Arranged</p>
                            <p className="text-xs text-blue-700 dark:text-blue-400 mt-0.5">
                              Your request has been approved. Our delivery partner will contact you to schedule a pickup of the item.
                            </p>
                          </div>
                        </div>
                      )}

                      {r.status === "pickup_scheduled" && (
                        <div className="flex items-start gap-2 rounded-md border border-purple-200 bg-purple-50 px-3 py-2.5 text-sm dark:border-purple-800 dark:bg-purple-950/30">
                          <span className="mt-0.5 shrink-0 text-purple-500">🚚</span>
                          <div>
                            <p className="font-medium text-purple-800 dark:text-purple-300">Pickup Scheduled</p>
                            <p className="text-xs text-purple-700 dark:text-purple-400 mt-0.5">
                              Our delivery partner is on the way to collect your item. Please keep the item ready.
                            </p>
                          </div>
                        </div>
                      )}

                      {r.status === "in_transit" && (
                        <div className="flex items-start gap-2 rounded-md border border-indigo-200 bg-indigo-50 px-3 py-2.5 text-sm dark:border-indigo-800 dark:bg-indigo-950/30">
                          <span className="mt-0.5 shrink-0 text-indigo-500">✅</span>
                          <div>
                            <p className="font-medium text-indigo-800 dark:text-indigo-300">Item Collected — On Its Way Back</p>
                            <p className="text-xs text-indigo-700 dark:text-indigo-400 mt-0.5">
                              Your item has been collected by our delivery partner and is on its way to our warehouse.
                            </p>
                          </div>
                        </div>
                      )}

                      {r.status === "received" && (
                        <div className="flex items-start gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-2.5 text-sm dark:border-green-800 dark:bg-green-950/30">
                          <span className="mt-0.5 shrink-0 text-green-500">🏭</span>
                          <div>
                            <p className="font-medium text-green-800 dark:text-green-300">Item Received at Warehouse</p>
                            <p className="text-xs text-green-700 dark:text-green-400 mt-0.5">
                              {isReplacement
                                ? "Your item has been received. Your replacement order is being processed."
                                : "Your item has been received at our warehouse. Our team will inspect it and initiate your refund — typically within 3–5 business days."}
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Linked replacement order card — shown when system auto-created a replacement order */}
                      {isReplacement && linkedReplacementOrder && (
                        <div className="rounded-md border border-purple-200 bg-purple-50/60 p-3 dark:border-purple-800 dark:bg-purple-950/20">
                          <p className="text-xs font-medium text-purple-700 dark:text-purple-300 uppercase tracking-wide mb-2">
                            Replacement Order Created
                          </p>
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <p className="text-sm font-semibold">#{linkedReplacementOrder.order_number}</p>
                              <p className="text-xs text-muted-foreground capitalize">
                                {linkedReplacementOrder.status.replace(/_/g, " ")}
                              </p>
                            </div>
                            <Link
                              href={routes.order(linkedReplacementOrder.id)}
                              className="text-xs font-medium text-purple-700 hover:text-purple-800 underline dark:text-purple-300"
                            >
                              View Order →
                            </Link>
                          </div>
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
                              className="text-xs text-primary hover:underline"
                            >
                              Track pickup
                            </a>
                          )}
                        </div>
                      )}

                      {/* Replacement outbound tracking (only for replacement requests) */}
                      {isReplacement && replacementShipment?.tracking_number && (
                        <div className="rounded-md bg-muted/50 p-3 space-y-1">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            Replacement Shipment Tracking
                          </p>
                          <p className="font-mono text-xs">{replacementShipment.tracking_number}</p>
                          {replacementShipment.carrier && (
                            <p className="text-xs text-muted-foreground">via {replacementShipment.carrier}</p>
                          )}
                          {replacementShipment.estimated_delivery && (
                            <p className="text-xs text-muted-foreground">
                              Est. delivery:{" "}
                              {new Date(replacementShipment.estimated_delivery).toLocaleDateString("en-IN", {
                                day: "numeric", month: "short", year: "numeric",
                              })}
                            </p>
                          )}
                          {replacementShipment.tracking_url && (
                            <a
                              href={replacementShipment.tracking_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-primary hover:underline"
                            >
                              Track replacement
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {/* Shipping address */}
          <Card>
            <CardHeader>
              <CardTitle>Shipping Address</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p className="font-medium">{shipping.full_name}</p>
              {shipping.phone && <p>{shipping.phone}</p>}
              <p>{shipping.address_line1}</p>
              {shipping.address_line2 && <p>{shipping.address_line2}</p>}
              <p>{shipping.city}, {shipping.state} – {shipping.postal_code}</p>
              <p>{shipping.country}</p>
            </CardContent>
          </Card>
        </div>

        {/* ── Middle column: Order summary ─────────────────────────── */}
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
            {order.payment?.provider === "cod" &&
             order.payment?.status === "cod_pending_collection" && (
              <>
                <Separator />
                <CodDueBanner
                  amount={Number(order.total)}
                  currencyCode={order.currency ?? "INR"}
                />
              </>
            )}
            {order.payment && (
              <>
                <Separator />
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Payment Mode</span>
                    <span className="font-medium text-right">
                      {order.payment.provider === "cod"
                        ? "Cash on Delivery"
                        : order.payment.provider === "stripe"
                          ? "Card"
                          : order.payment.provider === "razorpay"
                            ? "Razorpay"
                            : order.payment.provider}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Payment Status</span>
                    <span
                      className={`font-medium ${
                        order.payment.status === "succeeded"
                          ? "text-green-600"
                          : order.payment.status === "cancelled" || order.payment.status === "failed"
                            ? "text-destructive"
                            : "text-amber-600"
                      }`}
                    >
                      {order.payment.status === "succeeded"
                        ? "Paid"
                        : order.payment.status === "cod_pending_collection" || order.payment.status === "pending"
                          ? "Cash on Delivery"
                          : order.payment.status === "refunded"
                            ? "Refunded"
                            : order.payment.status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                    </span>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* ── Right column: Status Timeline (P2-2: real timestamps) ─── */}
        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-sm">Order Progress</CardTitle>
          </CardHeader>
          <CardContent>
            {statusHistory.length === 0 ? (
              <OrderTimeline status={order.status} />
            ) : (
              <ol className="relative space-y-0">
                <div className="absolute left-[10px] top-3 bottom-3 w-px bg-border" />
                {[...statusHistory].reverse().map((entry, idx) => {
                  const isFirst = idx === 0;
                  const isBad =
                    entry.to_status === "cancelled" ||
                    entry.to_status === "failed";
                  const journeyStep = ORDER_JOURNEY[entry.to_status as keyof typeof ORDER_JOURNEY];
                  const label = journeyStep?.label
                    ?? entry.to_status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
                  const date = new Date(entry.created_at);
                  return (
                    <li key={entry.id} className="relative flex gap-3 pb-4 last:pb-0">
                      <div className={`relative z-10 mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ring-2 ${
                        isFirst
                          ? isBad ? "bg-destructive ring-destructive/30" : "bg-primary ring-primary/30"
                          : "bg-muted ring-border"
                      }`} />
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium leading-tight ${
                          isFirst && isBad ? "text-destructive" : isFirst ? "text-foreground" : "text-muted-foreground"
                        }`}>
                          {label}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                          {" at "}
                          {date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })}
                        </p>
                        {entry.reason && (
                          <p className="text-xs text-muted-foreground italic mt-0.5 truncate">{entry.reason}</p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </CardContent>
        </Card>

      </div>
    </div>
  );
}
