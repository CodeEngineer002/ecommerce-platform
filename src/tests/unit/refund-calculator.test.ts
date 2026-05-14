import { describe, expect, it } from "vitest";

import { calculateRefund } from "@/domain/returns/refund-calculator";
import type { RefundCalculationInput } from "@/domain/returns/refund-calculator";

const baseOrderItems = [
  { id: "item-1", quantity: 2, unitPrice: 500, total: 1000 },
  { id: "item-2", quantity: 1, unitPrice: 300, total: 300 },
];

const baseInput: RefundCalculationInput = {
  orderSubtotal: 1300,
  orderShipping: 99,
  orderTaxRate: 0.18,
  orderItems: baseOrderItems,
  returnItems: [],
};

describe("calculateRefund", () => {
  it("returns zero total for empty return items", () => {
    const result = calculateRefund(baseInput);
    expect(result.totalRefund).toBe(0);
    expect(result.lineItems).toHaveLength(0);
  });

  it("calculates refund for a partial return (1 of 2 quantity)", () => {
    const result = calculateRefund({
      ...baseInput,
      returnItems: [{ orderItemId: "item-1", quantity: 1 }],
    });
    // returning 1 unit of item-1 at ₹500
    expect(result.subtotalRefund).toBe(500);
    expect(result.taxRefund).toBe(90); // 500 * 0.18
    expect(result.shippingRefund).toBe(0); // partial return, no shipping refund
    expect(result.totalRefund).toBe(590);
    expect(result.isFullReturn).toBe(false);
  });

  it("refunds shipping on full return", () => {
    const result = calculateRefund({
      ...baseInput,
      returnItems: [
        { orderItemId: "item-1", quantity: 2 },
        { orderItemId: "item-2", quantity: 1 },
      ],
      refundShippingOnFullReturn: true,
    });
    expect(result.isFullReturn).toBe(true);
    expect(result.shippingRefund).toBe(99);
  });

  it("does not refund shipping on partial return even with flag", () => {
    const result = calculateRefund({
      ...baseInput,
      returnItems: [{ orderItemId: "item-1", quantity: 1 }],
      refundShippingOnFullReturn: true,
    });
    expect(result.shippingRefund).toBe(0);
  });

  it("applies restocking fee", () => {
    const result = calculateRefund({
      ...baseInput,
      returnItems: [{ orderItemId: "item-1", quantity: 2 }],
      restockingFeeRate: 0.1, // 10%
    });
    // gross = 1000, fee = 100, net = 900
    expect(result.restockingFeeTotal).toBe(100);
    expect(result.lineItems[0].netRefund).toBe(900);
    // tax on net = 900 * 0.18 = 162
    expect(result.taxRefund).toBe(162);
  });

  it("caps return quantity at ordered quantity", () => {
    const result = calculateRefund({
      ...baseInput,
      returnItems: [{ orderItemId: "item-2", quantity: 99 }], // ordered only 1
    });
    expect(result.lineItems[0].quantity).toBe(1); // capped at 1
  });

  it("totalRefund is never negative", () => {
    const result = calculateRefund({
      ...baseInput,
      orderTaxRate: 0,
      returnItems: [{ orderItemId: "item-1", quantity: 1 }],
      restockingFeeRate: 1.0, // 100% restocking fee (extreme case)
    });
    expect(result.totalRefund).toBeGreaterThanOrEqual(0);
  });

  it("ignores return items not in order", () => {
    const result = calculateRefund({
      ...baseInput,
      returnItems: [{ orderItemId: "nonexistent-item", quantity: 1 }],
    });
    expect(result.lineItems).toHaveLength(0);
    expect(result.totalRefund).toBe(0);
  });
});
