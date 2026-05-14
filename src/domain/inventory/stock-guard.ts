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
 * This is a fast guard for early validation (before building the full order).
 * The hard lock happens inside create_order_atomic to prevent race conditions.
 */
export async function checkStock(items: StockCheckItem[]): Promise<StockCheckResult[]> {
  const db = createServiceClient();
  const variantIds = items.map((i) => i.variantId);

  const { data, error } = await db
    .from("inventory")
    .select("variant_id, quantity, reserved")
    .in("variant_id", variantIds);

  if (error) throw error;

  return items.map((item) => {
    const inv = data?.find((r) => r.variant_id === item.variantId);
    if (!inv) throw new NotFoundError(`Inventory not found for variant ${item.variantId}`);
    const available = inv.quantity - inv.reserved;
    return { variantId: item.variantId, available, requested: item.quantity, sufficient: available >= item.quantity };
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
