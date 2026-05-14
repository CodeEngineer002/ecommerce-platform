/**
 * Unit tests — Shipping Calculator
 *
 * The shipping calculator is a pure strategy-pattern function.
 * Tests verify: flat-rate logic, free-shipping threshold,
 * custom strategies, and edge cases (zero subtotal, exact threshold).
 */
import { describe, expect, it } from "vitest";

import {
  calculateShipping,
  flatRateStrategy,
  type ShippingContext,
  type ShippingStrategy,
} from "@/domain/shipping/shipping-calculator";

const FREE_THRESHOLD = 999;
const FLAT_RATE = 99;

describe("flatRateStrategy", () => {
  it("charges flat rate below threshold", () => {
    const rate = flatRateStrategy({ subtotal: 500 });
    expect(rate.cost).toBe(FLAT_RATE);
    expect(rate.label).toBe("Standard Shipping");
  });

  it("provides free shipping at or above threshold", () => {
    const rate = flatRateStrategy({ subtotal: FREE_THRESHOLD });
    expect(rate.cost).toBe(0);
    expect(rate.label).toBe("Free Shipping");
  });

  it("provides free shipping well above threshold", () => {
    expect(flatRateStrategy({ subtotal: 5000 }).cost).toBe(0);
  });

  it("charges flat rate for zero subtotal", () => {
    expect(flatRateStrategy({ subtotal: 0 }).cost).toBe(FLAT_RATE);
  });

  it("charges flat rate 1 unit below threshold", () => {
    expect(flatRateStrategy({ subtotal: FREE_THRESHOLD - 1 }).cost).toBe(FLAT_RATE);
  });

  it("returns an estimated delivery days value", () => {
    const rate = flatRateStrategy({ subtotal: 500 });
    expect(rate.estimatedDays).not.toBeNull();
  });
});

describe("calculateShipping", () => {
  it("uses flat rate strategy by default", () => {
    const result = calculateShipping({ subtotal: 500 });
    expect(result.cost).toBe(FLAT_RATE);
  });

  it("uses free-shipping strategy when provided", () => {
    const freeAlwaysStrategy: ShippingStrategy = (_ctx: ShippingContext) => ({
      cost: 0,
      label: "Free Overnight",
      estimatedDays: 1,
    });
    const result = calculateShipping({ subtotal: 1 }, freeAlwaysStrategy);
    expect(result.cost).toBe(0);
    expect(result.label).toBe("Free Overnight");
  });

  it("applies express strategy correctly", () => {
    const expressStrategy: ShippingStrategy = (ctx: ShippingContext) => ({
      cost: ctx.subtotal >= 2000 ? 0 : 199,
      label: "Express Shipping",
      estimatedDays: 2,
    });

    expect(calculateShipping({ subtotal: 1000 }, expressStrategy).cost).toBe(199);
    expect(calculateShipping({ subtotal: 2000 }, expressStrategy).cost).toBe(0);
  });

  it("strategy receives the context object unchanged", () => {
    const capturedCtx: ShippingContext[] = [];
    const spy: ShippingStrategy = (ctx) => {
      capturedCtx.push(ctx);
      return { cost: 0, label: "spy", estimatedDays: null };
    };
    calculateShipping({ subtotal: 777 }, spy);
    expect(capturedCtx[0].subtotal).toBe(777);
  });
});
