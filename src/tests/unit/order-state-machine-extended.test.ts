/**
 * Unit tests — Order State Machine (extended)
 *
 * Extends the existing order-state-machine.test.ts with:
 * - Payment lifecycle state machine
 * - Fulfillment lifecycle state machine
 * - Complete transition matrix coverage
 * - Legacy alias backward-compat
 */
import { describe, expect, it } from "vitest";

import {
  // Order
  canTransitionOrder,
  assertOrderTransition,
  getValidOrderNextStates,
  isOrderCancellable,
  isOrderTerminal,
  CANCELLABLE_ORDER_STATUSES,
  type OrderStatus,
  // Payment
  canTransitionPayment,
  assertPaymentTransition,
  type PaymentLifecycleStatus,
  // Fulfillment
  canTransitionFulfillment,
  assertFulfillmentTransition,
  type FulfillmentStatus,
  // Legacy aliases
  canTransition,
  assertTransition,
  getValidNextStates,
  isCancellable,
  isTerminal,
} from "@/domain/order/order-state-machine";

// ── Payment State Machine ─────────────────────────────────────────────────────

describe("Payment state machine — valid transitions", () => {
  const valid: Array<[PaymentLifecycleStatus, PaymentLifecycleStatus]> = [
    ["unpaid", "pending"],
    ["pending", "authorized"],
    ["pending", "paid"],
    ["pending", "failed"],
    ["authorized", "paid"],
    ["authorized", "failed"],
    ["paid", "refunded"],
    ["paid", "partially_refunded"],
    ["failed", "pending"],
    ["partially_refunded", "refunded"],
  ];
  for (const [from, to] of valid) {
    it(`${from} → ${to}`, () => expect(canTransitionPayment(from, to)).toBe(true));
  }
});

describe("Payment state machine — invalid transitions", () => {
  const invalid: Array<[PaymentLifecycleStatus, PaymentLifecycleStatus]> = [
    ["refunded", "paid"],
    ["refunded", "pending"],
    ["paid", "failed"],
    ["authorized", "unpaid"],
  ];
  for (const [from, to] of invalid) {
    it(`${from} → ${to} (blocked)`, () => expect(canTransitionPayment(from, to)).toBe(false));
  }
});

describe("assertPaymentTransition", () => {
  it("does not throw for valid transition", () => {
    expect(() => assertPaymentTransition("pending", "paid")).not.toThrow();
  });

  it("throws AppError for invalid transition", () => {
    expect(() => assertPaymentTransition("refunded", "paid")).toThrow(/Cannot transition payment/);
  });
});

// ── Fulfillment State Machine ─────────────────────────────────────────────────

describe("Fulfillment state machine — valid transitions", () => {
  const valid: Array<[FulfillmentStatus, FulfillmentStatus]> = [
    ["unfulfilled", "processing"],
    ["processing", "partially_fulfilled"],
    ["processing", "fulfilled"],
    ["processing", "failed"],
    ["partially_fulfilled", "fulfilled"],
    ["partially_fulfilled", "failed"],
    ["fulfilled", "shipped"],
    ["shipped", "delivered"],
    ["shipped", "failed"],
    ["failed", "processing"],
  ];
  for (const [from, to] of valid) {
    it(`${from} → ${to}`, () => expect(canTransitionFulfillment(from, to)).toBe(true));
  }
});

describe("Fulfillment state machine — invalid transitions", () => {
  const invalid: Array<[FulfillmentStatus, FulfillmentStatus]> = [
    ["delivered", "shipped"],
    ["delivered", "failed"],
    ["unfulfilled", "delivered"],
    ["fulfilled", "unfulfilled"],
  ];
  for (const [from, to] of invalid) {
    it(`${from} → ${to} (blocked)`, () => expect(canTransitionFulfillment(from, to)).toBe(false));
  }
});

describe("assertFulfillmentTransition", () => {
  it("does not throw for valid transition", () => {
    expect(() => assertFulfillmentTransition("processing", "fulfilled")).not.toThrow();
  });

  it("throws AppError for invalid transition", () => {
    expect(() => assertFulfillmentTransition("delivered", "processing")).toThrow(
      /Cannot transition fulfillment/,
    );
  });
});

// ── Order terminal + cancellable ──────────────────────────────────────────────

describe("CANCELLABLE_ORDER_STATUSES invariants", () => {
  it("includes draft, pending, pending_payment, confirmed, processing, shipped", () => {
    const cancellable = CANCELLABLE_ORDER_STATUSES as readonly string[];
    for (const s of ["draft", "pending", "pending_payment", "confirmed", "processing", "shipped"]) {
      expect(cancellable).toContain(s);
    }
  });

  it("does not include delivered or refunded", () => {
    const cancellable = CANCELLABLE_ORDER_STATUSES as readonly string[];
    expect(cancellable).not.toContain("delivered");
    expect(cancellable).not.toContain("refunded");
  });
});

describe("isOrderTerminal", () => {
  it("refunded is terminal", () => expect(isOrderTerminal("refunded")).toBe(true));
  it("failed is terminal (retry requires a new order)", () => expect(isOrderTerminal("failed")).toBe(true));
  it("delivered is NOT terminal", () => expect(isOrderTerminal("delivered")).toBe(false));
  it("processing is NOT terminal", () => expect(isOrderTerminal("processing")).toBe(false));
});

describe("getValidOrderNextStates", () => {
  it("draft can go to pending, pending_payment, or cancelled", () => {
    const next = getValidOrderNextStates("draft");
    expect(next).toContain("pending_payment");
    expect(next).toContain("cancelled");
  });

  it("refunded returns empty array (terminal)", () => {
    expect(getValidOrderNextStates("refunded")).toHaveLength(0);
  });
});

// ── Legacy alias backward compat ──────────────────────────────────────────────

describe("Legacy alias exports", () => {
  it("canTransition is canTransitionOrder", () => {
    expect(canTransition("confirmed", "processing")).toBe(canTransitionOrder("confirmed", "processing"));
  });

  it("assertTransition is assertOrderTransition", () => {
    expect(() => assertTransition("confirmed", "processing")).not.toThrow();
  });

  it("getValidNextStates is getValidOrderNextStates", () => {
    expect(getValidNextStates("confirmed")).toEqual(getValidOrderNextStates("confirmed"));
  });

  it("isCancellable is isOrderCancellable", () => {
    expect(isCancellable("confirmed")).toBe(isOrderCancellable("confirmed"));
  });

  it("isTerminal is isOrderTerminal", () => {
    expect(isTerminal("refunded")).toBe(isOrderTerminal("refunded"));
  });
});
