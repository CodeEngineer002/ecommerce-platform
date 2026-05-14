import { describe, expect, it } from "vitest";

import {
  assertFulfillmentTransition,
  assertOrderTransition,
  assertPaymentTransition,
  canTransitionFulfillment,
  canTransitionOrder,
  canTransitionPayment,
  getValidOrderNextStates,
  isCancellable,
  isOrderCancellable,
  isOrderTerminal,
  isTerminal,
} from "@/domain/order/order-state-machine";

describe("Order state machine", () => {
  describe("canTransitionOrder — valid transitions", () => {
    it("draft → pending_payment", () => expect(canTransitionOrder("draft", "pending_payment")).toBe(true));
    it("pending_payment → confirmed", () => expect(canTransitionOrder("pending_payment", "confirmed")).toBe(true));
    it("pending_payment → cancelled", () => expect(canTransitionOrder("pending_payment", "cancelled")).toBe(true));
    it("confirmed → processing", () => expect(canTransitionOrder("confirmed", "processing")).toBe(true));
    it("confirmed → cancelled", () => expect(canTransitionOrder("confirmed", "cancelled")).toBe(true));
    it("processing → shipped", () => expect(canTransitionOrder("processing", "shipped")).toBe(true));
    it("processing → cancelled", () => expect(canTransitionOrder("processing", "cancelled")).toBe(true));
    it("shipped → delivered", () => expect(canTransitionOrder("shipped", "delivered")).toBe(true));
    it("delivered → refunded", () => expect(canTransitionOrder("delivered", "refunded")).toBe(true));
    it("delivered → partially_returned", () => expect(canTransitionOrder("delivered", "partially_returned")).toBe(true));
    it("delivered → partially_refunded", () => expect(canTransitionOrder("delivered", "partially_refunded")).toBe(true));
    it("partially_returned → refunded", () => expect(canTransitionOrder("partially_returned", "refunded")).toBe(true));
    it("cancelled → refunded", () => expect(canTransitionOrder("cancelled", "refunded")).toBe(true));
  });

  describe("canTransitionOrder — invalid transitions", () => {
    it("delivered → cancelled (blocked after delivery)", () => {
      expect(canTransitionOrder("delivered", "cancelled")).toBe(false);
    });
    it("refunded → anything (terminal)", () => {
      expect(canTransitionOrder("refunded", "cancelled")).toBe(false);
      expect(canTransitionOrder("refunded", "pending")).toBe(false);
    });
    it("processing → delivered (must go through shipped)", () => {
      expect(canTransitionOrder("processing", "delivered")).toBe(false);
    });
    it("confirmed → shipped (must go through processing)", () => {
      expect(canTransitionOrder("confirmed", "shipped")).toBe(false);
    });
    it("pending → delivered (invalid skip)", () => {
      expect(canTransitionOrder("pending", "delivered")).toBe(false);
    });
  });

  describe("assertOrderTransition", () => {
    it("does not throw on valid transition", () => {
      expect(() => assertOrderTransition("confirmed", "processing")).not.toThrow();
    });

    it("throws on invalid transition", () => {
      expect(() => assertOrderTransition("delivered", "cancelled")).toThrow(/Cannot transition/);
    });
  });

  describe("isOrderTerminal", () => {
    it("refunded is terminal", () => expect(isOrderTerminal("refunded")).toBe(true));
    it("delivered is not terminal", () => expect(isOrderTerminal("delivered")).toBe(false));
    it("cancelled is not terminal (can still refund)", () => expect(isOrderTerminal("cancelled")).toBe(false));
  });

  describe("isOrderCancellable", () => {
    it("pending is cancellable", () => expect(isOrderCancellable("pending")).toBe(true));
    it("confirmed is cancellable", () => expect(isOrderCancellable("confirmed")).toBe(true));
    it("shipped is cancellable", () => expect(isOrderCancellable("shipped")).toBe(true));
    it("delivered is NOT cancellable", () => expect(isOrderCancellable("delivered")).toBe(false));
    it("refunded is NOT cancellable", () => expect(isOrderCancellable("refunded")).toBe(false));
  });

  describe("getValidOrderNextStates", () => {
    it("returns empty array for terminal state", () => {
      expect(getValidOrderNextStates("refunded")).toEqual([]);
    });

    it("returns correct next states for pending", () => {
      const states = getValidOrderNextStates("pending");
      expect(states).toContain("confirmed");
      expect(states).toContain("cancelled");
    });
  });

  describe("legacy compat exports", () => {
    it("isCancellable still works", () => expect(isCancellable("confirmed")).toBe(true));
    it("isTerminal still works", () => expect(isTerminal("refunded")).toBe(true));
  });
});

describe("Payment lifecycle state machine", () => {
  it("unpaid → pending is valid", () => expect(canTransitionPayment("unpaid", "pending")).toBe(true));
  it("pending → paid is valid", () => expect(canTransitionPayment("pending", "paid")).toBe(true));
  it("pending → failed is valid", () => expect(canTransitionPayment("pending", "failed")).toBe(true));
  it("failed → pending allows retry", () => expect(canTransitionPayment("failed", "pending")).toBe(true));
  it("paid → refunded is valid", () => expect(canTransitionPayment("paid", "refunded")).toBe(true));
  it("refunded → anything is invalid (terminal)", () => {
    expect(canTransitionPayment("refunded", "pending")).toBe(false);
    expect(canTransitionPayment("refunded", "paid")).toBe(false);
  });

  it("assertPaymentTransition throws on invalid", () => {
    expect(() => assertPaymentTransition("refunded", "pending")).toThrow();
  });
});

describe("Fulfillment state machine", () => {
  it("unfulfilled → processing is valid", () => {
    expect(canTransitionFulfillment("unfulfilled", "processing")).toBe(true);
  });
  it("shipped → delivered is valid", () => {
    expect(canTransitionFulfillment("shipped", "delivered")).toBe(true);
  });
  it("delivered → anything is invalid (terminal)", () => {
    expect(canTransitionFulfillment("delivered", "shipped")).toBe(false);
  });
  it("failed → processing allows retry", () => {
    expect(canTransitionFulfillment("failed", "processing")).toBe(true);
  });
  it("assertFulfillmentTransition throws on invalid", () => {
    expect(() => assertFulfillmentTransition("delivered", "failed")).toThrow();
  });
});
