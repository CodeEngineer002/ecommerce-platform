/**
 * Cart domain — shared types and DTOs.
 *
 * These are the server-authoritative cart types used in the service layer
 * and returned by all cart API routes. The client Zustand store is a
 * thin cache that mirrors CartSummary.
 */

// ── Cart status lifecycle ─────────────────────────────────────────────────────

export type CartStatus =
  | "active"     // can be read and modified
  | "abandoned"  // no activity for configured hours; still mutable
  | "expired"    // TTL passed; read-only
  | "merged"     // guest cart merged into authenticated cart; read-only
  | "converted"  // converted to order; read-only
  | "deleted";   // soft-deleted; read-only

// ── Cart row from DB (mapped from Supabase Row type) ─────────────────────────

export interface CartRow {
  id: string;
  user_id: string | null;
  session_id: string | null;
  status: CartStatus;
  country_id: string | null;
  currency_code: string | null;
  coupon_id: string | null;
  coupon_code: string | null;
  expires_at: string;
  merged_from: string | null;
  converted_to_order_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface CartItemRow {
  id: string;
  cart_id: string;
  variant_id: string;
  quantity: number;
  unit_price_snapshot: number | null;
  added_at: string;
  updated_at: string;
}

// ── Enriched cart item (with live product data) ───────────────────────────────

export interface CartItemDetail {
  id: string;
  cart_id: string;
  variant_id: string;
  quantity: number;
  /** Price when item was added — used for stale-price detection */
  unit_price_snapshot: number | null;
  /** Current server-authoritative price */
  current_unit_price: number;
  /** Price has changed since item was added */
  price_changed: boolean;
  product_name: string;
  variant_name: string;
  sku: string | null;
  image_url: string | null;
  is_available: boolean;
  available_stock: number;
  /** Stock is low but item is still purchasable */
  low_stock: boolean;
}

// ── Add-to-cart merge result — transient, only present on addCartItem response ─

/**
 * Metadata about what happened during an addCartItem call.
 * Used by the client to show accurate feedback toasts.
 * Chosen behavior: ADDITIVE — new qty is added on top of existing cart qty.
 */
export interface CartAddResult {
  variant_id: string;
  /** Quantity in cart BEFORE this call (0 if brand new item). */
  previous_quantity: number;
  /** Quantity the user requested to add. */
  added_quantity: number;
  /** Final quantity stored in cart after merge + capping. */
  final_quantity: number;
  /** True when final_quantity < previous_quantity + added_quantity (stock or hard cap hit). */
  was_capped: boolean;
  /** True when the item did not previously exist in the cart. */
  was_new_item: boolean;
}

// ── Cart summary DTO (returned by all cart APIs) ──────────────────────────────

export interface CartSummary {
  id: string;
  status: CartStatus;
  currency_code: string;
  country_id: string;
  items: CartItemDetail[];
  coupon_code: string | null;
  /** Pricing — all values in cart currency, rounded to 2dp */
  pricing: CartPricing;
  /** Warnings for the customer (price changed, low stock, etc.) */
  warnings: CartWarning[];
  item_count: number;
  expires_at: string;
  updated_at: string;
  /**
   * Present only on the response to addCartItem. Not persisted or stored in Zustand.
   * Use for toast/feedback. Undefined for getCart, removeCartItem, etc.
   */
  add_result?: CartAddResult;
}

export interface CartPricing {
  subtotal: number;
  discount: number;
  estimated_shipping: number;
  estimated_tax: number;
  total: number;
  /** Applied tax rate, e.g. 0.0875 for US Sales Tax, 0.18 for IN GST */
  tax_rate: number;
  /** Human-readable tax label for the active country, e.g. "Sales Tax", "GST", "VAT", "MwSt." */
  tax_label: string;
}

// ── Cart warnings (shown to customer, not errors) ─────────────────────────────

export type CartWarning =
  | { type: "PRICE_CHANGED"; variant_id: string; old_price: number; new_price: number; product_name: string }
  | { type: "LOW_STOCK"; variant_id: string; available: number; product_name: string }
  | { type: "ITEM_UNAVAILABLE"; variant_id: string; product_name: string }
  | { type: "QUANTITY_ADJUSTED"; variant_id: string; old_qty: number; new_qty: number; product_name: string }
  | { type: "COUPON_REMOVED"; reason: string }
  | { type: "CART_EXPIRED" };

// ── Input types for cart operations ──────────────────────────────────────────

export interface AddCartItemInput {
  variant_id: string;
  quantity: number;
}

export interface UpdateCartItemInput {
  quantity: number;
}

export interface ApplyCouponInput {
  coupon_code: string;
}

export interface CartIdentity {
  /** For authenticated users */
  user_id?: string;
  /** For guest users — opaque token stored in cookie */
  session_id?: string;
  /** Locale context */
  country_id?: string;
  currency_code?: string;
}

// ── Cart event types ──────────────────────────────────────────────────────────

export type CartEventType =
  | "cart_created"
  | "item_added"
  | "item_quantity_updated"
  | "item_removed"
  | "cart_cleared"
  | "coupon_applied"
  | "coupon_removed"
  | "cart_merged"
  | "cart_abandoned"
  | "checkout_started"
  | "cart_converted"
  | "cart_expired";
