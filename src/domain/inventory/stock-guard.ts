import "server-only";

import { InventoryError, NotFoundError } from "@/lib/errors";
import { createServiceClient } from "@/lib/supabase/server";

export interface StockCheckItem {
  variantId: string;
  quantity: number;
}

export interface StockCheckResult {
  variantId: string;
  available: number;
  requested: number;
  sufficient: boolean;
}

/**
 * Pre-flight stock check — reads current availability without locking rows.
 * Aggregates across all active warehouses for each variant.
 * The hard lock happens inside create_order_atomic to prevent race conditions.
 */
export async function checkStock(items: StockCheckItem[]): Promise<StockCheckResult[]> {
  const db = createServiceClient();
  const variantIds = items.map((i) => i.variantId);

  const { data, error } = await db
    .from("inventory_levels")
    .select("variant_id, quantity, reserved, warehouse:warehouses!inner(is_active)")
    .in("variant_id", variantIds);

  if (error) throw error;

  // Aggregate available stock across all active warehouses per variant
  const available = new Map<string, number>();
  for (const row of data ?? []) {
    const wh = Array.isArray(row.warehouse) ? row.warehouse[0] : row.warehouse;
    if (!wh?.is_active) continue;
    const current = available.get(row.variant_id) ?? 0;
    available.set(row.variant_id, current + (row.quantity - row.reserved));
  }

  return items.map((item) => {
    const qty = available.get(item.variantId);
    if (qty === undefined) {
      throw new NotFoundError(`Inventory not found for variant ${item.variantId}`);
    }
    return {
      variantId: item.variantId,
      available: qty,
      requested: item.quantity,
      sufficient: qty >= item.quantity,
    };
  });
}

export async function assertSufficientStock(items: StockCheckItem[]): Promise<void> {
  const results = await checkStock(items);
  const first = results.find((r) => !r.sufficient);
  if (first) {
    throw new InventoryError(
      `Insufficient stock: ${first.available} available, ${first.requested} requested`,
    );
  }
}
