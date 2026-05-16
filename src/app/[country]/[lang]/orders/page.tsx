import { Package } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { StatusBadge } from "@/components/common/status-badge";
import { EmptyState } from "@/components/feedback/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { isValidCountry, isValidLanguage, type CountryCode, type LanguageCode } from "@/lib/i18n/config";
import { REGION_CONFIGS } from "@/lib/i18n/region-config";
import { buildLocaleRoutes, type LocaleParams } from "@/lib/i18n/routing";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatPrice } from "@/lib/utils";

interface Props {
  params: Promise<{ country: string; lang: string }>;
}

export default async function LocaleOrdersPage({ params }: Props) {
  const { country, lang } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const localeParams: LocaleParams = isValidCountry(country) && isValidLanguage(lang)
    ? { country: country as CountryCode, lang: lang as LanguageCode }
    : { country: "in", lang: "en" };
  const routes = buildLocaleRoutes(localeParams);

  const countryKey = isValidCountry(country) ? (country as CountryCode) : "in";
  const { currencyCode, currencyLocale } = REGION_CONFIGS[countryKey];
  const fmt = (amount: number) => formatPrice(amount, currencyCode, currencyLocale);

  const { data: ordersData } = await supabase
    .from("orders")
    .select("*, items:order_items(*), payments(*)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  const orders = ordersData ?? [];

  return (
    <div className="container py-8">
      <h1 className="mb-8 text-2xl font-bold">My Orders</h1>

      {orders.length === 0 ? (
        <EmptyState
          icon={Package}
          title="No orders yet"
          description="Once you place an order, it will appear here."
          action={{ label: "Start Shopping", href: routes.products }}
        />
      ) : (
        <div className="space-y-4">
          {orders.map((order) => (
            <Card key={order.id}>
              <CardHeader className="flex-row items-center justify-between pb-2">
                <div>
                  <CardTitle className="text-base">Order #{order.order_number}</CardTitle>
                  <p className="text-xs text-muted-foreground">{formatDate(order.created_at)}</p>
                </div>
                <StatusBadge status={order.status} />
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="divide-y">
                  {order.items.map((item) => (
                    <div key={item.id} className="flex justify-between py-2 text-sm">
                      <div>
                        <p className="font-medium">{item.product_name}</p>
                        {item.variant_name && (
                          <p className="text-xs text-muted-foreground">{item.variant_name}</p>
                        )}
                        <p className="text-xs text-muted-foreground">Qty: {item.quantity}</p>
                      </div>
                      <span>{fmt(item.total)}</span>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between border-t pt-2">
                  <span className="font-semibold">Total: {fmt(order.total)}</span>
                  <Button variant="outline" size="sm" asChild>
                    <Link href={routes.order(order.id)}>View Details</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
