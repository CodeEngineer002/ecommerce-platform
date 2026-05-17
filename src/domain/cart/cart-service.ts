/**
 * CartService — server-side cart management.
 *
 * Source of truth for all cart operations. Every mutation:
 *   1. Validates cart ownership and status
 *   2. Validates product/variant/stock server-side
 *   3. Applies the mutation atomically
 *   4. Recalculates pricing
 *   5. Emits a cart event
 *   6. Returns the updated CartSummary
 *
 * Guest carts are identified by a server-generated session_id.
 * Authenticated carts are linked to user_id.
 * Both flow through the same service — identity is passed as CartIdentity.
 *
 * All DB access uses the service client (bypasses RLS) since:
 *   - Guest carts have no auth.uid()
 *   - We enforce ownership at the service layer instead
 */

import "server-only";

import { calculateDiscount, calculatePricing } from "@/domain/pricing/pricing-engine";
import type { CouponData, LineItem } from "@/domain/pricing/types";
import { CART_MAX_QUANTITY } from "@/lib/constants";
import { logger } from "@/lib/logger";
import { createServiceClient } from "@/lib/supabase/server";
import { getTaxConfig } from "@/lib/tax/tax-service";

import { assertCartMutable } from "./cart-state-machine";
import { emitCartEvent } from "./cart-events";
import {
  CartCouponError,
  CartItemNotFoundError,
  CartNotFoundError,
  CartOwnershipError,
  EmptyCartError,
  InvalidCartQuantityError,
  ProductUnavailableError,
  QuantityExceedsStockError,
  VariantUnavailableError,
} from "./errors";
import type {
  AddCartItemInput,
  ApplyCouponInput,
  CartIdentity,
  CartItemDetail,
  CartPricing,
  CartRow,
  CartSummary,
  CartWarning,
} from "./types";

// ── Constants ─────────────────────────────────────────────────────────────────

const LOW_STOCK_THRESHOLD = 5;
const PRICE_CHANGE_TOLERANCE = 0.01; // sub-1-paisa float noise ignored
const DEFAULT_CURRENCY = "INR";
const DEFAULT_COUNTRY = "in";

// ── Internal DB row types ──────────────────────────────────────────────────────

type InventoryLevel = { quantity: number; reserved: number };

// Helper: aggregate available stock across all warehouse rows.
// inventory_levels is the source of truth (CLAUDE.md Step 1 / migration 00017).
function sumAvailableStock(levels: InventoryLevel[] | null | undefined): number {
  if (!levels || levels.length === 0) return 0;
  return levels.reduce((sum, l) => sum + Math.max(0, l.quantity - l.reserved), 0);
}

type VariantWithProduct = {
  id: string;
  price: number | null;
  is_active: boolean;
  options: Record<string, unknown>;
  sku: string | null;
  product: {
    id: string;
    name: string;
    base_price: number;
    is_active: boolean;
    images: { url: string }[];
  } | null;
  inventory_levels: InventoryLevel[] | null;
};

// ── Ownership assertion ───────────────────────────────────────────────────────

function assertCartOwnership(cart: CartRow, identity: CartIdentity): void {
  if (identity.user_id) {
    if (cart.user_id !== identity.user_id) throw new CartOwnershipError();
    return;
  }
  if (identity.session_id) {
    if (cart.session_id !== identity.session_id) throw new CartOwnershipError();
    return;
  }
  throw new CartOwnershipError();
}

// ── Variant fetch helper ──────────────────────────────────────────────────────

