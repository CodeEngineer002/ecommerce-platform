import { apiError, apiSuccess, withApiHandler } from "@/lib/api";
import { AuthError, NotFoundError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/orders/[id]/replacement-availability?item_ids=id1,id2,...
 *
 * Customer-facing endpoint.
 * Checks whether the variants for the given order items are in stock,
 * so the return form can warn the customer before they submit.
 *
 * Response shape:
 * {
 *   all_available: boolean,
 *   items: [
 *     { item_id, variant_id, product_name, variant_name, available_qty, is_available }
 *   ]
 * }
 */
export const GET = withApiHandler(
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    const client = await createClient();
    const { data: { user } } = await client.auth.getUser();
    if (!user) throw new AuthError("Not authenticated");

    const { id: orderId } = await context.params;
    const { searchParams } = new URL(request.url);
    const itemIdsParam = searchParams.get("item_ids");

    if (!itemIdsParam) {
      return apiError("item_ids query parameter is required", 400, "MISSING_PARAM");
    }

    const itemIds = itemIdsParam
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    if (itemIds.length === 0) {
      return apiError("No valid item IDs provided", 400, "MISSING_PARAM");
    }

    // Verify order belongs to the requesting user
    const { data: order, error: orderError } = await client
      .from("orders")
      .select("id, user_id")
      .eq("id", orderId)
      .eq("user_id", user.id)
      .single();

    if (orderError || !order) throw new NotFoundError("Order not found");

    // Fetch order items with variant_ids, restricted to the given ids
    const { data: orderItems, error: itemsError } = await client
      .from("order_items")
      .select("id, variant_id, product_name, variant_name")
      .eq("order_id", orderId)
      .in("id", itemIds);

    if (itemsError) throw new Error(itemsError.message);
    if (!orderItems || orderItems.length === 0) {
      return apiError("No matching order items found", 404, "NOT_FOUND");
    }

    // Get default warehouse
    const { data: warehouse } = await client
      .from("warehouses")
      .select("id")
      .eq("is_default", true)
      .eq("is_active", true)
      .limit(1)
      .single();

    // Check inventory for each variant
    const variantIds = orderItems
      .map((i) => i.variant_id)
      .filter((v): v is string => v !== null);

    let inventoryMap: Record<string, number> = {};

    if (warehouse && variantIds.length > 0) {
      const { data: levels } = await client
        .from("inventory_levels")
        .select("variant_id, quantity, reserved")
        .eq("warehouse_id", warehouse.id)
        .in("variant_id", variantIds);

      if (levels) {
        for (const lvl of levels) {
          if (lvl.variant_id) {
            inventoryMap[lvl.variant_id] = (lvl.quantity ?? 0) - (lvl.reserved ?? 0);
          }
        }
      }
    }

    const items = orderItems.map((item) => {
      const available = item.variant_id != null
        ? (inventoryMap[item.variant_id] ?? null)
        : null;
      return {
        item_id:      item.id,
        variant_id:   item.variant_id,
        product_name: item.product_name,
        variant_name: item.variant_name,
        available_qty: available,
        is_available:  available !== null && available > 0,
      };
    });

    const all_available = items.every((i) => i.is_available);

    return apiSuccess({ all_available, items });
  },
);
