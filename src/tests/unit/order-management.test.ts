import { describe, expect, it } from "vitest";

import {
  CANCELLABLE_ORDER_STATUSES,
  assertOrderTransition,
  assertReturnTransition,
  canTransitionOrder,
  canTransitionRefund,
  canTransitionReplacement,
  canTransitionReturn,
  getValidOrderNextStates,
  isOrderCancellable,
  isOrderTerminal,
  type OrderStatus,
  type RefundStatus,
  type ReplacementStatus,
  type ReturnStatus,
} from "@/domain/order/order-state-machine";
import {
  calculateRefund,
  maxRefundable,
} from "@/domain/order/refund-calculator";
import { AppError } from "@/lib/errors";

// ── Order state machine ────────────────────────────────────────────────────────

describe("canTransitionOrder", () => {
  it("allows draft → pending", () => {
    expect(canTransitionOrder("draft", "pending")).toBe(true);
  });

  it("allows confirmed → processing", () => {
    expect(canTransitionOrder("confirmed", "processing")).toBe(true);
  });

  it("allows shipped → out_for_delivery", () => {
    expect(canTransitionOrder("shipped", "out_for_delivery")).toBe(true);
  });

  it("allows delivered → return_requested", () => {
    expect(canTransitionOrder("delivered", "return_requested")).toBe(true);
  });

  it("allows returned → refunded", () => {
    expect(canTransitionOrder("returned", "refunded")).toBe(true);
  });

  it("allows replacement_approved → replacement_shipped", () => {
    expect(canTransitionOrder("replacement_approved", "replacement_shipped")).toBe(true);
  });

  it("allows refund_processing → partially_refunded", () => {
    expect(canTransitionOrder("refund_processing", "partially_refunded")).toBe(true);
  });

  it("allows failed → pending_payment (retry)", () => {
    expect(canTransitionOrder("failed", "pending_payment")).toBe(true);
  });

  it("rejects refunded → any", () => {
    expect(canTransitionOrder("refunded", "pending")).toBe(false);
    expect(canTransitionOrder("refunded", "cancelled")).toBe(false);
  });

  it("rejects replacement_rejected → any (terminal)", () => {
    expect(canTransitionOrder("replacement_rejected", "replacement_approved")).toBe(false);
  });

  it("rejects return_rejected → any (terminal)", () => {
    expect(canTransitionOrder("return_rejected", "return_approved")).toBe(false);
  });

  it("rejects backward jump: delivered → pending", () => {
    expect(canTransitionOrder("delivered", "pending")).toBe(false);
  });

  it("rejects skipping states: pending → shipped", () => {
    expect(canTransitionOrder("pending", "shipped")).toBe(false);
  });
});

describe("assertOrderTransition", () => {
  it("does not throw on valid transition", () => {
    expect(() => assertOrderTransition("confirmed", "processing")).not.toThrow();
  });

  it("throws AppError on invalid transition", () => {
    expect(() => assertOrderTransition("refunded", "pending")).toThrow(AppError);
  });

  it("error has code INVALID_STATE_TRANSITION", () => {
    let caught: AppError | null = null;
    try {
      assertOrderTransition("delivered", "pending");
    } catch (e) {
      caught = e as AppError;
    }
    expect(caught?.code).toBe("INVALID_STATE_TRANSITION");
    expect(caught?.statusCode).toBe(409);
  });
});

describe("isOrderCancellable", () => {
  const cancellable: OrderStatus[] = [
    "draft", "pending", "pending_payment", "confirmed", "processing", "packed", "shipped",
  ];
  const nonCancellable: OrderStatus[] = [
    "delivered", "refunded", "cancelled", "returned", "replacement_delivered",
  ];

  it.each(cancellable)("returns true for %s", (status) => {
    expect(isOrderCancellable(status)).toBe(true);
  });

  it.each(nonCancellable)("returns false for %s", (status) => {
    expect(isOrderCancellable(status)).toBe(false);
  });

  it("matches CANCELLABLE_ORDER_STATUSES array", () => {
    for (const s of CANCELLABLE_ORDER_STATUSES) {
      expect(isOrderCancellable(s)).toBe(true);
    }
  });
});

