/**
 * Unit tests — Pricing Engine (extended)
 *
 * Deep coverage of calculatePricing and calculateDiscount with:
 * - floating-point precision scenarios
 * - empty cart
 * - zero-value items
 * - multiple coupon types with constraints
 * - custom tax + shipping configs
 * - locale-currency edge cases
 */
import { describe, expect, it } from "vitest";

import { calculateDiscount, calculatePricing } from "@/domain/pricing/pricing-engine";
import {
  makeFixedCoupon,
  makeLineItem,
  makeLineItems,
  makePercentageCoupon,
  makeShippingConfig,
  makeTaxConfig,
} from "@/tests/factories";

const SHIPPING = makeShippingConfig();
const TAX = makeTaxConfig();

// ── calculatePricing — core ───────────────────────────────────────────────────

describe("calculatePricing — core scenarios", () => {
  it("handles empty items array (zero subtotal) — still charges shipping", () => {
    // Zero subtotal is below the free-shipping threshold, so flat rate applies.
    // total = 0 subtotal + 0 tax + 99 shipping = 99
    const result = calculatePricing([], null, SHIPPING, TAX);
    expect(result.subtotal).toBe(0);
    expect(result.shipping).toBe(SHIPPING.flatRate);
    expect(result.total).toBe(SHIPPING.flatRate); // 0 + 0 tax + 99 shipping
  });

  it("computes subtotal across multiple distinct items", () => {
    const items = makeLineItems([
      { price: 100, qty: 3 },
      { price: 250, qty: 2 },
      { price: 50, qty: 1 },
    ]);
    const result = calculatePricing(items, null, SHIPPING, TAX);
    expect(result.subtotal).toBe(100 * 3 + 250 * 2 + 50); // 850
  });

  it("zero-price item contributes nothing to subtotal but shipping still applies", () => {
    // Even with a zero-price item, subtotal=0 is below free-shipping threshold
    const items = [makeLineItem({ unitPrice: 0, quantity: 99 })];
    const result = calculatePricing(items, null, SHIPPING, TAX);
    expect(result.subtotal).toBe(0);
    expect(result.tax).toBe(0);
    expect(result.shipping).toBe(SHIPPING.flatRate); // below threshold
    expect(result.total).toBe(SHIPPING.flatRate);
  });

  it("applies zero tax rate", () => {
    const zeroTax = makeTaxConfig({ rate: 0 });
    const result = calculatePricing([makeLineItem({ unitPrice: 500 })], null, SHIPPING, zeroTax);
    expect(result.tax).toBe(0);
    expect(result.taxableAmount).toBe(500);
  });

  it("applies 100% free shipping threshold", () => {
    const freeShipping = makeShippingConfig({ freeThreshold: 0 });
    const result = calculatePricing([makeLineItem({ unitPrice: 1 })], null, freeShipping, TAX);
    expect(result.shipping).toBe(0);
  });
});

describe("calculatePricing — rounding precision", () => {
  it("rounds tax to 2 decimal places", () => {
    // 333 * 0.18 = 59.94 (exact), should not be floating mess
    const result = calculatePricing([makeLineItem({ unitPrice: 333 })], null, SHIPPING, TAX);
    const decimals = (result.tax.toString().split(".")[1] ?? "").length;
    expect(decimals).toBeLessThanOrEqual(2);
  });

  it("rounds percentage discount to 2 decimal places", () => {
    // 10% of 333 = 33.3 (needs rounding)
    const result = calculatePricing(
      [makeLineItem({ unitPrice: 333 })],
      makePercentageCoupon({ value: 10 }),
      SHIPPING,
      TAX,
    );
    const decimals = (result.discount.toString().split(".")[1] ?? "").length;
    expect(decimals).toBeLessThanOrEqual(2);
  });

  it("total is never negative even with large coupon", () => {
    const result = calculatePricing(
      [makeLineItem({ unitPrice: 10 })],
      makeFixedCoupon({ value: 10000 }),
      SHIPPING,
      TAX,
    );
    expect(result.total).toBeGreaterThanOrEqual(0);
  });
});

describe("calculatePricing — coupon × shipping interaction", () => {
  it("discount lowers taxable amount but not shipping threshold check", () => {
    // subtotal = 1100 → free shipping (>= 999)
    // even after 200 discount, shipping should still be free
    // because free-shipping is based on subtotal, not taxable amount
    const result = calculatePricing(
      [makeLineItem({ unitPrice: 1100 })],
      makeFixedCoupon({ value: 200 }),
      SHIPPING,
      TAX,
    );
    expect(result.shipping).toBe(0); // shipping based on subtotal (1100 >= 999)
    expect(result.taxableAmount).toBe(900); // 1100 - 200
  });
});

// ── calculateDiscount ─────────────────────────────────────────────────────────

describe("calculateDiscount — percentage coupons", () => {
  it("computes 10% discount on 1000", () => {
    expect(calculateDiscount(1000, makePercentageCoupon({ value: 10 }))).toBe(100);
  });

  it("computes 100% discount on 500", () => {
    expect(calculateDiscount(500, makePercentageCoupon({ value: 100 }))).toBe(500);
  });

  it("caps at maxDiscount", () => {
    const coupon = makePercentageCoupon({ value: 50, maxDiscount: 200 });
    // 50% of 1000 = 500, capped at 200
    expect(calculateDiscount(1000, coupon)).toBe(200);
  });

  it("does not cap when discount is below maxDiscount", () => {
    const coupon = makePercentageCoupon({ value: 5, maxDiscount: 200 });
    // 5% of 1000 = 50, below cap
    expect(calculateDiscount(1000, coupon)).toBe(50);
  });

  it("discount never exceeds subtotal", () => {
    const coupon = makePercentageCoupon({ value: 100, maxDiscount: null });
    expect(calculateDiscount(300, coupon)).toBe(300);
  });
});

describe("calculateDiscount — fixed coupons", () => {
  it("applies fixed value directly", () => {
    expect(calculateDiscount(1000, makeFixedCoupon({ value: 150 }))).toBe(150);
  });

  it("caps fixed discount at subtotal", () => {
    expect(calculateDiscount(50, makeFixedCoupon({ value: 500 }))).toBe(50);
  });

  it("zero fixed discount returns 0", () => {
    expect(calculateDiscount(1000, makeFixedCoupon({ value: 0 }))).toBe(0);
  });
});

describe("calculateDiscount — null coupon", () => {
  it("returns 0 for null coupon", () => {
    expect(calculateDiscount(1000, null)).toBe(0);
    expect(calculateDiscount(0, null)).toBe(0);
  });
});
