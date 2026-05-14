import "server-only";

import { validateCart } from "@/domain/cart/cart-validator";
import { CouponError, validateCoupon } from "@/domain/coupon/coupon-engine";
import { calculatePricing } from "@/domain/pricing/pricing-engine";
import type { CartPricingWarning, CouponData, OrderPricingSnapshot, PriceBreakdown } from "@/domain/pricing/types";
import { CURRENCY } from "@/lib/constants";
import { ValidationError } from "@/lib/errors";

export interface CheckoutItem {
  variantId: string;
  quantity: number;
  clientUnitPrice: number;
}

export interface CheckoutSummaryInput {
  items: CheckoutItem[];
  couponCode?: string;
  userId: string;
}

export interface ValidatedCheckoutItem {
  variantId: string;
  quantity: number;
  serverUnitPrice: number;
  productName: string;
  priceChanged: boolean;
  oldPrice?: number;
}

export interface CheckoutSummary {
  items: ValidatedCheckoutItem[];
  pricing: PriceBreakdown;
  coupon: CouponData | null;
  warnings: CartPricingWarning[];
  pricingSnapshot: OrderPricingSnapshot;
}

/**
 * Validates a cart and builds a complete, trusted checkout summary.
 * This is the single authoritative entry point before order creation.
 *
 * Call this from the checkout page to:
 *   1. Show users accurate pricing (price-change alerts, stock warnings)
 *   2. Get the pricing snapshot to pass to the order creation API
 *
 * Throws ValidationError if there are hard errors (unavailable items, out of stock).
 */
export async function buildCheckoutSummary(
  input: CheckoutSummaryInput,
): Promise<CheckoutSummary> {
  // ── Validate cart items ──────────────────────────────────────────────────
  const cartValidation = await validateCart(
    input.items.map((i) => ({
      variantId: i.variantId,
      quantity: i.quantity,
      clientUnitPrice: i.clientUnitPrice,
    })),
  );

  if (cartValidation.errors.length > 0) {
    const first = cartValidation.errors[0];
    throw new ValidationError(
      first.type === "VARIANT_UNAVAILABLE"
        ? `'${(first as { productName: string }).productName}' is no longer available`
        : first.type === "INSUFFICIENT_STOCK"
          ? `Only ${(first as { available: number }).available} units available`
          : "Some items in your cart are unavailable",
      undefined,
      first.type,
    );
  }

  // ── Build authoritative line items ────────────────────────────────────────
  const lineItems = cartValidation.items.map((item) => ({
    variantId: item.variantId,
    quantity: item.quantity,
    unitPrice: item.serverUnitPrice,
    productName: item.productName,
  }));

  // ── Validate coupon ───────────────────────────────────────────────────────
  let coupon: CouponData | null = null;
  if (input.couponCode) {
    const subtotal = lineItems.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
    try {
      coupon = await validateCoupon(input.couponCode, subtotal, input.userId);
    } catch (err) {
      if (err instanceof CouponError) throw err;
      throw err;
    }
  }

  // ── Calculate pricing ─────────────────────────────────────────────────────
  const pricing = calculatePricing(lineItems, coupon);

  // ── Build validated items with price-change flags ─────────────────────────
  const validatedItems: ValidatedCheckoutItem[] = cartValidation.items.map((item) => {
    const priceChanged = item.clientUnitPrice !== item.serverUnitPrice;
    return {
      variantId: item.variantId,
      quantity: item.quantity,
      serverUnitPrice: item.serverUnitPrice,
      productName: item.productName,
      priceChanged,
      oldPrice: priceChanged ? item.clientUnitPrice : undefined,
    };
  });

  // ── Build immutable pricing snapshot ─────────────────────────────────────
  const pricingSnapshot: OrderPricingSnapshot = {
    currency: CURRENCY,
    subtotal: pricing.subtotal,
    discount: pricing.discount,
    tax: pricing.tax,
    taxRate: pricing.tax / (pricing.taxableAmount || 1),
    shipping: pricing.shipping,
    total: pricing.total,
    couponCode: coupon?.code ?? null,
    couponType: coupon?.type ?? null,
    couponValue: coupon?.value ?? null,
    lineItems: lineItems.map((i) => ({
      variantId: i.variantId,
      productName: i.productName,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      lineTotal: i.unitPrice * i.quantity,
    })),
  };

  return {
    items: validatedItems,
    pricing,
    coupon,
    warnings: cartValidation.warnings,
    pricingSnapshot,
  };
}
