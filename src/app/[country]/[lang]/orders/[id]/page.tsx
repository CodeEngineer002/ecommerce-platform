import { ArrowLeft, Download } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { OrderActions } from "@/components/orders/order-actions";
import { OrderTimeline } from "@/components/orders/order-timeline";
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

  // Fetch return requests
  const { data: returnsRaw } = await supabase
    .from("order_returns")
    .select("id, status, reason, request_type, created_at")
    .eq("order_id", id)
    .order("created_at", { ascending: false });

  type ReturnRow = {
    id: string;
    status: string;
    reason: string;
    request_type: string;
    created_at: string;
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
  const activeReturn = typedReturns.find((r) =>
    ["requested", "approved", "pickup_scheduled", "in_transit"].includes(r.status),
  );
  const hasActiveReturn = Boolean(activeReturn);

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

      {/* Tracking banner */}
      {typedFulfillment?.tracking_number && (
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
                  const returnJourney = ORDER_JOURNEY[r.status as keyof typeof ORDER_JOURNEY];
                  const pickupShipment = returnShipmentMap.get(r.id);
                  const replacementShipment = replacementShipmentMap.get(r.id);

                  return (
                    <div key={r.id} className="rounded-lg border p-4 space-y-3">
                      {/* Header: type badge + reason + status */}
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

                      {returnJourney?.hint && (
                        <p className="text-xs text-muted-foreground">{returnJourney.hint}</p>
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
                      className={`font-medium capitalize ${
                        order.payment.status === "succeeded"
                          ? "text-green-600"
                          : order.payment.status === "pending"
                            ? "text-amber-600"
                            : "text-destructive"
                      }`}
                    >
                      {order.payment.status === "succeeded" ? "Paid" : order.payment.status}
                    </span>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* ── Right column: Status Timeline ────────────────────────── */}
        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-sm">Order Progress</CardTitle>
          </CardHeader>
          <CardContent>
            <OrderTimeline status={order.status} />
          </CardContent>
        </Card>

      </div>
    </div>
  );
}