describe("isOrderTerminal", () => {
  const terminals: OrderStatus[] = [
    "refunded", "return_rejected", "replacement_rejected", "replacement_delivered",
  ];

  it.each(terminals)("returns true for terminal status: %s", (status) => {
    expect(isOrderTerminal(status)).toBe(true);
  });

  it("returns false for non-terminal status: delivered", () => {
    expect(isOrderTerminal("delivered")).toBe(false);
  });
});

describe("getValidOrderNextStates", () => {
  it("returns correct next states for processing", () => {
    const next = getValidOrderNextStates("processing");
    expect(next).toContain("packed");
    expect(next).toContain("shipped");
    expect(next).toContain("cancelled");
  });

  it("returns empty array for refunded", () => {
    expect(getValidOrderNextStates("refunded")).toHaveLength(0);
  });
});

// ── Return state machine ───────────────────────────────────────────────────────

describe("canTransitionReturn", () => {
  it("allows requested → approved", () => {
    expect(canTransitionReturn("requested", "approved")).toBe(true);
  });

  it("allows requested → rejected (admin reject)", () => {
    expect(canTransitionReturn("requested", "rejected")).toBe(true);
  });

  it("allows accepted → refunded", () => {
    expect(canTransitionReturn("accepted", "refunded")).toBe(true);
  });

  it("allows accepted → replaced", () => {
    expect(canTransitionReturn("accepted", "replaced")).toBe(true);
  });

  it("rejects rejected → approved (terminal)", () => {
    expect(canTransitionReturn("rejected", "approved")).toBe(false);
  });

  it("rejects closed → any (terminal)", () => {
    expect(canTransitionReturn("closed", "requested")).toBe(false);
  });
});

describe("assertReturnTransition", () => {
  it("throws on invalid return transition", () => {
    expect(() => assertReturnTransition("rejected", "approved")).toThrow(AppError);
  });
});

// ── Replacement state machine ─────────────────────────────────────────────────

describe("canTransitionReplacement", () => {
  const validFlow: [ReplacementStatus, ReplacementStatus][] = [
    ["requested", "approved"],
    ["approved", "processing"],
    ["processing", "shipped"],
    ["shipped", "delivered"],
  ];

  it.each(validFlow)("allows %s → %s", (from, to) => {
    expect(canTransitionReplacement(from, to)).toBe(true);
  });

  it("allows requested → rejected", () => {
    expect(canTransitionReplacement("requested", "rejected")).toBe(true);
  });

  it("rejects delivered → any (terminal)", () => {
    expect(canTransitionReplacement("delivered", "shipped")).toBe(false);
  });
});

// ── Refund state machine ───────────────────────────────────────────────────────

describe("canTransitionRefund", () => {
  const validFlow: [RefundStatus, RefundStatus][] = [
    ["pending", "processing"],
    ["processing", "succeeded"],
    ["processing", "failed"],
    ["failed", "pending"],
  ];

  it.each(validFlow)("allows %s → %s", (from, to) => {
    expect(canTransitionRefund(from, to)).toBe(true);
  });

  it("rejects succeeded → any (terminal)", () => {
    expect(canTransitionRefund("succeeded", "pending")).toBe(false);
  });
});

// ── Return state machine full flow ────────────────────────────────────────────

describe("ReturnStatus full happy path", () => {
  const flow: ReturnStatus[] = [
    "requested", "approved", "in_transit", "received", "inspected", "accepted", "refunded", "closed",
  ];

  it("each step in the happy path is a valid transition", () => {
    for (let i = 0; i < flow.length - 1; i++) {
      expect(canTransitionReturn(flow[i], flow[i + 1])).toBe(true);
    }
  });
});

// ── Refund calculator ─────────────────────────────────────────────────────────

