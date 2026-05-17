/**
 * Unit tests for Enterprise Catalog Management UX utilities (ADR-010).
 *
 * Tests cover: status computation, variant matrix building, price range,
 * inventory summary, filter logic, and variant name generation.
 * All functions are pure — no Supabase / React dependencies.
 */

import { describe, it, expect } from "vitest";

import {
  buildVariantMatrix,
  computeHierarchy,
  computeInventorySummary,
  computePriceRange,
  computeProductStatus,
  filterProducts,
  formatRelativeTime,
  generateVariantName,
  type AdminProductRow,
  type AdminVariant,
} from "@/app/admin/products/catalog-utils";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeVariant(
  overrides: Partial<AdminVariant> & { color?: string; size?: string } = {}
): AdminVariant {
  const { color, size, ...rest } = overrides;
  return {
    id: `v-${Math.random()}`,
    name: [color, size].filter(Boolean).join(" / ") || "Default",
    sku: null,
    price: null,
    is_active: true,
    is_default: false,
    color_code: color?.slice(0, 3).toUpperCase() ?? null,
    size_code: size?.toUpperCase() ?? null,
    options: { ...(color ? { color } : {}), ...(size ? { size } : {}) },
    inventory_levels: [{ quantity: 10, reserved: 0 }],
    ...rest,
  };
}

function makeProduct(overrides: Partial<AdminProductRow> = {}): AdminProductRow {
  return {
    id: `p-${Math.random()}`,
    name: "Test Product",
    slug: "test-product",
    product_code: "TEST-001",
    base_price: 100,
    is_active: true,
    is_featured: false,
    deleted_at: null,
    updated_at: new Date().toISOString(),
    category: { id: "cat-1", name: "Clothing" },
    variants: [],
    available_country_ids: [],
    ...overrides,
  };
}

// ── computeProductStatus ──────────────────────────────────────────────────────

describe("computeProductStatus", () => {
  it("returns 'active' for active product without deleted_at", () => {
    expect(computeProductStatus(true)).toBe("active");
  });

  it("returns 'draft' for inactive product without deleted_at", () => {
    expect(computeProductStatus(false)).toBe("draft");
  });

  it("returns 'archived' when deleted_at is set (even if is_active is true)", () => {
    expect(computeProductStatus(true, "2024-01-01T00:00:00Z")).toBe("archived");
  });

  it("returns 'archived' for inactive product with deleted_at", () => {
    expect(computeProductStatus(false, "2024-01-01T00:00:00Z")).toBe("archived");
  });

  it("returns 'active' when deleted_at is null or undefined", () => {
    expect(computeProductStatus(true, null)).toBe("active");
    expect(computeProductStatus(true, undefined)).toBe("active");
  });
});

// ── buildVariantMatrix ────────────────────────────────────────────────────────

describe("buildVariantMatrix", () => {
  it("builds a correct matrix from variants", () => {
    const variants = [
      makeVariant({ color: "Black", size: "S" }),
      makeVariant({ color: "Black", size: "M" }),
      makeVariant({ color: "White", size: "S" }),
    ];
    const matrix = buildVariantMatrix(variants);
    expect(matrix.colors).toContain("Black");
    expect(matrix.colors).toContain("White");
    expect(matrix.sizes).toContain("S");
    expect(matrix.sizes).toContain("M");
    expect(matrix.cells.size).toBe(3);
    expect(matrix.cells.has("Black::S")).toBe(true);
    expect(matrix.cells.has("Black::M")).toBe(true);
    expect(matrix.cells.has("White::S")).toBe(true);
    expect(matrix.cells.has("White::M")).toBe(false);
  });

  it("returns empty matrix for no variants", () => {
    const matrix = buildVariantMatrix([]);
    expect(matrix.colors).toHaveLength(0);
    expect(matrix.sizes).toHaveLength(0);
    expect(matrix.cells.size).toBe(0);
  });

  it("sorts sizes in standard apparel order (XS < S < M < L < XL)", () => {
    const variants = [
      makeVariant({ color: "Black", size: "XL" }),
      makeVariant({ color: "Black", size: "S" }),
      makeVariant({ color: "Black", size: "XS" }),
      makeVariant({ color: "Black", size: "M" }),
    ];
    const matrix = buildVariantMatrix(variants);
    expect(matrix.sizes.indexOf("XS")).toBeLessThan(matrix.sizes.indexOf("S"));
    expect(matrix.sizes.indexOf("S")).toBeLessThan(matrix.sizes.indexOf("M"));
    expect(matrix.sizes.indexOf("M")).toBeLessThan(matrix.sizes.indexOf("XL"));
  });

  it("handles variants without color/size options by using variant name as size", () => {
    const variants = [makeVariant({ name: "One Size", options: {} })];
    const matrix = buildVariantMatrix(variants);
    expect(matrix.colors).toContain("Default");
    expect(matrix.sizes).toContain("One Size");
  });
});

