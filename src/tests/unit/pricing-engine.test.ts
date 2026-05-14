import { describe, expect, it } from "vitest";

import { calculateDiscount, calculatePricing } from "@/domain/pricing/pricing-engine";
import type { CouponData, LineItem, ShippingConfig, TaxConfig } from "@/domain/pricing/types";

const TAX: TaxConfig = { rate: 0.18 };
const SHIPPING: ShippingConfig = { freeThreshold: 999, flatRate: 99 };

const item = (price: number, qty = 1): LineItem => ({
  variantId: "v1",
  productName: "Test Product",
  unitPrice: price,
  quantity: qty,
});

const percentCoupon = (value: number, maxDiscount?: number): CouponData => ({
  id: "c1",
  code: "PCT10",
  type: "percentage",
  value,
  maxDiscount: maxDiscount ?? null,
  minOrderValue: null,
});

const fixedCoupon = (value: number): CouponData => ({
  id: "c2",
  code: "FLAT50",
  type: "fixed",
  value,
  maxDiscount: null,
  minOrderValue: null,
});

describe("calculatePricing", () => {
  it("calculates subtotal correctly for multiple items", () => {
    const result = calculatePricing(
      [item(500, 2), item(300, 1)],
      null,
      SHIPPING,
      TAX,
    );
    expect(result.subtotal).toBe(1300);
  });

  it("applies free shipping above threshold", () => {
    const result = calculatePricing([item(1000)], null, SHIPPING, TAX);
    expect(result.shipping).toBe(0);
  });

  it("charges flat shipping below threshold", () => {
    const result = calculatePricing([item(500)], null, SHIPPING, TAX);
    expect(result.shipping).toBe(99);
  });

  it("calculates tax on taxable amount (after discount)", () => {
    const result = calculatePricing([item(1000)], fixedCoupon(200), SHIPPING, TAX);
    // subtotal=1000, discount=200, taxable=800, tax=800*0.18=144
    expect(result.taxableAmount).toBe(800);
    expect(result.tax).toBe(144);
  });

  it("applies percentage coupon correctly", () => {
    const result = calculatePricing([item(1000)], percentCoupon(10), SHIPPING, TAX);
    expect(result.discount).toBe(100); // 10% of 1000
  });

  it("caps percentage discount with maxDiscount", () => {
    const result = calculatePricing([item(2000)], percentCoupon(20, 300), SHIPPING, TAX);
    expect(result.discount).toBe(300); // 20% of 2000=400, capped at 300
  });

  it("discount cannot exceed subtotal", () => {
    const result = calculatePricing([item(50)], fixedCoupon(500), SHIPPING, TAX);
    expect(result.discount).toBe(50);
    expect(result.total).toBeGreaterThanOrEqual(0);
  });

  it("total is never negative", () => {
    const result = calculatePricing([item(10)], fixedCoupon(1000), SHIPPING, TAX);
    expect(result.total).toBeGreaterThanOrEqual(0);
  });

  it("returns zero discount with no coupon", () => {
    const result = calculatePricing([item(500)], null, SHIPPING, TAX);
    expect(result.discount).toBe(0);
  });

  it("calculates correct total: taxable + tax + shipping", () => {
    const result = calculatePricing([item(500)], null, SHIPPING, TAX);
    // subtotal=500, discount=0, taxable=500, tax=90, shipping=99, total=689
    expect(result.subtotal).toBe(500);
    expect(result.tax).toBe(90);
    expect(result.shipping).toBe(99);
    expect(result.total).toBe(689);
  });
});

describe("calculateDiscount", () => {
  it("returns 0 for null coupon", () => {
    expect(calculateDiscount(1000, null)).toBe(0);
  });

  it("calculates fixed discount", () => {
    expect(calculateDiscount(1000, fixedCoupon(150))).toBe(150);
  });

  it("calculates percentage discount", () => {
    expect(calculateDiscount(1000, percentCoupon(15))).toBe(150);
  });

  it("caps discount at subtotal for fixed coupon", () => {
    expect(calculateDiscount(50, fixedCoupon(500))).toBe(50);
  });

  it("caps percentage discount at maxDiscount", () => {
    // 20% of 1000 = 200, max = 150
    expect(calculateDiscount(1000, percentCoupon(20, 150))).toBe(150);
  });
});
