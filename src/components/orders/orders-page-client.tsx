"use client";

import { usePathname, useRouter } from "next/navigation";
import { Package } from "lucide-react";

import { EmptyState } from "@/components/feedback/empty-state";
import { Pagination } from "@/components/common/pagination";
import { OrderCard, type OrderCardData } from "@/components/orders/order-card";
import { TAB_LABELS, type OrderTab } from "@/domain/order/order-journey";
import { formatPrice } from "@/lib/utils";

interface Props {
  orders:         OrderCardData[];
  currencyCode:   string;
  currencyLocale: string;
  /** Base path e.g. "/us/en/orders" — id appended client-side */
  ordersBasePath: string;
  productsHref:   string;
  /** Current active tab (comes from server via URL param) */
  activeTab:      OrderTab;
  /** Current page number (1-indexed) */
  page:           number;
  /** Total pages for the current tab */
  totalPages:     number;
  /** Per-tab order counts (always the full total, not just current page) */
  tabCounts:      Record<OrderTab, number>;
}

const TABS: OrderTab[] = ["all", "active", "delivered", "cancelled", "returns", "refunds"];

export function OrdersPageClient({
  orders,
  currencyCode,
  currencyLocale,
  ordersBasePath,
  productsHref,
  activeTab,
  page,
  totalPages,
  tabCounts,
}: Props) {
  const router   = useRouter();
  const pathname = usePathname();

  const fmt        = (n: number) => formatPrice(n, currencyCode, currencyLocale);
  const orderHref  = (id: string) => `${ordersBasePath}/${id}`;
  const returnHref = (id: string) => `${ordersBasePath}/${id}/return`;

  function goToTab(tab: OrderTab) {
    const params = new URLSearchParams();
    params.set("tab", tab);
    params.set("page", "1");
    router.push(`${pathname}?${params.toString()}`);
  }

  function goToPage(p: number) {
    const params = new URLSearchParams();
    params.set("tab", activeTab);
    params.set("page", String(p));
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div>
      {/* Tab bar */}
      <div className="mb-6 overflow-x-auto">
        <div className="flex gap-1 border-b min-w-max">
          {TABS.filter((t) => t === "all" || tabCounts[t] > 0).map((tab) => (
            <button
              key={tab}
              onClick={() => goToTab(tab)}
              className={`relative px-4 py-2.5 text-sm font-medium transition-colors whitespace-nowrap ${
                activeTab === tab
                  ? "text-primary border-b-2 border-primary -mb-px"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {TAB_LABELS[tab]}
              {tabCounts[tab] > 0 && (
                <span
                  className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                    activeTab === tab
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {tabCounts[tab]}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Order list */}
      {orders.length === 0 ? (
        <EmptyState
          icon={Package}
          title={activeTab === "all" ? "No orders yet" : `No ${TAB_LABELS[activeTab].toLowerCase()}`}
          description={
            activeTab === "all"
              ? "Once you place an order, it will appear here."
              : "You have no orders in this category."
          }
          action={activeTab === "all" ? { label: "Start Shopping", href: productsHref } : undefined}
        />
      ) : (
        <div className="space-y-4">
          {orders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              orderHref={orderHref(order.id)}
              returnHref={returnHref(order.id)}
              fmt={fmt}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-8 flex justify-center">
          <Pagination
            page={page}
            totalPages={totalPages}
            onPageChange={goToPage}
          />
        </div>
      )}
    </div>
  );
}