// ── computePriceRange ─────────────────────────────────────────────────────────

describe("computePriceRange", () => {
  it("returns base price as both min and max when no variants", () => {
    expect(computePriceRange(100, [])).toEqual({ min: 100, max: 100 });
  });

  it("returns range across variant prices", () => {
    const variants = [
      makeVariant({ price: 80 }),
      makeVariant({ price: 150 }),
      makeVariant({ price: 120 }),
    ];
    expect(computePriceRange(100, variants)).toEqual({ min: 80, max: 150 });
  });

  it("includes base price in range calculation", () => {
    const variants = [makeVariant({ price: 120 }), makeVariant({ price: 130 })];
    expect(computePriceRange(90, variants)).toEqual({ min: 90, max: 130 });
  });

  it("ignores inactive variants", () => {
    const variants = [makeVariant({ price: 50, is_active: false }), makeVariant({ price: 120 })];
    expect(computePriceRange(100, variants)).toEqual({ min: 100, max: 120 });
  });

  it("ignores variants with null price", () => {
    const variants = [makeVariant({ price: null }), makeVariant({ price: 120 })];
    expect(computePriceRange(100, variants)).toEqual({ min: 100, max: 120 });
  });
});

// ── computeInventorySummary ───────────────────────────────────────────────────

describe("computeInventorySummary", () => {
  it("returns zeros for no variants", () => {
    expect(computeInventorySummary([])).toEqual({ totalStock: 0, oosCount: 0, lowStockCount: 0 });
  });

  it("sums stock across inventory_levels for a variant", () => {
    const v = makeVariant({ inventory_levels: [{ quantity: 15, reserved: 5 }] });
    const { totalStock } = computeInventorySummary([v]);
    expect(totalStock).toBe(10);
  });

  it("counts OOS variants when available is 0 or negative", () => {
    const v1 = makeVariant({ inventory_levels: [{ quantity: 3, reserved: 3 }] });
    const v2 = makeVariant({ inventory_levels: [{ quantity: 0, reserved: 0 }] });
    const v3 = makeVariant({ inventory_levels: [{ quantity: 10, reserved: 0 }] });
    const { oosCount } = computeInventorySummary([v1, v2, v3]);
    expect(oosCount).toBe(2);
  });

  it("counts low stock variants (available 1–5)", () => {
    const v1 = makeVariant({ inventory_levels: [{ quantity: 3, reserved: 0 }] });
    const v2 = makeVariant({ inventory_levels: [{ quantity: 5, reserved: 0 }] });
    const v3 = makeVariant({ inventory_levels: [{ quantity: 6, reserved: 0 }] });
    const { lowStockCount } = computeInventorySummary([v1, v2, v3]);
    expect(lowStockCount).toBe(2);
  });

  it("ignores inactive variants", () => {
    const v = makeVariant({ is_active: false, inventory_levels: [{ quantity: 100, reserved: 0 }] });
    const { totalStock } = computeInventorySummary([v]);
    expect(totalStock).toBe(0);
  });
});

// ── computeHierarchy ─────────────────────────────────────────────────────────

describe("computeHierarchy", () => {
  it("counts colors, sizes, and SKUs from active variants", () => {
    const variants = [
      makeVariant({ color: "Black", size: "S", sku: "TST-BLK-S" }),
      makeVariant({ color: "Black", size: "M", sku: "TST-BLK-M" }),
      makeVariant({ color: "White", size: "S", sku: "TST-WHT-S" }),
      makeVariant({ color: "White", size: "M" }), // no sku
    ];
    const h = computeHierarchy(variants);
    expect(h.variantCount).toBe(4);
    expect(h.colorCount).toBe(2);
    expect(h.sizeCount).toBe(2);
    expect(h.skuCount).toBe(3);
  });

  it("excludes inactive variants from counts", () => {
    const variants = [
      makeVariant({ color: "Black", size: "S", is_active: false }),
      makeVariant({ color: "Black", size: "M", is_active: true }),
    ];
    const h = computeHierarchy(variants);
    expect(h.variantCount).toBe(1);
  });
});

