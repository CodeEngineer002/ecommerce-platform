import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { isValidCountry, isValidLanguage, type CountryCode, type LanguageCode } from "@/lib/i18n/config";
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

  const shipping = order.shipping_address as Record<string, string>;

  return (
    <div className="container py-8">
      <Button variant="ghost" size="sm" asChild className="mb-6 gap-2">
        <Link href={routes.orders}>
          <ArrowLeft className="h-4 w-4" /> Back to Orders
        </Link>
      </Button>

      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Order #{order.order_number}</h1>
          <p className="text-sm text-muted-foreground">
            {formatDate(order.created_at)} at{" "}
            {new Date(order.created_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })}
          </p>
        </div>
        <StatusBadge status={order.status} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
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

          <Card>
            <CardHeader>
              <CardTitle>Shipping Address</CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-1">
              <p className="font-medium">{shipping.full_name}</p>
              {shipping.phone && <p>{shipping.phone}</p>}
              <p>{shipping.address_line1}</p>
              {shipping.address_line2 && <p>{shipping.address_line2}</p>}
              <p>{shipping.city}, {shipping.state} – {shipping.postal_code}</p>
              <p>{shipping.country}</p>
            </CardContent>
          </Card>
        </div>

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
                <div className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Payment Mode</span>
                    <span className="font-medium">
                      {order.payment.provider === "cod"
                        ? "Cash on Delivery"
                        : order.payment.provider === "stripe"
                          ? "Credit / Debit Card"
                          : order.payment.provider === "razorpay"
                            ? "Razorpay (UPI / Cards)"
                            : order.payment.provider}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Payment Status</span>
                    <span className={`capitalize font-medium ${
                      order.payment.status === "succeeded" ? "text-green-600" :
                      order.payment.status === "pending" ? "text-amber-600" : "text-destructive"
                    }`}>
                      {order.payment.status === "succeeded" ? "Paid" : order.payment.status}
                    </span>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