async function fetchVariant(variantId: string): Promise<VariantWithProduct> {
  const db = createServiceClient();
  const { data } = await db
    .from("product_variants")
    .select(
      "id, price, is_active, options, sku, product:products(id, name, base_price, is_active, images:product_images(url)), inventory_levels(quantity, reserved)",
    )
    .eq("id", variantId)
    .single();

  if (!data) throw new VariantUnavailableError(variantId);

  const variant = data as unknown as VariantWithProduct;
  if (!variant.is_active) throw new VariantUnavailableError(variantId);

  const product = Array.isArray(variant.product) ? variant.product[0] : variant.product;
  if (!product || !product.is_active) throw new ProductUnavailableError(product?.name ?? variantId);

  return { ...variant, product, inventory_levels: Array.isArray(variant.inventory_levels) ? variant.inventory_levels : (variant.inventory_levels ? [variant.inventory_levels] : null) };
}

// ── Cart summary builder ──────────────────────────────────────────────────────

async function buildCartSummary(cartId: string): Promise<CartSummary> {
  const db = createServiceClient();

  // Fetch cart + items in one query
  const { data: cart } = await db
    .from("carts")
    .select("*, cart_items(id, variant_id, quantity, unit_price_snapshot, added_at, updated_at)")
    .eq("id", cartId)
    .single();

  if (!cart) throw new CartNotFoundError(cartId);

  const cartRow = cart as CartRow & { cart_items: Array<{ id: string; variant_id: string; quantity: number; unit_price_snapshot: number | null; added_at: string; updated_at: string }> };
  const rawItems = cartRow.cart_items ?? [];

  if (rawItems.length === 0) {
    return buildEmptyCartSummary(cartRow);
  }

  // Fetch current variant/product/inventory data for all items at once
  const variantIds = rawItems.map((i) => i.variant_id);
  const { data: variants } = await db
    .from("product_variants")
    .select(
      "id, price, is_active, sku, product:products(id, name, base_price, is_active, images:product_images(url)), inventory_levels(quantity, reserved)",
    )
    .in("id", variantIds);

  const variantMap = new Map<string, VariantWithProduct>();
  for (const v of (variants ?? []) as unknown as VariantWithProduct[]) {
    const product = Array.isArray(v.product) ? v.product[0] : v.product;
    const levels = Array.isArray(v.inventory_levels) ? v.inventory_levels : (v.inventory_levels ? [v.inventory_levels] : null);
    variantMap.set(v.id, { ...v, product: product ?? null, inventory_levels: levels });
  }

  const items: CartItemDetail[] = [];
  const warnings: CartWarning[] = [];
  const lineItems: LineItem[] = [];

  for (const raw of rawItems) {
    const variant = variantMap.get(raw.variant_id);

    // Item references a variant that was deleted or deactivated
    if (!variant || !variant.is_active || !variant.product || !variant.product.is_active) {
      const name = variant?.product?.name ?? raw.variant_id;
      warnings.push({ type: "ITEM_UNAVAILABLE", variant_id: raw.variant_id, product_name: name });
      continue;
    }

    const currentPrice = variant.price ?? variant.product.base_price;
    const available = sumAvailableStock(variant.inventory_levels);

    // Stale price detection
    const snapshotPrice = raw.unit_price_snapshot;
    const priceChanged = snapshotPrice !== null && Math.abs(snapshotPrice - currentPrice) > PRICE_CHANGE_TOLERANCE;
    if (priceChanged && snapshotPrice !== null) {
      warnings.push({
        type: "PRICE_CHANGED",
        variant_id: raw.variant_id,
        old_price: snapshotPrice,
        new_price: currentPrice,
        product_name: variant.product.name,
      });
    }

    // Quantity adjusted if stock fell below what's in cart
    let effectiveQty = raw.quantity;
    if (available < effectiveQty) {
      if (available === 0) {
        warnings.push({ type: "ITEM_UNAVAILABLE", variant_id: raw.variant_id, product_name: variant.product.name });
        continue;
      }
      warnings.push({
        type: "QUANTITY_ADJUSTED",
        variant_id: raw.variant_id,
        old_qty: raw.quantity,
        new_qty: available,
        product_name: variant.product.name,
      });
      effectiveQty = available;
    }

    if (available > 0 && available <= LOW_STOCK_THRESHOLD) {
      warnings.push({ type: "LOW_STOCK", variant_id: raw.variant_id, available, product_name: variant.product.name });
    }

    const images = variant.product.images ?? [];
    const imageUrl = images.length > 0 ? (images[0] as { url: string }).url : null;

    items.push({
      id: raw.id,
      cart_id: cartRow.id,
      variant_id: raw.variant_id,
      quantity: effectiveQty,
      unit_price_snapshot: snapshotPrice,
      current_unit_price: currentPrice,
      price_changed: priceChanged,
      product_name: variant.product.name,
      variant_name: typeof variant.options === "object" && variant.options !== null
        ? Object.values(variant.options).join(" / ")
        : "",
      sku: variant.sku,
      image_url: imageUrl,
      is_available: true,
      available_stock: available,
      low_stock: available > 0 && available <= LOW_STOCK_THRESHOLD,
    });

    lineItems.push({ variantId: raw.variant_id, quantity: effectiveQty, unitPrice: currentPrice });
  }

  // Fetch coupon for pricing
  let couponData: CouponData | null = null;
  if (cartRow.coupon_code) {
    const { data: coupon } = await db
      .from("coupons")
      .select("id, code, type, value, min_order_value, max_discount, is_active, valid_until")
      .eq("code", cartRow.coupon_code)
      .single();

    if (coupon && coupon.is_active && (!coupon.valid_until || new Date(coupon.valid_until) > new Date())) {
      couponData = { code: coupon.code, type: coupon.type as "percentage" | "fixed", value: coupon.value, maxDiscount: coupon.max_discount ?? undefined };
    } else if (cartRow.coupon_code) {
      // Coupon is no longer valid — remove it and warn
      await db.from("carts").update({ coupon_id: null, coupon_code: null }).eq("id", cartRow.id);
      warnings.push({ type: "COUPON_REMOVED", reason: "Coupon is no longer valid" });
    }
  }

  // Resolve country-specific tax config so the cart reflects the correct rate
  // country_id is a lowercased ISO-like key ('us', 'in', 'de', etc.) — getTaxConfig
  // accepts both ISO-2 ('US') and our internal keys ('us') via case-insensitive lookup.
  const taxConfig = getTaxConfig(cartRow.country_id ?? DEFAULT_COUNTRY);
  const breakdown = calculatePricing(lineItems, couponData, undefined, taxConfig);

  const pricing: CartPricing = {
    subtotal: breakdown.subtotal,
    discount: breakdown.discount,
    estimated_shipping: breakdown.shipping,
    estimated_tax: breakdown.tax,
    total: breakdown.total,
    tax_rate: taxConfig.rate,
    tax_label: taxConfig.label,
  };

  return {
    id: cartRow.id,
    status: cartRow.status,
    currency_code: cartRow.currency_code ?? DEFAULT_CURRENCY,
    country_id: cartRow.country_id ?? DEFAULT_COUNTRY,
    items,
    coupon_code: couponData ? couponData.code : null,
    pricing,
    warnings,
    item_count: items.reduce((sum, i) => sum + i.quantity, 0),
    expires_at: cartRow.expires_at,
    updated_at: cartRow.updated_at,
  };
}

