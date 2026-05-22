import { redirect } from "next/navigation";

import { OrdersPageClient } from "@/components/orders/orders-page-client";
import type { OrderCardData } from "@/components/orders/order-card";
import { getOrderTab } from "@/domain/order/order-journey";
import type { OrderStatus } from "@/domain/order/order-state-machine";
import type { OrderTab } from "@/domain/order/order-journey";
import { isValidCountry, isValidLanguage, type CountryCode, type LanguageCode } from "@/lib/i18n/config";
import { REGION_CONFIGS } from "@/lib/i18n/region-config";
import { buildLocaleRoutes, type LocaleParams } from "@/lib/i18n/routing";
import { createClient } from "@/lib/supabase/server";

interface Props {
  params:       Promise<{ country: string; lang: string }>;
  searchParams: Promise<{ page?: string; tab?: string }>;
}

const PAGE_SIZE = 10;

// Statuses that belong to each tab — drives server-side filter
const ACTIVE_STATUSES    = ["draft", "pending", "pending_payment", "confirmed", "processing", "packed", "shipped", "out_for_delivery"] as const;
const RETURNS_STATUSES   = ["return_requested", "return_approved", "return_rejected", "return_in_transit", "returned", "partially_returned", "replacement_requested", "replacement_approved", "replacement_rejected", "replacement_shipped", "replacement_delivered"] as const;
const REFUND_STATUSES    = ["refund_requested", "refund_processing", "partially_refunded", "refunded"] as const;
const CANCELLED_STATUSES = ["cancelled", "failed"] as const;
const DELIVERED_STATUSES = ["delivered"] as const;

const VALID_TABS: OrderTab[] = ["all", "active", "delivered", "cancelled", "returns", "refunds"];

export default async function LocaleOrdersPage({ params, searchParams }: Props) {
  const [{ country, lang }, sp] = await Promise.all([params, searchParams]);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const localeParams: LocaleParams = isValidCountry(country) && isValidLanguage(lang)
    ? { country: country as CountryCode, lang: lang as LanguageCode }
    : { country: "in", lang: "en" };
  const routes = buildLocaleRoutes(localeParams);

  const countryKey = isValidCountry(country) ? (country as CountryCode) : "in";
  const { currencyCode, currencyLocale } = REGION_CONFIGS[countryKey];

  // Resolve pagination / tab from URL
  const activeTab: OrderTab = VALID_TABS.includes(sp.tab as OrderTab)
    ? (sp.tab as OrderTab)
    : "all";
  const page     = Math.max(1, parseInt(sp.page ?? "1", 10));
  const from     = (page - 1) * PAGE_SIZE;

  // ── Lightweight query for tab counts (all orders, minimal columns) ──────────
  // We fetch status + order_type for every order so tab badge counts are always
  // accurate regardless of which tab the user is on.
  const { data: summaries } = await supabase
    .from("orders")
    .select("id, status, order_type")
    .eq("user_id", user.id);

  const tabCounts: Record<OrderTab, number> = { all: 0, active: 0, delivered: 0, cancelled: 0, returns: 0, refunds: 0 };
  for (const row of (summaries ?? [])) {
    tabCounts.all++;
    if (row.order_type === "replacement") {
      // Replacement orders always appear under "active" (in-progress delivery)
      tabCounts.active++;
    } else {
      const tab = getOrderTab(row.status as OrderStatus);
      tabCounts[tab]++;
    }
  }

  // ── Main paginated query ────────────────────────────────────────────────────
  // Build query with tab filter first, then paginate.
  let ordersQuery = supabase
    .from("orders")
    .select(
      `id,
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
      )`,
      { count: "exact" },
    )
    .eq("user_id", user.id);

  // Apply tab-specific status filter
  switch (activeTab) {
    case "active":
      // Replacement orders go here regardless of their status
      ordersQuery = ordersQuery.or(
        `status.in.(${ACTIVE_STATUSES.join(",")}),order_type.eq.replacement`,
      );
      break;
    case "delivered":
      ordersQuery = ordersQuery.eq("status", "delivered").neq("order_type", "replacement");
      break;
    case "cancelled":
      ordersQuery = ordersQuery.in("status", [...CANCELLED_STATUSES]);
      break;
    case "returns":
      ordersQuery = ordersQuery.in("status", [...RETURNS_STATUSES]);
      break;
    case "refunds":
      ordersQuery = ordersQuery.in("status", [...REFUND_STATUSES]);
      break;
    // "all": no filter
  }

  const { data: ordersRaw, count: totalCount, error: ordersError } = await ordersQuery
    .order("created_at", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);

  if (ordersError) {
    console.error(
      "[orders page] supabase error:",
      ordersError.message,
      "| code:", ordersError.code,
    );
  }

  const totalPages = Math.ceil((totalCount ?? 0) / PAGE_SIZE);

  // All order IDs for this page — used in supplementary queries below
  const orderIds = (ordersRaw ?? []).map((o) => o.id);

  // ── Supplementary queries (scoped to current page's orderIds) ───────────────

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

  const { data: fulfillments } = orderIds.length > 0
    ? await supabase
        .from("order_fulfillments")
        .select("order_id, tracking_number")
        .in("order_id", orderIds)
    : { data: [] };

  const trackedSet = new Set((fulfillments ?? []).map((f) => f.order_id));

  type RawItem   = { id: string; product_name: string; variant_name: string | null; variant_id: string | null; quantity: number; unit_price: number; total: number; color: string | null; size: string | null };
  type ImgRow    = { url: string; variant_id?: string | null; variant?: { options?: Record<string, string> | null } | null };
  type VarRow    = { id: string; options: Record<string, string> | null; product: { images: ImgRow[] } | null };

  const allVariantIds = [...new Set(
    (ordersRaw ?? [])
      .flatMap((o) => (o.items as unknown as RawItem[]).map((i) => i.variant_id))
      .filter((v): v is string => Boolean(v)),
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
    const history = (o as unknown as { status_history?: HistoryRow[] }).status_history ?? [];
    const deliveredEntry = history
      .filter((h) => h.to_status === "delivered")
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];

    const meta          = orderMetaMap.get(o.id);
    const orderType     = meta?.order_type ?? "purchase";
    const parentOrderId = meta?.parent_order_id ?? null;

    return {
      ...(o as unknown as Omit<OrderCardData, "returns" | "hasTracking" | "items" | "delivered_at" | "order_type" | "parent_order_number">),
      order_type:          orderType,
      parent_order_number: parentOrderId ? (parentOrderNumberMap.get(parentOrderId) ?? null) : null,
      returns:             (o.returns ?? []) as OrderCardData["returns"],
      hasTracking:         trackedSet.has(o.id),
      delivered_at:        deliveredEntry?.created_at ?? null,
      items: (o.items as unknown as RawItem[]).map((item) => {
        const vInfo       = item.variant_id ? variantMap.get(item.variant_id) : undefined;
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
        activeTab={activeTab}
        page={page}
        totalPages={totalPages}
        tabCounts={tabCounts}
      />
    </div>
  );
}
