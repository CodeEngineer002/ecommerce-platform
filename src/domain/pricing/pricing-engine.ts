import { FREE_SHIPPING_THRESHOLD, SHIPPING_COST, TAX_RATE } from "@/lib/constants";

import type { CouponData, LineItem, PriceBreakdown, ShippingConfig, TaxConfig } from "./types";

const DEFAULT_SHIPPING: ShippingConfig = {
  freeThreshold: FREE_SHIPPING_THRESHOLD,
  flatRate: SHIPPING_COST,
};

const DEFAULT_TAX: TaxConfig = { rate: TAX_RATE };

/**
 * Pure pricing calculation — no side effects, no DB access.
 * The source of truth for all price math in checkout and order creation.
 */
export function calculatePricing(
  items: LineItem[],
  coupon: CouponData | null = null,
  shipping: ShippingConfig = DEFAULT_SHIPPING,
  tax: TaxConfig = DEFAULT_TAX,
): PriceBreakdown {
  const subtotal = items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);

  const discount = calculateDiscount(subtotal, coupon);
  const taxableAmount = Math.max(0, subtotal - discount);
  const taxAmount = round2(taxableAmount * tax.rate);
  const shippingAmount = subtotal >= shipping.freeThreshold ? 0 : shipping.flatRate;
  const total = Math.max(0, taxableAmount + taxAmount + shippingAmount);

  return { subtotal, discount, taxableAmount, tax: taxAmount, shipping: shippingAmount, total };
}

/**
 * Calculates the discount amount for a given subtotal + coupon.
 * Exported separately so the coupon validation endpoint can compute
 * a preview discount without constructing fake LineItems.
 */
export function calculateDiscount(subtotal: number, coupon: CouponData | null): number {
  if (!coupon) return 0;

  let discount =
    coupon.type === "percentage"
      ? round2((subtotal * coupon.value) / 100)
      : coupon.value;

  if (coupon.maxDiscount !== null) {
    discount = Math.min(discount, coupon.maxDiscount);
  }

  return Math.min(discount, subtotal);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