// ── filterProducts ────────────────────────────────────────────────────────────

describe("filterProducts", () => {
  const products: AdminProductRow[] = [
    makeProduct({ id: "p1", name: "Black Hoodie", product_code: "FASH-001", is_active: true, is_featured: true }),
    makeProduct({ id: "p2", name: "Blue Jeans", product_code: "FASH-002", is_active: false }),
    makeProduct({ id: "p3", name: "White T-Shirt", product_code: "FASH-003", is_active: false, deleted_at: "2024-01-01T00:00:00Z" }),
    makeProduct({ id: "p4", name: "Red Cap", product_code: "ACC-001", category: { id: "cat-2", name: "Accessories" }, is_active: true }),
  ];

  it("returns all products with default no-op filters", () => {
    const result = filterProducts(products, {
      search: "", category: "all", status: "all", stock: "all", featured: "all",
    });
    expect(result).toHaveLength(4);
  });

  it("filters by product name search", () => {
    const result = filterProducts(products, {
      search: "hoodie", category: "all", status: "all", stock: "all", featured: "all",
    });
    expect(result.map((p) => p.id)).toEqual(["p1"]);
  });

  it("filters by product code search", () => {
    const result = filterProducts(products, {
      search: "FASH-002", category: "all", status: "all", stock: "all", featured: "all",
    });
    expect(result.map((p) => p.id)).toEqual(["p2"]);
  });

  it("filters by status=active", () => {
    const result = filterProducts(products, {
      search: "", category: "all", status: "active", stock: "all", featured: "all",
    });
    expect(result.map((p) => p.id)).toEqual(["p1", "p4"]);
  });

  it("filters by status=draft (inactive but not deleted)", () => {
    const result = filterProducts(products, {
      search: "", category: "all", status: "draft", stock: "all", featured: "all",
    });
    expect(result.map((p) => p.id)).toEqual(["p2"]);
  });

  it("filters by status=archived (deleted_at set)", () => {
    const result = filterProducts(products, {
      search: "", category: "all", status: "archived", stock: "all", featured: "all",
    });
    expect(result.map((p) => p.id)).toEqual(["p3"]);
  });

  it("filters by category", () => {
    const result = filterProducts(products, {
      search: "", category: "cat-2", status: "all", stock: "all", featured: "all",
    });
    expect(result.map((p) => p.id)).toEqual(["p4"]);
  });

  it("filters by featured=featured", () => {
    const result = filterProducts(products, {
      search: "", category: "all", status: "all", stock: "all", featured: "featured",
    });
    expect(result.map((p) => p.id)).toEqual(["p1"]);
  });
});

// ── generateVariantName ───────────────────────────────────────────────────────

describe("generateVariantName", () => {
  it("combines color and size with slash", () => {
    expect(generateVariantName("Black", "XS")).toBe("Black / XS");
  });

  it("returns just color if no size", () => {
    expect(generateVariantName("Black", null)).toBe("Black");
  });

  it("returns just size if no color", () => {
    expect(generateVariantName(null, "XS")).toBe("XS");
  });

  it("returns 'Default' if both are null", () => {
    expect(generateVariantName(null, null)).toBe("Default");
  });
});

// ── formatRelativeTime ────────────────────────────────────────────────────────

describe("formatRelativeTime", () => {
  it("returns '—' for null/undefined", () => {
    expect(formatRelativeTime(null)).toBe("—");
    expect(formatRelativeTime(undefined)).toBe("—");
  });

  it("returns 'just now' for very recent timestamps", () => {
    const now = new Date().toISOString();
    expect(formatRelativeTime(now)).toBe("just now");
  });

  it("returns human-readable relative time", () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    expect(formatRelativeTime(twoDaysAgo)).toBe("2d ago");
  });
});
