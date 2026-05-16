import { ArrowLeft, ExternalLink } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AdminTrackingForm } from "@/components/admin/orders/tracking-form";
import type { FulfillmentData } from "@/components/admin/orders/tracking-form";
import { StatusBadge } from "@/components/common/status-badge";
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

  // Fetch latest fulfillment
  const { data: fulfillmentRaw } = await db
    .from("order_fulfillments")
    .select("id, carrier, tracking_number, tracking_url, estimated_delivery, status")
    .eq("order_id", orderId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  type FulfillmentRow = FulfillmentData;
  const fulfillment = (fulfillmentRaw as unknown as FulfillmentRow | null);

  const shipping = order.shipping_address as Record<string, string> | null;

  // Currency — simple fallback
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

              <AdminTrackingForm orderId={orderId} fulfillment={fulfillment} />
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
