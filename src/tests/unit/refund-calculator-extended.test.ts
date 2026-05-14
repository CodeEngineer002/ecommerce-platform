/**
 * Unit tests — Refund Calculator (extended)
 *
 * Extends existing refund-calculator.test.ts with:
 * - zero-value items
 * - all-items partial return quantity matching
 * - multiple simultaneous return items
 * - high restocking fee scenarios
 * - zero tax rate
 * - mixed item sizes
 */
import { describe, expect, it } from "vitest";

import { calculateRefund } from "@/domain/returns/refund-calculator";
import {
  makeRefundInput,
  makeRefundOrderItem,
  makeReturnItem,
} from "@/tests/factories";

describe("calculateRefund — multiple simultaneous returns", () => {
  it("processes two items returned simultaneously", () => {
    const result = calculateRefund({
      ...makeRefundInput(),
      returnItems: [
        makeReturnItem({ orderItemId: "item-1", quantity: 1 }),
        makeReturnItem({ orderItemId: "item-2", quantity: 1 }),
      ],
    });
    expect(result.lineItems).toHaveLength(2);
    expect(result.subtotalRefund).toBe(500 + 300); // 800
  });

  it("calculates correct total for multi-item partial return", () => {
    const result = calculateRefund({
      ...makeRefundInput(),
      returnItems: [
        makeReturnItem({ orderItemId: "item-1", quantity: 1 }),
        makeReturnItem({ orderItemId: "item-2", quantity: 1 }),
      ],
    });
    // netSubtotal = 800, tax = 800*0.18 = 144, no shipping (not full)
    expect(result.taxRefund).toBe(144);
    expect(result.shippingRefund).toBe(0);
    expect(result.totalRefund).toBe(800 + 144);
  });
});

describe("calculateRefund — restocking fee edge cases", () => {
  it("0% restocking fee has no impact", () => {
    const result = calculateRefund({
      ...makeRefundInput(),
      returnItems: [makeReturnItem({ orderItemId: "item-1", quantity: 1 })],
      restockingFeeRate: 0,
    });
    expect(result.restockingFeeTotal).toBe(0);
    expect(result.lineItems[0].restockingFee).toBe(0);
    expect(result.lineItems[0].netRefund).toBe(500);
  });

  it("100% restocking fee results in zero net refund per line", () => {
    const result = calculateRefund({
      ...makeRefundInput(),
      returnItems: [makeReturnItem({ orderItemId: "item-1", quantity: 1 })],
      restockingFeeRate: 1.0,
    });
    // gross = 500, fee = 500, net = 0
    expect(result.lineItems[0].netRefund).toBe(0);
    expect(result.totalRefund).toBeGreaterThanOrEqual(0);
  });
});

describe("calculateRefund — unknown orderItemId is silently skipped", () => {
  it("skips items not found in orderItems array", () => {
    const result = calculateRefund({
      ...makeRefundInput(),
      returnItems: [makeReturnItem({ orderItemId: "does-not-exist", quantity: 1 })],
    });
    expect(result.lineItems).toHaveLength(0);
    expect(result.totalRefund).toBe(0);
  });
});

describe("calculateRefund — zero tax rate", () => {
  it("produces zero tax refund when tax rate is 0", () => {
    const result = calculateRefund({
      ...makeRefundInput({ orderTaxRate: 0 }),
      returnItems: [makeReturnItem({ orderItemId: "item-1", quantity: 1 })],
    });
    expect(result.taxRefund).toBe(0);
    expect(result.totalRefund).toBe(500); // only item refund
  });
});

describe("calculateRefund — full return boundary", () => {
  it("isFullReturn is true only when all quantities are returned", () => {
    const fullReturn = calculateRefund({
      ...makeRefundInput(),
      returnItems: [
        makeReturnItem({ orderItemId: "item-1", quantity: 2 }), // ordered qty: 2
        makeReturnItem({ orderItemId: "item-2", quantity: 1 }), // ordered qty: 1
      ],
    });
    expect(fullReturn.isFullReturn).toBe(true);

    const partialReturn = calculateRefund({
      ...makeRefundInput(),
      returnItems: [makeReturnItem({ orderItemId: "item-1", quantity: 1 })], // only 1 of 2
    });
    expect(partialReturn.isFullReturn).toBe(false);
  });

  it("does not refund shipping on full return when flag is false", () => {
    const result = calculateRefund({
      ...makeRefundInput({ refundShippingOnFullReturn: false }),
      returnItems: [
        makeReturnItem({ orderItemId: "item-1", quantity: 2 }),
        makeReturnItem({ orderItemId: "item-2", quantity: 1 }),
      ],
    });
    expect(result.isFullReturn).toBe(true);
    expect(result.shippingRefund).toBe(0);
  });
});

describe("calculateRefund — unit price computation", () => {
  it("uses unitPrice from orderItem (not total/quantity derived)", () => {
    const orderItems = [makeRefundOrderItem({ id: "item-A", quantity: 3, unitPrice: 200, total: 600 })];
    const result = calculateRefund({
      orderSubtotal: 600,
      orderShipping: 0,
      orderTaxRate: 0.18,
      orderItems,
      returnItems: [makeReturnItem({ orderItemId: "item-A", quantity: 1 })],
    });
    expect(result.lineItems[0].unitPrice).toBe(200);
    expect(result.subtotalRefund).toBe(200);
  });
});