function buildEmptyCartSummary(cartRow: CartRow): CartSummary {
  const taxConfig = getTaxConfig(cartRow.country_id ?? DEFAULT_COUNTRY);
  return {
    id: cartRow.id,
    status: cartRow.status,
    currency_code: cartRow.currency_code ?? DEFAULT_CURRENCY,
    country_id: cartRow.country_id ?? DEFAULT_COUNTRY,
    items: [],
    coupon_code: null,
    pricing: {
      subtotal: 0, discount: 0, estimated_shipping: 0, estimated_tax: 0, total: 0,
      tax_rate: taxConfig.rate,
      tax_label: taxConfig.label,
    },
    warnings: [],
    item_count: 0,
    expires_at: cartRow.expires_at,
    updated_at: cartRow.updated_at,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Get the active cart for the given identity, or create one if it doesn't exist.
 * For authenticated users, uses the DB function get_or_create_user_cart.
 * For guests, uses session_id directly.
 */
export async function getOrCreateCart(identity: CartIdentity): Promise<CartSummary> {
  const db = createServiceClient();
  const currency = identity.currency_code ?? DEFAULT_CURRENCY;
  const country = identity.country_id ?? DEFAULT_COUNTRY;

  if (identity.user_id) {
    // Authenticated path: use atomic DB function
    const { data: cartId, error } = await db.rpc("get_or_create_user_cart", {
      p_user_id: identity.user_id,
      p_currency: currency,
      p_country_id: country,
    });

    if (error || !cartId) {
      logger.error("[cart-service] get_or_create_user_cart failed", error);
      throw new CartNotFoundError();
    }

    return buildCartSummary(cartId as string);
  }

  if (identity.session_id) {
    // Guest path: find existing active cart or create one
    const { data: existing } = await db
      .from("carts")
      .select("id")
      .eq("session_id", identity.session_id)
      .eq("status", "active")
      .single();

    if (existing) {
      // Extend TTL on activity and sync country + currency if region changed
      await db.from("carts")
        .update({
          expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          country_id: country,
          currency_code: currency,
        })
        .eq("id", existing.id);
      return buildCartSummary(existing.id);
    }

    const { data: created } = await db
      .from("carts")
      .insert({
        session_id: identity.session_id,
        currency_code: currency,
        country_id: country,
        status: "active",
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .select("id")
      .single();

    if (!created) throw new CartNotFoundError();

    await emitCartEvent(db, "cart_created", { cartId: created.id });
    return buildCartSummary(created.id);
  }

  throw new CartOwnershipError();
}

/**
 * Fetch a cart by ID and validate the requester owns it.
 */
export async function getCart(cartId: string, identity: CartIdentity): Promise<CartSummary> {
  const db = createServiceClient();
  const { data: cart } = await db.from("carts").select("*").eq("id", cartId).single();
  if (!cart) throw new CartNotFoundError(cartId);
  assertCartOwnership(cart as CartRow, identity);
  return buildCartSummary(cartId);
}

/**
 * Add an item to the cart (or merge if variant already exists).
 * Validates variant, product, and stock server-side before writing.
 */
export async function addCartItem(
  cartId: string,
  identity: CartIdentity,
  input: AddCartItemInput,
): Promise<CartSummary> {
  if (input.quantity < 1 || input.quantity > CART_MAX_QUANTITY) {
    throw new InvalidCartQuantityError(CART_MAX_QUANTITY);
  }

  const db = createServiceClient();

  // Ownership + status check
  const { data: cart } = await db.from("carts").select("*").eq("id", cartId).single();
  if (!cart) throw new CartNotFoundError(cartId);
  const cartRow = cart as CartRow;
  assertCartOwnership(cartRow, identity);
  assertCartMutable(cartRow.status);

  // Server-side variant + stock validation
  const variant = await fetchVariant(input.variant_id);
  const available = sumAvailableStock(variant.inventory_levels);

  // Check if already in cart
  const { data: existing } = await db
    .from("cart_items")
    .select("id, quantity")
    .eq("cart_id", cartId)
    .eq("variant_id", input.variant_id)
    .single();

  const requestedTotal = (existing?.quantity ?? 0) + input.quantity;
  const cappedQty = Math.min(requestedTotal, CART_MAX_QUANTITY);

  if (available < cappedQty) throw new QuantityExceedsStockError(available);

  const serverPrice = variant.price ?? (variant.product?.base_price ?? 0);

  // Upsert: insert or update existing item
  await db.from("cart_items").upsert(
    {
      cart_id: cartId,
      variant_id: input.variant_id,
      quantity: cappedQty,
      unit_price_snapshot: serverPrice,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "cart_id,variant_id" },
  );

  await emitCartEvent(db, "item_added", {
    cartId,
    actorId: identity.user_id,
    metadata: { variant_id: input.variant_id, quantity: input.quantity, capped_to: cappedQty },
  });

  return buildCartSummary(cartId);
}

/**
 * Update quantity of an existing cart item.
 * Setting quantity to 0 removes the item.
 */
export async function updateCartItemQuantity(
  cartId: string,
  variantId: string,
  identity: CartIdentity,
  quantity: number,
): Promise<CartSummary> {
  if (quantity === 0) {
    return removeCartItem(cartId, variantId, identity);
  }

  if (quantity < 1 || quantity > CART_MAX_QUANTITY) {
    throw new InvalidCartQuantityError(CART_MAX_QUANTITY);
  }

  const db = createServiceClient();

  const { data: cart } = await db.from("carts").select("*").eq("id", cartId).single();
  if (!cart) throw new CartNotFoundError(cartId);
  const cartRow = cart as CartRow;
  assertCartOwnership(cartRow, identity);
  assertCartMutable(cartRow.status);

  // Check item exists
  const { data: item } = await db
    .from("cart_items")
    .select("id")
    .eq("cart_id", cartId)
    .eq("variant_id", variantId)
    .single();
  if (!item) throw new CartItemNotFoundError(variantId);

  // Stock check
  const variant = await fetchVariant(variantId);
  const available = sumAvailableStock(variant.inventory_levels);
  if (available < quantity) throw new QuantityExceedsStockError(available);

  await db
    .from("cart_items")
    .update({ quantity, updated_at: new Date().toISOString() })
    .eq("cart_id", cartId)
    .eq("variant_id", variantId);

  await emitCartEvent(db, "item_quantity_updated", {
    cartId,
    actorId: identity.user_id,
    metadata: { variant_id: variantId, quantity },
  });

  return buildCartSummary(cartId);
}

/**
 * Remove a specific item from the cart.
 */
export async function removeCartItem(
  cartId: string,
  variantId: string,
  identity: CartIdentity,
): Promise<CartSummary> {
  const db = createServiceClient();

  const { data: cart } = await db.from("carts").select("*").eq("id", cartId).single();
  if (!cart) throw new CartNotFoundError(cartId);
  const cartRow = cart as CartRow;
  assertCartOwnership(cartRow, identity);
  assertCartMutable(cartRow.status);

  const { error } = await db
    .from("cart_items")
    .delete()
    .eq("cart_id", cartId)
    .eq("variant_id", variantId);

  if (error) throw new CartItemNotFoundError(variantId);

  await emitCartEvent(db, "item_removed", {
    cartId,
    actorId: identity.user_id,
    metadata: { variant_id: variantId },
  });

  return buildCartSummary(cartId);
}

/**
 * Remove all items from the cart and clear the coupon.
 */
export async function clearCart(
  cartId: string,
  identity: CartIdentity,
): Promise<CartSummary> {
  const db = createServiceClient();

  const { data: cart } = await db.from("carts").select("*").eq("id", cartId).single();
  if (!cart) throw new CartNotFoundError(cartId);
  const cartRow = cart as CartRow;
  assertCartOwnership(cartRow, identity);
  assertCartMutable(cartRow.status);

  await db.from("cart_items").delete().eq("cart_id", cartId);
  await db.from("carts").update({ coupon_id: null, coupon_code: null }).eq("id", cartId);

  await emitCartEvent(db, "cart_cleared", { cartId, actorId: identity.user_id });

  return buildCartSummary(cartId);
}

/**
 * Apply a coupon to the cart.
 * Validates: coupon exists, active, not expired, min order value met.
 * Does NOT consume the coupon — consumption happens at order creation.
 */
export async function applyCoupon(
  cartId: string,
  identity: CartIdentity,
  input: ApplyCouponInput,
): Promise<CartSummary> {
  const db = createServiceClient();

  const { data: cart } = await db.from("carts").select("*").eq("id", cartId).single();
  if (!cart) throw new CartNotFoundError(cartId);
  const cartRow = cart as CartRow;
  assertCartOwnership(cartRow, identity);
  assertCartMutable(cartRow.status);

  const code = input.coupon_code.trim().toUpperCase();

  const { data: coupon } = await db
    .from("coupons")
    .select("id, code, type, value, min_order_value, max_discount, usage_limit, used_count, valid_from, valid_until, is_active")
    .eq("code", code)
    .eq("is_active", true)
    .single();

  if (!coupon) throw new CartCouponError("Coupon not found or inactive", "COUPON_NOT_FOUND");
  if (coupon.valid_until && new Date(coupon.valid_until) < new Date()) {
    throw new CartCouponError("This coupon has expired", "COUPON_EXPIRED");
  }
  if (coupon.valid_from && new Date(coupon.valid_from) > new Date()) {
    throw new CartCouponError("This coupon is not yet active", "COUPON_NOT_YET_ACTIVE");
  }
  if (coupon.usage_limit !== null && coupon.used_count >= coupon.usage_limit) {
    throw new CartCouponError("This coupon has reached its usage limit", "COUPON_USAGE_LIMIT");
  }

  // Get current subtotal to check min_order_value
  const summary = await buildCartSummary(cartId);
  if (summary.items.length === 0) throw new EmptyCartError();
  if (coupon.min_order_value && summary.pricing.subtotal < coupon.min_order_value) {
    throw new CartCouponError(
      `Minimum order of ₹${coupon.min_order_value} required for this coupon`,
      "COUPON_MIN_ORDER",
    );
  }

  // Per-user usage check
  if (identity.user_id) {
    const { count } = await db
      .from("coupon_usage")
      .select("id", { count: "exact", head: true })
      .eq("coupon_id", coupon.id)
      .eq("user_id", identity.user_id);

    if ((count ?? 0) > 0) {
      throw new CartCouponError("You have already used this coupon", "COUPON_ALREADY_USED");
    }
  }

  await db.from("carts").update({ coupon_id: coupon.id, coupon_code: code }).eq("id", cartId);

  await emitCartEvent(db, "coupon_applied", {
    cartId,
    actorId: identity.user_id,
    metadata: { coupon_code: code },
  });

  return buildCartSummary(cartId);
}

/**
 * Remove the coupon from the cart.
 */
export async function removeCoupon(
  cartId: string,
  identity: CartIdentity,
): Promise<CartSummary> {
  const db = createServiceClient();

  const { data: cart } = await db.from("carts").select("*").eq("id", cartId).single();
  if (!cart) throw new CartNotFoundError(cartId);
  const cartRow = cart as CartRow;
  assertCartOwnership(cartRow, identity);
  assertCartMutable(cartRow.status);

  await db.from("carts").update({ coupon_id: null, coupon_code: null }).eq("id", cartId);

  await emitCartEvent(db, "coupon_removed", { cartId, actorId: identity.user_id });

  return buildCartSummary(cartId);
}

/**
 * Merge a guest cart into an authenticated user cart after login.
 *
 * Strategy:
 *   - Same variant → sum quantities, cap at CART_MAX_QUANTITY
 *   - New variants from guest → added to user cart
 *   - Invalid/unavailable guest items → skipped with warnings
 *   - Coupon from guest → applied to user cart only if user cart has no coupon
 *   - Guest cart status → 'merged'
 *   - User cart → recalculated, returned
 */
export async function mergeGuestCart(
  guestSessionId: string,
  userId: string,
  identity: CartIdentity,
): Promise<CartSummary & { merge_warnings: CartWarning[] }> {
  const db = createServiceClient();

  // Find guest cart
  const { data: guestCart } = await db
    .from("carts")
    .select("id, coupon_code, status")
    .eq("session_id", guestSessionId)
    .eq("status", "active")
    .single();

  if (!guestCart) {
    // No guest cart to merge — just return current user cart
    const userSummary = await getOrCreateCart(identity);
    return { ...userSummary, merge_warnings: [] };
  }

  // Get or create user cart
  const { data: userCartId } = await db.rpc("get_or_create_user_cart", {
    p_user_id: userId,
    p_currency: identity.currency_code ?? DEFAULT_CURRENCY,
    p_country_id: identity.country_id ?? DEFAULT_COUNTRY,
  });

  if (!userCartId) throw new CartNotFoundError();

  // Use the DB function for atomic merge
  const { error: mergeError } = await db.rpc("merge_guest_cart", {
    p_guest_cart_id: guestCart.id,
    p_user_cart_id: userCartId as string,
    p_max_qty: CART_MAX_QUANTITY,
  });

  if (mergeError) {
    logger.error("[cart-service] merge_guest_cart RPC failed", mergeError);
    throw new CartNotFoundError();
  }

  // Apply guest coupon to user cart if user cart has none
  const { data: userCart } = await db
    .from("carts")
    .select("coupon_code")
    .eq("id", userCartId as string)
    .single();

  if (guestCart.coupon_code && !userCart?.coupon_code) {
    await db.from("carts")
      .update({ coupon_code: guestCart.coupon_code })
      .eq("id", userCartId as string);
  }

  await emitCartEvent(db, "cart_merged", {
    cartId: userCartId as string,
    actorId: userId,
    metadata: { guest_cart_id: guestCart.id },
  });

  const mergedSummary = await buildCartSummary(userCartId as string);

  // Warnings from the build (stale prices, unavailable items, etc.) serve as merge warnings too
  return { ...mergedSummary, merge_warnings: mergedSummary.warnings };
}

/**
 * Validate cart readiness for checkout.
 * Returns warnings — does NOT mutate the cart.
 * Throws if cart is empty or has blocking errors.
 */
export async function validateCartForCheckout(
  cartId: string,
  identity: CartIdentity,
): Promise<CartSummary> {
  const db = createServiceClient();
  const { data: cart } = await db.from("carts").select("*").eq("id", cartId).single();
  if (!cart) throw new CartNotFoundError(cartId);
  assertCartOwnership(cart as CartRow, identity);
  assertCartMutable((cart as CartRow).status);

  const summary = await buildCartSummary(cartId);
  if (summary.items.length === 0) throw new EmptyCartError();

  return summary;
}

/**
 * Calculate a discount preview for a coupon code without applying it to the cart.
 * Used by the coupon validation API endpoint.
 */
export async function previewCouponDiscount(
  cartId: string,
  identity: CartIdentity,
  couponCode: string,
): Promise<{ discount: number; coupon_type: string; coupon_value: number }> {
  const db = createServiceClient();

  const { data: cart } = await db.from("carts").select("*").eq("id", cartId).single();
  if (!cart) throw new CartNotFoundError(cartId);
  assertCartOwnership(cart as CartRow, identity);

  const code = couponCode.trim().toUpperCase();
  const { data: coupon } = await db
    .from("coupons")
    .select("id, code, type, value, min_order_value, max_discount, is_active, valid_until")
    .eq("code", code)
    .eq("is_active", true)
    .single();

  if (!coupon) throw new CartCouponError("Coupon not found or inactive", "COUPON_NOT_FOUND");
  if (coupon.valid_until && new Date(coupon.valid_until) < new Date()) {
    throw new CartCouponError("This coupon has expired", "COUPON_EXPIRED");
  }

  const summary = await buildCartSummary(cartId);
  const couponData: CouponData = {
    code: coupon.code,
    type: coupon.type as "percentage" | "fixed",
    value: coupon.value,
    maxDiscount: coupon.max_discount ?? undefined,
  };
  const discount = calculateDiscount(summary.pricing.subtotal, couponData);

  return { discount, coupon_type: coupon.type, coupon_value: coupon.value };
}
