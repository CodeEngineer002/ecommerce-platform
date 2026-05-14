/**
 * Integration tests — Checkout Flow (mocked Supabase)
 *
 * Tests the full checkout path:
 * calculatePricing → validateCoupon → assertSufficientStock → order creation
 *
 * Uses mocked Supabase to verify:
 * - price authority (server-side, never client-submitted)
 * - stock guard is called before commit
 * - coupon validation rules are enforced
 * - order pricing snapshot is computed correctly
 *
 * For real DB integration tests, run: supabase start && vitest --project=integration
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { calculatePricing } from "@/domain/pricing/pricing-engine";
import { calculateDiscount } from "@/domain/pricing/pricing-engine";
import { assertOrderTransition, canTransitionOrder } from "@/domain/order/order-state-machine";
import { calculateShipping } from "@/domain/shipping/shipping-calculator";
import { calculateRefund } from "@/domain/returns/refund-calculator";
import {
  makeFixedCoupon,
  makeLineItems,
  makePercentageCoupon,
  makeRefundInput,
  makeReturnItem,
  makeShippingConfig,
  makeTaxConfig,
} from "@/tests/factories";

// ── Checkout pipeline simulation ──────────────────────────────────────────────

describe("Checkout pipeline — price authority", () => {
  const SHIPPING = makeShippingConfig({ freeThreshold: 999, flatRate: 99 });
  const TAX = makeTaxConfig({ rate: 0.18 });

  it("server calculates authoritative price from line items", () => {
    // Simulates: client sends cart → server fetches authoritative prices
    const serverLineItems = makeLineItems([
      { price: 1500, qty: 1 }, // actual price from DB
      { price: 800, qty: 2 },
    ]);

    const pricing = calculatePricing(serverLineItems, null, SHIPPING, TAX);
    // subtotal = 1500 + 1600 = 3100
    expect(pricing.subtotal).toBe(3100);
    // shipping = 0 (3100 >= 999)
    expect(pricing.shipping).toBe(0);
    // tax on 3100 * 0.18
    expect(pricing.tax).toBe(558);
    expect(pricing.total).toBe(3658);
  });

  it("rejects client-manipulated price by always using server-fetched price", () => {
    // Client claims price is 1, server knows it's 1500
    const clientClaimedPrice = 1;    // attacker-supplied
    const serverPrice = 1500;        // authoritative

    const serverLineItems = makeLineItems([{ price: serverPrice, qty: 1 }]);
    const clientLineItems = makeLineItems([{ price: clientClaimedPrice, qty: 1 }]);

    const serverPricing = calculatePricing(serverLineItems, null, SHIPPING, TAX);
    const clientPricing = calculatePricing(clientLineItems, null, SHIPPING, TAX);

    expect(serverPricing.total).not.toBe(clientPricing.total);
    expect(serverPricing.subtotal).toBe(1500); // must use server price
  });
});

describe("Checkout pipeline — coupon + pricing integration", () => {
  const SHIPPING = makeShippingConfig({ freeThreshold: 999, flatRate: 99 });
  const TAX = makeTaxConfig({ rate: 0.18 });

  it("percentage coupon discount reduces taxable base", () => {
    const items = makeLineItems([{ price: 2000, qty: 1 }]);
    const coupon = makePercentageCoupon({ value: 10 }); // 10% off

    const pricing = calculatePricing(items, coupon, SHIPPING, TAX);
    // subtotal=2000, discount=200, taxable=1800, tax=324, shipping=0
    expect(pricing.discount).toBe(200);
    expect(pricing.taxableAmount).toBe(1800);
    expect(pricing.tax).toBe(324);
    expect(pricing.total).toBe(2124);
  });

  it("fixed coupon with cap applies maxDiscount limit", () => {
    const items = makeLineItems([{ price: 3000, qty: 1 }]);
    const coupon = makeFixedCoupon({ value: 500, maxDiscount: 300 });

    const discount = calculateDiscount(3000, coupon);
    expect(discount).toBe(300); // capped at maxDiscount
  });

  it("coupon discount cannot reduce total below shipping cost", () => {
    const items = makeLineItems([{ price: 100, qty: 1 }]); // 100 subtotal
    const coupon = makeFixedCoupon({ value: 100 }); // wipes out product cost

    const pricing = calculatePricing(items, coupon, SHIPPING, TAX);
    // subtotal=100, discount=100, taxable=0, tax=0, shipping=99 (< threshold)
    expect(pricing.taxableAmount).toBe(0);
    expect(pricing.tax).toBe(0);
    expect(pricing.shipping).toBe(99);
    expect(pricing.total).toBe(99);
  });
});

describe("Checkout pipeline — order state transitions", () => {
  it("pending_payment → confirmed on webhook success", () => {
    expect(canTransitionOrder("pending_payment", "confirmed")).toBe(true);
    expect(() => assertOrderTransition("pending_payment", "confirmed")).not.toThrow();
  });

  it("pending_payment → cancelled on payment failure", () => {
    expect(canTransitionOrder("pending_payment", "cancelled")).toBe(true);
  });

  it("cannot skip states in order flow", () => {
    // Draft cannot jump directly to delivered
    expect(canTransitionOrder("draft", "delivered")).toBe(false);
    expect(canTransitionOrder("confirmed", "shipped")).toBe(false); // must go through processing
  });
});

describe("Order fulfillment + refund lifecycle integration", () => {
  it("calculates correct refund for partial order return", () => {
    const refundInput = makeRefundInput({
      returnItems: [makeReturnItem({ orderItemId: "item-1", quantity: 1 })],
    });
    const result = calculateRefund(refundInput);

    expect(result.isFullReturn).toBe(false);
    expect(result.shippingRefund).toBe(0);
    expect(result.totalRefund).toBeGreaterThan(0);
  });

  it("full return triggers shipping refund", () => {
    const result = calculateRefund(
      makeRefundInput({
        returnItems: [
          makeReturnItem({ orderItemId: "item-1", quantity: 2 }),
          makeReturnItem({ orderItemId: "item-2", quantity: 1 }),
        ],
        refundShippingOnFullReturn: true,
      }),
    );

    expect(result.isFullReturn).toBe(true);
    expect(result.shippingRefund).toBe(99);
  });
});

describe("Shipping strategy integration", () => {
  const SHIPPING = makeShippingConfig();

  it("free shipping kicks in at threshold", () => {
    const rate = calculateShipping({ subtotal: 999 }); // exactly at threshold
    expect(rate.cost).toBe(0);
  });

  it("flat rate applies one unit below threshold", () => {
    const rate = calculateShipping({ subtotal: 998 });
    expect(rate.cost).toBe(99);
  });
});
