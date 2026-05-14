/**
 * Unit tests — cart state machine
 */

import { describe, expect, it } from "vitest";

import {
  CartAlreadyConvertedError,
  CartExpiredError,
  CartNotActiveError,
} from "@/domain/cart/errors";
import {
  MUTABLE_CART_STATUSES,
  TERMINAL_CART_STATUSES,
  assertCartMutable,
  assertCartTransition,
  canTransitionCart,
  getValidCartNextStates,
  isCartMutable,
  isCartTerminal,
} from "@/domain/cart/cart-state-machine";
import type { CartStatus } from "@/domain/cart/types";

const ALL_STATUSES: CartStatus[] = [
  "active",
  "abandoned",
  "expired",
  "merged",
  "converted",
  "deleted",
];

describe("canTransitionCart", () => {
  it("allows active → abandoned", () => {
    expect(canTransitionCart("active", "abandoned")).toBe(true);
  });

  it("allows active → converted", () => {
    expect(canTransitionCart("active", "converted")).toBe(true);
  });

  it("allows abandoned → active (re-activation)", () => {
    expect(canTransitionCart("abandoned", "active")).toBe(true);
  });

  it("allows expired → deleted only", () => {
    expect(canTransitionCart("expired", "deleted")).toBe(true);
    expect(canTransitionCart("expired", "active")).toBe(false);
    expect(canTransitionCart("expired", "abandoned")).toBe(false);
    expect(canTransitionCart("expired", "converted")).toBe(false);
  });

  it("allows no transitions from converted (terminal)", () => {
    for (const to of ALL_STATUSES) {
      expect(canTransitionCart("converted", to)).toBe(false);
    }
  });

  it("allows no transitions from deleted (terminal)", () => {
    for (const to of ALL_STATUSES) {
      expect(canTransitionCart("deleted", to)).toBe(false);
    }
  });

  it("allows merged → deleted only", () => {
    expect(canTransitionCart("merged", "deleted")).toBe(true);
    expect(canTransitionCart("merged", "active")).toBe(false);
  });
});

describe("assertCartTransition", () => {
  it("does not throw for valid transitions", () => {
    expect(() => assertCartTransition("active", "converted")).not.toThrow();
    expect(() => assertCartTransition("abandoned", "active")).not.toThrow();
  });

  it("throws CartNotActiveError for invalid transitions", () => {
    expect(() => assertCartTransition("converted", "active")).toThrow(CartNotActiveError);
    expect(() => assertCartTransition("deleted", "active")).toThrow(CartNotActiveError);
    expect(() => assertCartTransition("expired", "active")).toThrow(CartNotActiveError);
  });
});

describe("assertCartMutable", () => {
  it("does not throw for active status", () => {
    expect(() => assertCartMutable("active")).not.toThrow();
  });

  it("throws CartAlreadyConvertedError for converted", () => {
    expect(() => assertCartMutable("converted")).toThrow(CartAlreadyConvertedError);
  });

  it("throws CartExpiredError for expired", () => {
    expect(() => assertCartMutable("expired")).toThrow(CartExpiredError);
  });

  it("throws CartNotActiveError for abandoned, merged, deleted", () => {
    expect(() => assertCartMutable("abandoned")).toThrow(CartNotActiveError);
    expect(() => assertCartMutable("merged")).toThrow(CartNotActiveError);
    expect(() => assertCartMutable("deleted")).toThrow(CartNotActiveError);
  });
});

describe("isCartMutable", () => {
  it("returns true only for active", () => {
    expect(isCartMutable("active")).toBe(true);
    for (const s of ALL_STATUSES.filter((s) => s !== "active")) {
      expect(isCartMutable(s)).toBe(false);
    }
  });
});

describe("isCartTerminal", () => {
  it("returns true for converted and deleted", () => {
    expect(isCartTerminal("converted")).toBe(true);
    expect(isCartTerminal("deleted")).toBe(true);
  });

  it("returns false for non-terminal statuses", () => {
    for (const s of ALL_STATUSES.filter((s) => !["converted", "deleted"].includes(s))) {
      expect(isCartTerminal(s)).toBe(false);
    }
  });
});

describe("MUTABLE_CART_STATUSES", () => {
  it("contains only active", () => {
    expect(MUTABLE_CART_STATUSES).toEqual(["active"]);
  });
});

describe("TERMINAL_CART_STATUSES", () => {
  it("contains converted and deleted", () => {
    expect(TERMINAL_CART_STATUSES).toContain("converted");
    expect(TERMINAL_CART_STATUSES).toContain("deleted");
    expect(TERMINAL_CART_STATUSES).toHaveLength(2);
  });
});

describe("getValidCartNextStates", () => {
  it("returns correct next states for active", () => {
    const next = getValidCartNextStates("active");
    expect(next).toContain("abandoned");
    expect(next).toContain("converted");
    expect(next).not.toContain("active");
  });

  it("returns empty array for terminal statuses", () => {
    expect(getValidCartNextStates("converted")).toEqual([]);
    expect(getValidCartNextStates("deleted")).toEqual([]);
  });
});
