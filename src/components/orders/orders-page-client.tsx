"use client";

import { useState } from "react";
import { Package } from "lucide-react";

import { EmptyState } from "@/components/feedback/empty-state";
import { OrderCard, filterOrdersByTab, type OrderCardData } from "@/components/orders/order-card";
import { TAB_LABELS, type OrderTab } from "@/domain/order/order-journey";
import { formatPrice } from "@/lib/utils";

interface Props {
  orders:        OrderCardData[];
  currencyCode:  string;
  currencyLocale: string;
  /** Base path e.g. "/us/en/orders" — id appended client-side */
  ordersBasePath: string;
  productsHref:  string;
}

const TABS: OrderTab[] = ["all", "active", "delivered", "cancelled", "returns", "refunds"];

export function OrdersPageClient({ orders, currencyCode, currencyLocale, ordersBasePath, productsHref }: Props) {
  const fmt        = (n: number) => formatPrice(n, currencyCode, currencyLocale);
  const orderHref  = (id: string) => `${ordersBasePath}/${id}`;
  const returnHref = (id: string) => `${ordersBasePath}/${id}/return`;
  const [activeTab, setActiveTab] = useState<OrderTab>("all");

  // Compute per-tab counts
  const counts = TABS.reduce<Record<OrderTab, number>>(
    (acc, tab) => {
      acc[tab] = filterOrdersByTab(orders, tab).length;
      return acc;
    },
    { all: 0, active: 0, delivered: 0, cancelled: 0, returns: 0, refunds: 0 },
  );

  const visible = filterOrdersByTab(orders, activeTab);

  return (
    <div>
      {/* Tab bar */}
      <div className="mb-6 overflow-x-auto">
        <div className="flex gap-1 border-b min-w-max">
          {TABS.filter((t) => t === "all" || counts[t] > 0).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`relative px-4 py-2.5 text-sm font-medium transition-colors whitespace-nowrap ${
                activeTab === tab
                  ? "text-primary border-b-2 border-primary -mb-px"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {TAB_LABELS[tab]}
              {counts[tab] > 0 && (
                <span
                  className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                    activeTab === tab
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {counts[tab]}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Order list */}
      {visible.length === 0 ? (
        <EmptyState
          icon={Package}
          title={activeTab === "all" ? "No orders yet" : `No ${TAB_LABELS[activeTab].toLowerCase()}`}
          description={
            activeTab === "all"
              ? "Once you place an order, it will appear here."
              : `You have no orders in this category.`
          }
          action={activeTab === "all" ? { label: "Start Shopping", href: productsHref } : undefined}
        />
      ) : (
        <div className="space-y-4">
          {visible.map((order) => (
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
    </div>
  );
}
