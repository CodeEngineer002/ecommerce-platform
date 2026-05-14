import "server-only";

import { createServiceClient } from "@/lib/supabase/server";

export type MovementSourceType = "order" | "return" | "adjustment" | "purchase" | "transfer" | "admin";
export type MovementType = "purchase" | "sale" | "return" | "adjustment" | "transfer";

export interface InventoryMovementInput {
  variantId: string;
  type: MovementType;
  /** Positive = stock in, negative = stock out */
  quantity: number;
  previousQuantity?: number;
  newQuantity?: number;
  sourceType?: MovementSourceType;
  sourceId?: string;
  note?: string;
  actorId?: string;
}

/**
 * Records a single inventory movement.
 * Prefer the DB-level record_inventory_movement function for movements that happen
 * inside transactions (e.g. order creation). Use this service for standalone
 * movements (admin adjustments, manual corrections).
 */
export async function recordInventoryMovement(input: InventoryMovementInput): Promise<void> {
  const db = createServiceClient();

  await db.from("inventory_movements").insert({
    variant_id: input.variantId,
    type: input.type,
    quantity: input.quantity,
    previous_quantity: input.previousQuantity ?? null,
    new_quantity: input.newQuantity ?? null,
    source_type: input.sourceType ?? null,
    source_id: input.sourceId ?? null,
    reference_id: input.sourceId ?? null,
    note: input.note ?? null,
    created_by: input.actorId ?? null,
  });
}

/**
 * Adjusts inventory for a variant with a full audit trail.
 * Used for admin stock corrections.
 *
 * Safety: newQty is clamped to 0 minimum (stock can never go negative).
 * For reductions, the delta is clamped so reserved stock is preserved.
 */
export async function adjustInventory(
  variantId: string,
  delta: number,
  reason: string,
  actorId?: string,
): Promise<void> {
  const db = createServiceClient();

  const { data: inv } = await db
    .from("inventory")
    .select("quantity, reserved")
    .eq("variant_id", variantId)
    .single();

  if (!inv) return;

  const previousQty = inv.quantity;
  // When reducing stock, ensure we never go below the reserved amount
  // (reserved stock is committed to pending orders and cannot be removed)
  const minQty = delta < 0 ? inv.reserved : 0;
  const newQty = Math.max(minQty, inv.quantity + delta);
  const effectiveDelta = newQty - previousQty;

  await db.from("inventory").update({ quantity: newQty }).eq("variant_id", variantId);

  await recordInventoryMovement({
    variantId,
    type: "adjustment",
    quantity: effectiveDelta,
    previousQuantity: previousQty,
    newQuantity: newQty,
    sourceType: "admin",
    note: reason,
    actorId,
  });
}

/**
 * Retrieves the movement ledger for a variant, newest first.
 */
export async function getInventoryMovements(
  variantId: string,
  limit = 50,
): Promise<
  Array<{
    id: string;
    type: string;
    quantity: number;
    previousQuantity: number | null;
    newQuantity: number | null;
    sourceType: string | null;
    note: string | null;
    createdAt: string;
  }>
> {
  const db = createServiceClient();

  const { data } = await db
    .from("inventory_movements")
    .select(
      "id, type, quantity, previous_quantity, new_quantity, source_type, note, created_at",
    )
    .eq("variant_id", variantId)
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data ?? []).map((row) => ({
    id: row.id,
    type: row.type,
    quantity: row.quantity,
    previousQuantity: row.previous_quantity ?? null,
    newQuantity: row.new_quantity ?? null,
    sourceType: row.source_type ?? null,
    note: row.note ?? null,
    createdAt: row.created_at,
  }));
}
