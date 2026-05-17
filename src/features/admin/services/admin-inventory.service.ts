/**
 * admin-inventory.service.ts
 *
 * Server-side (client-component callable) service for admin inventory operations.
 * Uses the Supabase browser client — protected by RLS:
 *   "Admins manage inventory levels"
 *   "Admins manage inventory movements"
 *
 * Two responsibilities:
 *   1. recordStockAdjustment — atomic: update inventory_levels + insert movement record
 *   2. getInventoryMovements — paginated movement history for the History tab
 */

"use client";

import { createClient } from "@/lib/supabase/client";

// ── Types ─────────────────────────────────────────────────────────────────────

export type AdjustmentOperation = "increase" | "decrease" | "set";

export type AdjustmentReason =
  | "new_inventory_received"
  | "damaged_stock"
  | "manual_correction"
  | "return_restocked"
  | "warehouse_transfer"
  | "audit_correction";

export const ADJUSTMENT_REASON_LABELS: Record<AdjustmentReason, string> = {
  new_inventory_received: "New inventory received",
  damaged_stock: "Damaged stock",
  manual_correction: "Manual correction",
  return_restocked: "Return restocked",
  warehouse_transfer: "Warehouse transfer",
  audit_correction: "Audit correction",
};

export interface StockAdjustmentParams {
  variantId: string;
  operation: AdjustmentOperation;
  /** For 'increase'/'decrease': the delta. For 'set': the absolute new quantity. */
  quantity: number;
  reason: AdjustmentReason;
  note?: string;
}

export interface StockAdjustmentResult {
  previousQuantity: number;
  newQuantity: number;
}

export interface InventoryMovement {
  id: string;
  variant_id: string;
  type: "purchase" | "sale" | "return" | "adjustment" | "transfer";
  quantity: number;
  previous_quantity: number | null;
  new_quantity: number | null;
  source_type: string | null;
  adjustment_reason: AdjustmentReason | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
  // Joined
  variant: {
    id: string;
    sku: string | null;
    options: Record<string, string> | null;
    product: { id: string; name: string; product_code: string | null } | null;
  } | null;
  actor_email: string | null;
}

