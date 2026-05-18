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

  // Main orders query — uses exactly the proven working columns (no new columns here).
  // New columns (order_type, parent_order_id) are fetched separately below to avoid
  // PostgREST schema-cache issues after migration.
  const { data: ordersRaw, error: ordersError } = await supabase
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
        variant_id,
        quantity,
        unit_price,
        total,
        color,
        size
      ),
      returns:order_returns!order_id (
        id,
        status,
        created_at
      ),
      status_history:order_status_history (
        to_status,
        created_at
      )
    `)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (ordersError) {
    console.error("[orders page] supabase error message:", ordersError.message, "| code:", ordersError.code, "| details:", ordersError.details);
  }

  // All order IDs for this user (used in multiple sub-queries below)
  const orderIds = (ordersRaw ?? []).map((o) => o.id);

  // Supplementary query: fetch order_type and parent_order_id separately so the main
  // query is never broken by schema-cache timing after a migration.
  type OrderMeta = { id: string; order_type: string; parent_order_id: string | null };
  const orderMetaMap = new Map<string, OrderMeta>();

  if (orderIds.length > 0) {
    const { data: orderMetaRaw } = await supabase
      .from("orders")
      .select("id, order_type, parent_order_id")
      .in("id", orderIds);

    for (const m of (orderMetaRaw ?? []) as unknown as OrderMeta[]) {
      orderMetaMap.set(m.id, {
        id: m.id,
        order_type: m.order_type ?? "purchase",
        parent_order_id: m.parent_order_id ?? null,
      });
    }
  }

  // Fetch parent order numbers for replacement orders
  const parentOrderIds = [...orderMetaMap.values()]
    .filter((m) => m.parent_order_id)
    .map((m) => m.parent_order_id as string);

  const parentOrderNumberMap = new Map<string, string>();
  if (parentOrderIds.length > 0) {
    const { data: parentOrders } = await supabase
      .from("orders")
      .select("id, order_number")
      .in("id", parentOrderIds);
    for (const p of parentOrders ?? []) {
      parentOrderNumberMap.set(p.id, p.order_number);
    }
  }

  // Check which orders have tracking info
  const { data: fulfillments } = orderIds.length > 0
    ? await supabase
        .from("order_fulfillments")
        .select("order_id, tracking_number")
        .in("order_id", orderIds)
    : { data: [] };

  const trackedSet = new Set((fulfillments ?? []).map((f) => f.order_id));

  // Collect all unique variant_ids across all orders to fetch images in one query
  type RawItem = { id: string; product_name: string; variant_name: string | null; variant_id: string | null; quantity: number; unit_price: number; total: number; color: string | null; size: string | null };
  type ImgRow  = { url: string; variant_id?: string | null; variant?: { options?: Record<string, string> | null } | null };
  type VarRow  = { id: string; options: Record<string, string> | null; product: { images: ImgRow[] } | null };

  const allVariantIds = [...new Set(
    (ordersRaw ?? [])
      .flatMap((o) => (o.items as unknown as RawItem[]).map((i) => i.variant_id))
      .filter((v): v is string => Boolean(v))
  )];

  const imageMap   = new Map<string, string>();
  const variantMap = new Map<string, { color?: string; size?: string }>();

  if (allVariantIds.length > 0) {
    const { data: varRows } = await supabase
      .from("product_variants")
      .select("id, options, product:products(images:product_images(url, variant_id, variant:product_variants(options)))")
      .in("id", allVariantIds);

    for (const v of (varRows ?? []) as unknown as VarRow[]) {
      const color = v.options?.color?.toLowerCase();
      const imgs  = v.product?.images ?? [];
      const direct    = imgs.find((img) => img.variant_id === v.id);
      const sameColor = !direct && color
        ? imgs.find((img) => img.variant?.options?.color?.toLowerCase() === color)
        : null;
      const url = (direct ?? sameColor ?? imgs[0])?.url;
      if (url) imageMap.set(v.id, url);
      if (v.options?.color || v.options?.size) {
        variantMap.set(v.id, { color: v.options?.color, size: v.options?.size });
      }
    }
  }

  type HistoryRow = { to_status: string; created_at: string };

  const orders: OrderCardData[] = (ordersRaw ?? []).map((o) => {
    // Find when the order was marked delivered from status history
    const history = (o as unknown as { status_history?: HistoryRow[] }).status_history ?? [];
    const deliveredEntry = history
      .filter((h) => h.to_status === "delivered")
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];

    const meta          = orderMetaMap.get(o.id);
    const orderType     = meta?.order_type ?? "purchase";
    const parentOrderId = meta?.parent_order_id ?? null;
    return {
    ...(o as unknown as Omit<OrderCardData, "returns" | "hasTracking" | "items" | "delivered_at" | "order_type" | "parent_order_number">),
    order_type:           orderType,
    parent_order_number:  parentOrderId ? (parentOrderNumberMap.get(parentOrderId) ?? null) : null,
    returns:      (o.returns ?? []) as OrderCardData["returns"],
    hasTracking:  trackedSet.has(o.id),
    delivered_at: deliveredEntry?.created_at ?? null,
    items: (o.items as unknown as RawItem[]).map((item) => {
      const vInfo = item.variant_id ? variantMap.get(item.variant_id) : undefined;
      const variantLabel = item.variant_name
        ?? (vInfo ? [vInfo.color, vInfo.size].filter(Boolean).join(" / ") : null);
      return {
        id:           item.id,
        product_name: item.product_name,
        variant_name: variantLabel,
        quantity:     item.quantity,
        unit_price:   item.unit_price,
        total:        item.total,
        image_url:    item.variant_id ? (imageMap.get(item.variant_id) ?? null) : null,
      };
    }),
  };
  });

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
