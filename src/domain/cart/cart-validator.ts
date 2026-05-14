import "server-only";

import { CART_MAX_QUANTITY } from "@/lib/constants";
import { createServiceClient } from "@/lib/supabase/server";

import type { CartPricingError, CartPricingItem, CartPricingWarning } from "@/domain/pricing/types";

export interface CartValidationInput {
  variantId: string;
  quantity: number;
  clientUnitPrice: number;
}

export interface CartValidationResult {
  items: CartPricingItem[];
  warnings: CartPricingWarning[];
  errors: CartPricingError[];
}

const PRICE_CHANGE_TOLERANCE = 0.01; // ignore sub-1-paisa floating point differences

/**
 * Server-side cart validation. Fetches authoritative prices and stock levels,
 * detects price changes and stock issues, and returns a structured result.
 *
 * This runs BEFORE the atomic order creation — it's a user-facing check, not
 * a hard inventory lock. The actual lock happens inside create_order_atomic.
 */
export async function validateCart(
  items: CartValidationInput[],
): Promise<CartValidationResult> {
  if (items.length === 0) {
    return { items: [], warnings: [], errors: [] };
  }

  const db = createServiceClient();
  const variantIds = items.map((i) => i.variantId);

  type VariantRow = {
    id: string;
    price: number | null;
    is_active: boolean;
    product: { name: string; base_price: number } | null;
    inventory: { quantity: number; reserved: number } | null;
  };

  const { data: variants } = await db
    .from("product_variants")
    .select(
      "id, price, is_active, product:products(name, base_price), inventory(quantity, reserved)",
    )
    .in("id", variantIds);

  const rows = (variants ?? []) as VariantRow[];
  const validItems: CartPricingItem[] = [];
  const warnings: CartPricingWarning[] = [];
  const errors: CartPricingError[] = [];

  for (const item of items) {
    const row = rows.find((r) => r.id === item.variantId);

    // Variant not found or inactive
    if (!row || !row.is_active) {
      const productName =
        row?.product && !Array.isArray(row.product) ? row.product.name : "Unknown product";
      errors.push({ type: "VARIANT_UNAVAILABLE", variantId: item.variantId, productName });
      continue;
    }

    const product = Array.isArray(row.product) ? row.product[0] : row.product;
    const inventory = Array.isArray(row.inventory) ? row.inventory[0] : row.inventory;

    const serverPrice = row.price ?? product?.base_price ?? 0;
    const available = inventory ? inventory.quantity - inventory.reserved : 0;
    const productName = product?.name ?? "Unknown product";

    // Quantity exceeds per-item max
    if (item.quantity > CART_MAX_QUANTITY) {
      errors.push({ type: "QUANTITY_LIMIT_EXCEEDED", variantId: item.variantId, max: CART_MAX_QUANTITY });
      continue;
    }

    // Insufficient stock
    if (available < item.quantity) {
      errors.push({
        type: "INSUFFICIENT_STOCK",
        variantId: item.variantId,
        available,
        requested: item.quantity,
      });
      continue;
    }

    // Low stock warning (not an error — item is still purchasable)
    if (available <= item.quantity + 2) {
      warnings.push({ type: "LOW_STOCK", variantId: item.variantId, available, requested: item.quantity });
    }

    // Price changed since item was added to cart
    if (Math.abs(serverPrice - item.clientUnitPrice) > PRICE_CHANGE_TOLERANCE) {
      warnings.push({
        type: "PRICE_CHANGED",
        variantId: item.variantId,
        oldPrice: item.clientUnitPrice,
        newPrice: serverPrice,
      });
    }

    validItems.push({
      variantId: item.variantId,
      quantity: item.quantity,
      clientUnitPrice: item.clientUnitPrice,
      serverUnitPrice: serverPrice,
      productName,
      available,
    });
  }

  return { items: validItems, warnings, errors };
}
