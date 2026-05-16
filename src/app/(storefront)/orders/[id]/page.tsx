import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { OrderActions } from "@/components/orders/order-actions";
import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { getOrderById } from "@/features/orders/services/order.service";
import { isOrderCancellable } from "@/domain/order/order-state-machine";
import { ROUTES } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatPrice } from "@/lib/utils";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function OrderDetailPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(ROUTES.login);

  const order = await getOrderById(id);
  if (!order || order.user_id !== user.id) notFound();

  const shipping = order.shipping_address as Record<string, string>;

  // Fetch tracking info if shipped
  const { data: fulfillment } = await supabase
    .from("order_fulfillments")
    .select("*")
    .eq("order_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Fetch return requests
  const { data: returns } = await supabase
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

  const canCancel = isOrderCancellable(order.status as Parameters<typeof isOrderCancellable>[0]);
  const canReturn = ["delivered", "partially_returned"].includes(order.status);
  const typedReturns = (returns ?? []) as unknown as ReturnRow[];
  const typedFulfillment = fulfillment as unknown as FulfillmentRow | null;
  const hasActiveReturn = typedReturns.some((r) =>
    ["requested", "approved", "pickup_scheduled", "in_transit"].includes(r.status),
  );

  return (
    <div className="container py-8">
      <Button variant="ghost" size="sm" asChild className="mb-6 gap-2">
        <Link href={ROUTES.orders}>
          <ArrowLeft className="h-4 w-4" /> Back to Orders
        </Link>
      </Button>

      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Order #{order.order_number}</h1>
          <p className="text-sm text-muted-foreground">{formatDate(order.created_at)}</p>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={order.status} />
          <OrderActions
            orderId={order.id}
            canCancel={canCancel}
            canReturn={canReturn && !hasActiveReturn}
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
                  {typedFulfillment.carrier
                    ? `Shipped via ${typedFulfillment.carrier}`
                    : "Shipment tracking"}
                </p>
                <p className="text-muted-foreground">
                  Tracking:{" "}
                  <span className="font-mono">{typedFulfillment.tracking_number}</span>
                </p>
                {typedFulfillment.estimated_delivery && (
                  <p className="text-muted-foreground">
                    Estimated delivery:{" "}
                    {new Date(typedFulfillment.estimated_delivery).toLocaleDateString()}
                  </p>
                )}
              </div>
              {typedFulfillment.tracking_url && (
                <Button variant="outline" size="sm" asChild>
                  <a
                    href={typedFulfillment.tracking_url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
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
            <p className="font-medium">Return request in progress</p>
            <p className="text-muted-foreground">
              Your return request is being processed. We will contact you shortly.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
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
                        {formatPrice(item.unit_price)} × {item.quantity}
                      </p>
                    </div>
                    <span className="font-medium">{formatPrice(item.total)}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {/* Return history */}
          {typedReturns.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Return Requests</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {typedReturns.map((r) => (
                  <div key={r.id} className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium capitalize">{r.reason}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(r.created_at)}</p>
                    </div>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs capitalize">
                      {r.status.replace(/_/g, " ")}
                    </span>
                  </div>
                ))}
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
              <p>
                {shipping.city}, {shipping.state} – {shipping.postal_code}
              </p>
              <p>{shipping.country}</p>
            </CardContent>
          </Card>
        </div>

        {/* Summary */}
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Order Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span>{formatPrice(order.subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tax</span>
              <span>{formatPrice(order.tax)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Shipping</span>
              <span>{order.shipping === 0 ? "FREE" : formatPrice(order.shipping)}</span>
            </div>
            {order.discount > 0 && (
              <div className="flex justify-between text-green-600">
                <span>Discount</span>
                <span>-{formatPrice(order.discount)}</span>
              </div>
            )}
            <Separator />
            <div className="flex justify-between font-semibold">
              <span>Total</span>
              <span>{formatPrice(order.total)}</span>
            </div>
            {order.payment && (
              <>
                <Separator />
                <p className="text-xs capitalize text-muted-foreground">
                  Payment: {order.payment.provider} • {order.payment.status}
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
