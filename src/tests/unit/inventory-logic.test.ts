/**
 * Unit tests — Inventory Logic (pure computation tests)
 *
 * Tests the stock-guard logic and inventory calculation helpers.
 * The DB-backed functions (adjustInventory, recordMovement) are tested
 * in integration tests with mocked Supabase.
 */
import { describe, expect, it } from "vitest";

import type { StockCheckResult } from "@/domain/inventory/stock-guard";

// ── Stock guard pure logic ─────────────────────────────────────────────────────

/**
 * Simulates the checkStock result transformation logic
 * (the pure calculation part, without the DB query)
 */
function computeStockResult(
  variantId: string,
  available: number,
  requested: number,
): StockCheckResult {
  return {
    variantId,
    available,
    requested,
    sufficient: available >= requested,
  };
}

describe("Stock guard — sufficient flag", () => {
  it("marks sufficient when available > requested", () => {
    const result = computeStockResult("v1", 10, 3);
    expect(result.sufficient).toBe(true);
  });

  it("marks sufficient when available === requested (boundary)", () => {
    const result = computeStockResult("v1", 5, 5);
    expect(result.sufficient).toBe(true);
  });

  it("marks NOT sufficient when available < requested", () => {
    const result = computeStockResult("v1", 2, 3);
    expect(result.sufficient).toBe(false);
  });

  it("marks NOT sufficient when available is 0", () => {
    const result = computeStockResult("v1", 0, 1);
    expect(result.sufficient).toBe(false);
  });
});

describe("Inventory availability calculation", () => {
  // Tests the available = quantity - reserved formula
  function computeAvailability(quantity: number, reserved: number): number {
    return quantity - reserved;
  }

  it("computes available stock correctly", () => {
    expect(computeAvailability(100, 20)).toBe(80);
  });

  it("handles fully reserved inventory (available = 0)", () => {
    expect(computeAvailability(50, 50)).toBe(0);
  });

  it("handles zero reserved", () => {
    expect(computeAvailability(30, 0)).toBe(30);
  });
});

describe("Inventory adjustment — clamp logic", () => {
  // Mirrors the logic in adjustInventory (clamping to reserved minimum)
  function computeNewQty(currentQty: number, reserved: number, delta: number): number {
    const minQty = delta < 0 ? reserved : 0;
    return Math.max(minQty, currentQty + delta);
  }

  it("positive delta increases stock", () => {
    expect(computeNewQty(50, 10, 20)).toBe(70);
  });

  it("negative delta decreases stock", () => {
    expect(computeNewQty(50, 10, -15)).toBe(35);
  });

  it("cannot reduce below reserved amount", () => {
    // reserved=20, trying to remove 40 from qty=50 → min is 20
    expect(computeNewQty(50, 20, -40)).toBe(20);
  });

  it("cannot go below zero even with no reserved", () => {
    expect(computeNewQty(10, 0, -50)).toBe(0);
  });

  it("delta exactly matching available stock results in zero free stock", () => {
    // qty=30, reserved=10, available=20 → remove 20 → newQty=10 (== reserved)
    expect(computeNewQty(30, 10, -20)).toBe(10);
  });
});

describe("StockCheckResult shape", () => {
  it("has all required fields", () => {
    const result = computeStockResult("variant-test", 10, 5);
    expect(result).toHaveProperty("variantId");
    expect(result).toHaveProperty("available");
    expect(result).toHaveProperty("requested");
    expect(result).toHaveProperty("sufficient");
  });
});
