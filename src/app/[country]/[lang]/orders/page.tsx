import { redirect } from "next/navigation";

import { OrdersPageClient } from "@/components/orders/orders-page-client";
import type { OrderCardData } from "@/components/orders/order-card";
import { isValidCountry, isValidLanguage, type CountryCode, type LanguageCode } from "@/lib/i18n/config";
import { REGION_CONFIGS } from "@/lib/i18n/region-config";
import { buildLocaleRoutes, type LocaleParams } from "@/lib/i18n/routing";
import { createClient } from "@/lib/supabase/server";

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

  // Fetch orders + items + return requests in one go
  const { data: ordersRaw } = await supabase
    .from("orders")
    .select(`
      id,
      order_number,
      status,
      created_at,
      total,
      subtotal,
      shipping,
      tax,
      discount,
      items:order_items (
        id,
        product_name,
        variant_name,
        quantity,
        total
      ),
      returns:order_returns (
        id,
        status,
        created_at
      )
    `)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  // Check which orders have tracking info
  const orderIds = (ordersRaw ?? []).map((o) => o.id);
  const { data: fulfillments } = orderIds.length > 0
    ? await supabase
        .from("order_fulfillments")
        .select("order_id, tracking_number")
        .in("order_id", orderIds)
    : { data: [] };

  const trackedSet = new Set((fulfillments ?? []).map((f) => f.order_id));

  const orders: OrderCardData[] = (ordersRaw ?? []).map((o) => ({
    ...(o as unknown as Omit<OrderCardData, "returns" | "hasTracking">),
    returns:     (o.returns ?? []) as OrderCardData["returns"],
    hasTracking: trackedSet.has(o.id),
  }));

  return (
    <div className="container py-8">
      <h1 className="mb-6 text-2xl font-bold">My Orders</h1>
      <OrdersPageClient
        orders={orders}
        currencyCode={currencyCode}
        currencyLocale={currencyLocale}
        ordersBasePath={`/${country}/${lang}/orders`}
        productsHref={routes.products}
      />
    </div>
  );
}
