/**
 * Unit tests for:
 *  1. buildProductGroups() — pure data transform (shared-types.ts)
 *  2. computeNewQuantity()  — stock arithmetic (admin-inventory.service.ts)
 *  3. AdjustmentReason values — all reason keys are valid enum entries
 */

import { describe, it, expect } from "vitest";

import { buildProductGroups, SIZE_ORDER, type InventoryRowData } from "@/app/admin/inventory/shared-types";
import {
  computeNewQuantity,
  ADJUSTMENT_REASON_LABELS,
  type AdjustmentOperation,
  type AdjustmentReason,
} from "@/features/admin/services/admin-inventory.service";

// ── Test fixtures ─────────────────────────────────────────────────────────────

const BASE_ROW: Omit<InventoryRowData, "color" | "size" | "quantity" | "reserved" | "variantId"> = {
  productId: "prod-1",
  productName: "Test Hoodie",
  productCode: "FASH-001",
  sku: "FASH-001-BLK-M",
  variantName: "Black / M",
  colorCode: "BLK",
  sizeCode: "M",
};

function makeRow(
  overrides: Partial<InventoryRowData> & Pick<InventoryRowData, "variantId" | "color" | "size">,
): InventoryRowData {
  return {
    ...BASE_ROW,
    quantity: 10,
    reserved: 0,
    sku: `FASH-001-${(overrides.color ?? "X").slice(0, 3).toUpperCase()}-${overrides.size ?? "M"}`,
    variantName: `${overrides.color} / ${overrides.size}`,
    colorCode: null,
    sizeCode: null,
    ...overrides,
  };
}

// ── buildProductGroups ────────────────────────────────────────────────────────

describe("buildProductGroups", () => {
  it("groups variants by product and color", () => {
    const rows: InventoryRowData[] = [
      makeRow({ variantId: "v1", color: "Black", size: "M" }),
      makeRow({ variantId: "v2", color: "Black", size: "L" }),
      makeRow({ variantId: "v3", color: "Beige", size: "M" }),
    ];

    const groups = buildProductGroups(rows);
    expect(groups).toHaveLength(1);
    expect(groups[0].productId).toBe("prod-1");
    expect(groups[0].colors).toHaveLength(2);

    const blackColor = groups[0].colors.find((c) => c.color === "Black");
    expect(blackColor).toBeDefined();
    expect(blackColor!.cells.size).toBe(2);
    expect(blackColor!.cells.has("M")).toBe(true);
    expect(blackColor!.cells.has("L")).toBe(true);
  });

  it("sorts sizes according to SIZE_ORDER", () => {
    const rows: InventoryRowData[] = [
      makeRow({ variantId: "v1", color: "Black", size: "XL" }),
      makeRow({ variantId: "v2", color: "Black", size: "XS" }),
      makeRow({ variantId: "v3", color: "Black", size: "M" }),
      makeRow({ variantId: "v4", color: "Black", size: "S" }),
    ];

    const groups = buildProductGroups(rows);
    const sizes = groups[0].allSizes;
    expect(sizes).toEqual(["XS", "S", "M", "XL"]);

    // Verify it follows SIZE_ORDER array indices
    const expectedOrder = ["XS", "S", "M", "XL"];
    expectedOrder.forEach((size, i) => {
      expect(sizes[i]).toBe(size);
    });
  });

  it("handles unknown sizes alphabetically after known sizes", () => {
    const rows: InventoryRowData[] = [
      makeRow({ variantId: "v1", color: "Black", size: "L" }),
      makeRow({ variantId: "v2", color: "Black", size: "Custom" }),
      makeRow({ variantId: "v3", color: "Black", size: "XXXL" }),
    ];

    const groups = buildProductGroups(rows);
    // Known sizes come first (L), then unknown (Custom, XXXL if it's in SIZE_ORDER)
    // XXXL is in SIZE_ORDER, Custom is not
    const sizes = groups[0].allSizes;
    const customIdx = sizes.indexOf("Custom");
    const lIdx = sizes.indexOf("L");
    expect(lIdx).toBeLessThan(customIdx);
  });

  it("computes totalUnits correctly", () => {
    const rows: InventoryRowData[] = [
      makeRow({ variantId: "v1", color: "Black", size: "M", quantity: 15 }),
      makeRow({ variantId: "v2", color: "Black", size: "L", quantity: 5 }),
      makeRow({ variantId: "v3", color: "Beige", size: "M", quantity: 10 }),
    ];

    const groups = buildProductGroups(rows);
    expect(groups[0].totalUnits).toBe(30);
  });

  it("sets hasOOS when any cell has 0 available", () => {
    const rows: InventoryRowData[] = [
      makeRow({ variantId: "v1", color: "Black", size: "M", quantity: 10, reserved: 0 }),
      makeRow({ variantId: "v2", color: "Black", size: "L", quantity: 0, reserved: 0 }),
    ];

    const groups = buildProductGroups(rows);
    expect(groups[0].hasOOS).toBe(true);
    expect(groups[0].hasLowStock).toBe(false);
  });

  it("sets hasLowStock when any cell has 1-5 available (not OOS)", () => {
    const rows: InventoryRowData[] = [
      makeRow({ variantId: "v1", color: "Black", size: "M", quantity: 10, reserved: 0 }),
      makeRow({ variantId: "v2", color: "Black", size: "L", quantity: 5, reserved: 1 }), // 4 available
    ];

    const groups = buildProductGroups(rows);
    expect(groups[0].hasLowStock).toBe(true);
    expect(groups[0].hasOOS).toBe(false);
  });

  it("correctly sets available = quantity - reserved in cells", () => {
    const rows: InventoryRowData[] = [
      makeRow({ variantId: "v1", color: "Black", size: "M", quantity: 20, reserved: 3 }),
    ];

    const groups = buildProductGroups(rows);
    const cell = groups[0].colors[0].cells.get("M");
    expect(cell).toBeDefined();
    expect(cell!.available).toBe(17);
    expect(cell!.quantity).toBe(20);
    expect(cell!.reserved).toBe(3);
  });

  it("groups variants from multiple products into separate groups", () => {
    const rows: InventoryRowData[] = [
      makeRow({ variantId: "v1", color: "Black", size: "M" }),
      {
        ...makeRow({ variantId: "v2", color: "White", size: "S" }),
        productId: "prod-2",
        productName: "Different Product",
        productCode: "FASH-002",
      },
    ];

    const groups = buildProductGroups(rows);
    expect(groups).toHaveLength(2);
    const ids = groups.map((g) => g.productId);
    expect(ids).toContain("prod-1");
    expect(ids).toContain("prod-2");
  });

  it("returns empty array for empty input", () => {
    expect(buildProductGroups([])).toHaveLength(0);
  });
});

