import { type NextRequest } from "next/server";

import { apiSuccess, withApiHandler } from "@/lib/api";
import { PERMISSIONS } from "@/lib/admin/permissions";
import { requireAdminPermission } from "@/lib/admin/with-admin-permission";

// GET /api/admin/returns?status=requested  — list all return/replacement requests
export const GET = withApiHandler(
  async (request: NextRequest) => {
    const { db } = await requireAdminPermission(PERMISSIONS.ORDERS_READ);

    const statusFilter = request.nextUrl.searchParams.get("status");

    // Step 1: fetch return requests + parent order number
    let returnsQuery = db
      .from("order_returns")
      .select(
        // Explicit FK hint: order_returns has two FK paths to orders,
        // use order_returns_order_id_fkey to avoid PGRST201 ambiguity error
        `id,
        order_id,
        request_type,
        reason,
        status,
        created_at,
        reviewed_at,
        review_note,
        order:orders!order_returns_order_id_fkey(order_number)`,
      )
      .order("created_at", { ascending: false });

    if (statusFilter && statusFilter !== "all") {
      if (statusFilter === "closed") {
        returnsQuery = returnsQuery.in("status", [
          "refunded",
          "replaced",
          "closed",
          "rejected_after_inspection",
          "accepted",
        ]);
      } else {
        returnsQuery = returnsQuery.eq("status", statusFilter);
      }
    }

    const { data: returns, error: returnsError } = await returnsQuery;
    if (returnsError) throw new Error(`Failed to fetch return requests: ${returnsError.message}`);
    if (!returns?.length) return apiSuccess([]);

    // Step 2: fetch return items with product names in a separate query
    // (avoids PostgREST nested-join ambiguity on order_return_items → order_items)
    const returnIds = returns.map((r) => r.id);
    const { data: returnItems, error: itemsError } = await db
      .from("order_return_items")
      .select(
        `id,
        return_id,
        order_item_id,
        quantity,
        reason,
        condition`,
      )
      .in("return_id", returnIds);

    if (itemsError) throw new Error(`Failed to fetch return items: ${itemsError.message}`);

    // Step 3: enrich items with product names from order_items
    const orderItemIds = [...new Set((returnItems ?? []).map((i) => i.order_item_id))];
    let productMap: Record<string, { product_name: string; variant_name: string | null }> = {};

    if (orderItemIds.length > 0) {
      const { data: orderItems } = await db
        .from("order_items")
        .select("id, product_name, variant_name")
        .in("id", orderItemIds);

      productMap = Object.fromEntries(
        (orderItems ?? []).map((oi) => [oi.id, { product_name: oi.product_name, variant_name: oi.variant_name }]),
      );
    }

    // Step 4: merge everything together
    const itemsByReturn: Record<string, typeof returnItems> = {};
    for (const item of returnItems ?? []) {
      if (!itemsByReturn[item.return_id]) itemsByReturn[item.return_id] = [];
      itemsByReturn[item.return_id]!.push(item);
    }

    const result = returns.map((ret) => ({
      ...ret,
      items: (itemsByReturn[ret.id] ?? []).map((item) => ({
        id:            item.id,
        order_item_id: item.order_item_id,
        quantity:      item.quantity,
        reason:        item.reason,
        condition:     item.condition,
        order_item:    productMap[item.order_item_id] ?? null,
      })),
    }));

    return apiSuccess(result);
  },
);
