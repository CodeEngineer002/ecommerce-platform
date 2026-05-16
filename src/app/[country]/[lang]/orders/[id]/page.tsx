import { ArrowLeft, Download } from "lucide-react";
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

  // Fetch tracking info
  const { data: fulfillmentRaw } = await supabase
    .from("order_fulfillments")
    .select("carrier, tracking_number, tracking_url, estimated_delivery")
    .eq("order_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Fetch return requests
  const { data: returnsRaw } = await supabase
    .from("order_returns")
    .select("id, status, reason, created_at")
    .eq("order_id", id)
    .order("created_at", { ascending: false });

  type ReturnRow = { id: string; status: string; reason: string; created_at: string };
  type FulfillmentRow = {
    carrier: string | null;
    tracking_number: string | null;
    tracking_url: string | null;
    estimated_delivery: string | null;
  };

  const typedReturns     = (returnsRaw ?? []) as unknown as ReturnRow[];
  const typedFulfillment = fulfillmentRaw as unknown as FulfillmentRow | null;

  const canCancel = isOrderCancellable(order.status as Parameters<typeof isOrderCancellable>[0]);
  const canReturn = ["delivered", "partially_returned"].includes(order.status);
  const hasActiveReturn = typedReturns.some((r) =>
    ["requested", "approved", "pickup_scheduled", "in_transit"].includes(r.status),
  );

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

      {/* Active return notice */}
      {hasActiveReturn && (
        <Card className="mb-6 border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30">
          <CardContent className="py-4 text-sm">
            <p className="font-medium">Return / Replacement in progress</p>
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
                {order.items.map((item) => (
                  <li key={item.id} className="flex justify-between py-3 text-sm">
                    <div>
                      <p className="font-medium">{item.product_name}</p>
                      {item.variant_name && (
                        <p className="text-xs text-muted-foreground">{item.variant_name}</p>
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

          {/* Return requests detail */}
          {typedReturns.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Return / Replacement Requests</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                {typedReturns.map((r) => {
                  const returnJourney = ORDER_JOURNEY[r.status as keyof typeof ORDER_JOURNEY];
                  return (
                    <div key={r.id} className="rounded-lg border p-3 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium capitalize">{r.reason}</p>
                        <StatusBadge status={r.status} />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Submitted on {formatDate(r.created_at)}
                      </p>
                      {returnJourney?.hint && (
                        <p className="text-xs text-muted-foreground">{returnJourney.hint}</p>
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