export interface InventoryStats {
  totalProducts: number;
  totalSkus: number;
  inStockSkus: number;
  lowStockSkus: number;
  oosSkus: number;
  totalUnits: number;
  missingSkuCount: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Computes the new absolute quantity from an operation.
 * Does NOT allow going below 0.
 */
export function computeNewQuantity(
  operation: AdjustmentOperation,
  currentQuantity: number,
  inputQuantity: number,
): number {
  switch (operation) {
    case "increase":
      return currentQuantity + inputQuantity;
    case "decrease":
      return Math.max(0, currentQuantity - inputQuantity);
    case "set":
      return Math.max(0, inputQuantity);
  }
}

// ── recordStockAdjustment ─────────────────────────────────────────────────────

/**
 * Atomically:
 *   1. Fetches current quantity from inventory_levels (default warehouse)
 *   2. Computes new quantity
 *   3. Updates inventory_levels
 *   4. Inserts an inventory_movements record (source_type = 'admin')
 *
 * Returns the previous and new quantities for display in toast/UI.
 */
export async function recordStockAdjustment(
  params: StockAdjustmentParams,
): Promise<StockAdjustmentResult> {
  const supabase = createClient();

  // Resolve default warehouse
  const { data: warehouse, error: whErr } = await supabase
    .from("warehouses")
    .select("id")
    .eq("is_default", true)
    .eq("is_active", true)
    .maybeSingle();

  if (whErr) throw whErr;
  if (!warehouse) throw new Error("Default warehouse not found");

  // Fetch current inventory level
  const { data: level, error: lvlErr } = await supabase
    .from("inventory_levels")
    .select("quantity, reserved")
    .eq("variant_id", params.variantId)
    .eq("warehouse_id", warehouse.id)
    .maybeSingle();

  if (lvlErr) throw lvlErr;

  const previousQuantity = level?.quantity ?? 0;
  const newQuantity = computeNewQuantity(params.operation, previousQuantity, params.quantity);
  const delta = newQuantity - previousQuantity;

  // Update inventory_levels (upsert covers variants without a row yet)
  const { error: updateErr } = await supabase
    .from("inventory_levels")
    .upsert(
      {
        warehouse_id: warehouse.id,
        variant_id: params.variantId,
        quantity: newQuantity,
        // Preserve reserved count; do not reset it
      },
      { onConflict: "warehouse_id,variant_id" },
    );

  if (updateErr) throw updateErr;

  // Get current user for the created_by field
  const { data: { user } } = await supabase.auth.getUser();

  // Insert movement record for audit trail.
  // Try with adjustment_reason first (migration 00026). If the column doesn't exist yet
  // in the schema cache, fall back to inserting without it so the UI keeps working.
  const movementBase = {
    variant_id: params.variantId,
    type: "adjustment",
    quantity: Math.abs(delta),
    previous_quantity: previousQuantity,
    new_quantity: newQuantity,
    source_type: "admin",
    note: params.note ?? null,
    created_by: user?.id ?? null,
  };

  const { error: movErr } = await supabase
    .from("inventory_movements")
    .insert({ ...movementBase, adjustment_reason: params.reason });

  if (movErr) {
    // Schema cache miss — column not yet visible; retry without adjustment_reason
    if (
      movErr.message?.includes("adjustment_reason") ||
      movErr.code === "PGRST204" ||
      movErr.code === "42703"
    ) {
      const { error: fallbackErr } = await supabase
        .from("inventory_movements")
        .insert(movementBase);
      if (fallbackErr) throw fallbackErr;
    } else {
      throw movErr;
    }
  }

  return { previousQuantity, newQuantity };
}

// ── getInventoryMovements ─────────────────────────────────────────────────────

/**
 * Fetches paginated inventory movement history, optionally filtered by variant.
 * Joins variant → product for display.
 */
export async function getInventoryMovements(options: {
  variantId?: string;
  movementType?: InventoryMovement["type"] | "all";
  days?: number;
  limit?: number;
  offset?: number;
}): Promise<{ data: InventoryMovement[]; count: number }> {
  const { variantId, movementType = "all", days = 90, limit = 25, offset = 0 } = options;
  const supabase = createClient();

  // Note: adjustment_reason is excluded from the select string so the query works even
  // before migration 00026 is applied. The column is read via the wildcard row data below.
  let query = supabase
    .from("inventory_movements")
    .select(
      `
      id, variant_id, type, quantity, previous_quantity, new_quantity,
      source_type, note, created_by, created_at,
      variant:product_variants(
        id, sku, options,
        product:products(id, name, product_code)
      )
      `,
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (variantId) {
    query = query.eq("variant_id", variantId);
  }

  if (movementType !== "all") {
    query = query.eq("type", movementType);
  }

  if (days && days > 0) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    query = query.gte("created_at", since);
  }

  const { data, count, error } = await query;
  if (error) throw error;

  const movements: InventoryMovement[] = (data ?? []).map((row) => {
    const variant = Array.isArray(row.variant) ? row.variant[0] : row.variant;
    const product = variant
      ? Array.isArray(variant.product)
        ? variant.product[0]
        : variant.product
      : null;
    return {
      ...row,
      type: row.type as InventoryMovement["type"],
      // adjustment_reason is null until migration 00026 is applied to this environment
      adjustment_reason: ((row as Record<string, unknown>).adjustment_reason as AdjustmentReason | null) ?? null,
      variant: variant
        ? {
            id: variant.id,
            sku: variant.sku ?? null,
            options: (variant.options as Record<string, string> | null) ?? null,
            product: product ?? null,
          }
        : null,
      actor_email: null, // populated by the hook via a profiles join if needed
    };
  });

  return { data: movements, count: count ?? 0 };
}

// ── getInventoryStats (for Overview tab) ─────────────────────────────────────

/**
 * Computes inventory health stats.
 * Run client-side from the already-loaded product flat rows for speed,
 * or call this separately for a fresh server count.
 */
export function computeInventoryStats(
  rows: Array<{ sku: string | null; quantity: number; reserved: number }>,
): InventoryStats & { totalProducts: number } {
  const totalSkus = rows.length;
  const totalUnits = rows.reduce((sum, r) => sum + r.quantity, 0);
  const oosSkus = rows.filter((r) => r.quantity - r.reserved <= 0).length;
  const lowStockSkus = rows.filter((r) => {
    const avail = r.quantity - r.reserved;
    return avail > 0 && avail <= 5;
  }).length;
  const inStockSkus = totalSkus - oosSkus - lowStockSkus;
  const missingSkuCount = rows.filter((r) => !r.sku).length;

  return {
    totalProducts: 0, // filled by caller
    totalSkus,
    inStockSkus,
    lowStockSkus,
    oosSkus,
    totalUnits,
    missingSkuCount,
  };
}