describe("calculateRefund", () => {
  const baseOrder = {
    orderSubtotal: 1000,
    orderShipping: 50,
    orderTax:      180,
    orderTotal:    1230,
  };

  const items = [
    { orderItemId: "item-1", quantity: 2, unitPrice: 300 },
    { orderItemId: "item-2", quantity: 1, unitPrice: 400 },
  ];

  it("calculates full refund for all items", () => {
    const result = calculateRefund({
      ...baseOrder,
      items,
      refundItems:    [{ orderItemId: "item-1", quantity: 2 }, { orderItemId: "item-2", quantity: 1 }],
      refundShipping: true,
    });

    expect(result.itemsTotal).toBe(1000); // 2*300 + 1*400
    expect(result.shippingRefund).toBe(50);
    expect(result.taxRefund).toBe(180);
    expect(result.refundType).toBe("full");
    expect(result.totalRefund).toBeCloseTo(1230, 2);
  });

  it("calculates partial refund for one item", () => {
    const result = calculateRefund({
      ...baseOrder,
      items,
      refundItems:    [{ orderItemId: "item-1", quantity: 1 }],
      refundShipping: false,
    });

    expect(result.itemsTotal).toBe(300);
    expect(result.shippingRefund).toBe(0);
    expect(result.refundType).toBe("partial");
    // Tax is proportional: 300/1000 * 180 = 54
    expect(result.taxRefund).toBeCloseTo(54, 2);
    expect(result.totalRefund).toBeCloseTo(354, 2);
  });

  it("caps refund at order total", () => {
    const result = calculateRefund({
      ...baseOrder,
      items,
      refundItems:    [{ orderItemId: "item-1", quantity: 2 }, { orderItemId: "item-2", quantity: 1 }],
      refundShipping: true,
    });

    expect(result.totalRefund).toBeLessThanOrEqual(baseOrder.orderTotal);
  });

  it("throws when refund quantity exceeds available quantity", () => {
    expect(() =>
      calculateRefund({
        ...baseOrder,
        items: [{ orderItemId: "item-1", quantity: 2, unitPrice: 300 }],
        refundItems: [{ orderItemId: "item-1", quantity: 3 }],
      })
    ).toThrow("Cannot refund 3");
  });

  it("respects already-returned quantity", () => {
    const itemsWithReturn = [{ orderItemId: "item-1", quantity: 2, unitPrice: 300, returnedQuantity: 1 }];
    const result = calculateRefund({
      ...baseOrder,
      items:       itemsWithReturn,
      refundItems: [{ orderItemId: "item-1", quantity: 1 }],
    });
    expect(result.itemsTotal).toBe(300);
  });

  it("throws when refunding more than remaining after prior return", () => {
    const itemsWithReturn = [{ orderItemId: "item-1", quantity: 2, unitPrice: 300, returnedQuantity: 1 }];
    expect(() =>
      calculateRefund({
        ...baseOrder,
        items:       itemsWithReturn,
        refundItems: [{ orderItemId: "item-1", quantity: 2 }],
      })
    ).toThrow("only 1 refundable");
  });

  it("returns empty lines for zero-quantity selection", () => {
    const result = calculateRefund({
      ...baseOrder,
      items,
      refundItems: [],
    });
    expect(result.lines).toHaveLength(0);
    expect(result.totalRefund).toBe(0);
  });

  it("classifies shipping-only refund correctly", () => {
    const result = calculateRefund({
      ...baseOrder,
      items,
      refundItems:    [],
      refundShipping: true,
    });
    expect(result.refundType).toBe("shipping");
    expect(result.totalRefund).toBe(50);
  });
});

describe("maxRefundable", () => {
  it("returns full total when nothing refunded yet", () => {
    expect(maxRefundable(1000, 0)).toBe(1000);
  });

  it("returns remainder after partial refund", () => {
    expect(maxRefundable(1000, 300)).toBe(700);
  });

  it("returns 0 when fully refunded", () => {
    expect(maxRefundable(1000, 1000)).toBe(0);
  });

  it("clamps to 0 when over-refunded (should not happen, but safe)", () => {
    expect(maxRefundable(1000, 1100)).toBe(0);
  });
});