// ── computeNewQuantity ────────────────────────────────────────────────────────

describe("computeNewQuantity", () => {
  const cases: Array<[AdjustmentOperation, number, number, number]> = [
    ["increase", 10, 5, 15],
    ["increase", 0, 100, 100],
    ["increase", 50, 0, 50],
    ["decrease", 10, 3, 7],
    ["decrease", 5, 5, 0],
    ["set", 10, 25, 25],
    ["set", 10, 0, 0],
  ];

  it.each(cases)(
    "operation=%s, current=%d, input=%d → expected=%d",
    (operation, current, input, expected) => {
      expect(computeNewQuantity(operation, current, input)).toBe(expected);
    },
  );

  it("does not allow decrease below 0", () => {
    expect(computeNewQuantity("decrease", 5, 10)).toBe(0);
    expect(computeNewQuantity("decrease", 0, 1)).toBe(0);
  });

  it("does not allow set to negative", () => {
    expect(computeNewQuantity("set", 10, -5)).toBe(0);
  });
});

// ── AdjustmentReason ──────────────────────────────────────────────────────────

describe("AdjustmentReason", () => {
  const expectedReasons: AdjustmentReason[] = [
    "new_inventory_received",
    "damaged_stock",
    "manual_correction",
    "return_restocked",
    "warehouse_transfer",
    "audit_correction",
  ];

  it("has all 6 expected reason values", () => {
    const keys = Object.keys(ADJUSTMENT_REASON_LABELS) as AdjustmentReason[];
    expect(keys.sort()).toEqual(expectedReasons.sort());
  });

  it("every reason has a non-empty display label", () => {
    for (const [key, label] of Object.entries(ADJUSTMENT_REASON_LABELS)) {
      expect(typeof label).toBe("string");
      expect(label.length).toBeGreaterThan(0);
      // Label should be title-case words, not the snake_case key
      expect(label).not.toContain("_");
    }
  });
});
