/**
 * Tests for the SKU generation / catalog identifier utilities (ADR-008).
 */

import { describe, expect, it } from "vitest";
import {
  COLOR_CODE_MAP,
  generateProductCode,
  generateVariantSku,
  generateVariantSkuMatrix,
  isValidProductCode,
  isValidSku,
  normalizeSku,
  parseSku,
  resolveColorCode,
  resolveSizeCode,
  validateSku,
} from "@/domain/catalog/sku-generator";
import {
  DuplicateProductCodeError,
  DuplicateSkuError,
  InvalidSkuFormatError,
  MissingProductCodeError,
  MissingVariantSkuError,
  mapDbErrorToCatalogError,
} from "@/domain/catalog/catalog-errors";

// ── normalizeSku ──────────────────────────────────────────────────────────────

describe("normalizeSku", () => {
  it("uppercases input", () => {
    expect(normalizeSku("fash-003")).toBe("FASH-003");
  });

  it("replaces spaces with hyphens", () => {
    expect(normalizeSku("BLACK XS")).toBe("BLACK-XS");
  });

  it("strips disallowed characters", () => {
    expect(normalizeSku("FASH@003!")).toBe("FASH003");
  });

  it("collapses multiple hyphens", () => {
    expect(normalizeSku("FASH--003")).toBe("FASH-003");
  });

  it("strips leading/trailing hyphens", () => {
    expect(normalizeSku("-FASH-003-")).toBe("FASH-003");
  });
});

// ── resolveColorCode ──────────────────────────────────────────────────────────

describe("resolveColorCode", () => {
  it("returns BLK for Black", () => {
    expect(resolveColorCode("Black")).toBe("BLK");
  });

  it("is case-insensitive", () => {
    expect(resolveColorCode("black")).toBe("BLK");
    expect(resolveColorCode("BLACK")).toBe("BLK");
    expect(resolveColorCode("Black")).toBe("BLK");
  });

  it("returns BEI for Beige", () => {
    expect(resolveColorCode("Beige")).toBe("BEI");
  });

  it("returns OLV for Olive", () => {
    expect(resolveColorCode("Olive")).toBe("OLV");
  });

  it("returns NVY for Navy", () => {
    expect(resolveColorCode("Navy")).toBe("NVY");
  });

  it("returns CHR for Charcoal", () => {
    expect(resolveColorCode("Charcoal")).toBe("CHR");
  });

  it("returns GRY for Grey and Gray", () => {
    expect(resolveColorCode("Grey")).toBe("GRY");
    expect(resolveColorCode("Gray")).toBe("GRY");
  });

  it("falls back to first 3 chars uppercased for unknown colors", () => {
    expect(resolveColorCode("Turquoise")).toBe("TRQ");
  });

  it("covers all entries in COLOR_CODE_MAP", () => {
    for (const [name, code] of Object.entries(COLOR_CODE_MAP)) {
      expect(resolveColorCode(name)).toBe(code);
    }
  });
});

// ── resolveSizeCode ───────────────────────────────────────────────────────────

describe("resolveSizeCode", () => {
  it("returns standardized size codes", () => {
    expect(resolveSizeCode("XS")).toBe("XS");
    expect(resolveSizeCode("S")).toBe("S");
    expect(resolveSizeCode("M")).toBe("M");
    expect(resolveSizeCode("L")).toBe("L");
    expect(resolveSizeCode("XL")).toBe("XL");
    expect(resolveSizeCode("XXL")).toBe("XXL");
  });

  it("is case-insensitive", () => {
    expect(resolveSizeCode("xs")).toBe("XS");
    expect(resolveSizeCode("xxl")).toBe("XXL");
  });

  it("maps 2xl to XXL", () => {
    expect(resolveSizeCode("2xl")).toBe("XXL");
    expect(resolveSizeCode("2XL")).toBe("XXL");
  });

  it("maps one-size variants", () => {
    expect(resolveSizeCode("one")).toBe("ONE");
    expect(resolveSizeCode("os")).toBe("ONE");
  });

  it("passes through unrecognized sizes normalized", () => {
    expect(resolveSizeCode("42")).toBe("42");
  });
});

// ── isValidSku ────────────────────────────────────────────────────────────────

describe("isValidSku", () => {
  it("accepts valid SKUs", () => {
    expect(isValidSku("FASH-003-BLK-XS")).toBe(true);
    expect(isValidSku("ELEC-001-DEFAULT")).toBe(true);
    expect(isValidSku("ABC")).toBe(true);
    expect(isValidSku("A1B")).toBe(true);
  });

  it("rejects lowercase SKUs", () => {
    expect(isValidSku("fash-003")).toBe(false);
  });

  it("rejects SKUs with spaces", () => {
    expect(isValidSku("FASH 003")).toBe(false);
  });

  it("rejects SKUs with special characters", () => {
    expect(isValidSku("FASH@003")).toBe(false);
    expect(isValidSku("FASH_003")).toBe(false);
  });

  it("rejects SKUs that are too short", () => {
    expect(isValidSku("AB")).toBe(false);
    expect(isValidSku("A")).toBe(false);
    expect(isValidSku("")).toBe(false);
  });

  it("rejects SKUs that are too long (>50 chars)", () => {
    expect(isValidSku("A".repeat(51))).toBe(false);
  });

  it("rejects SKUs with leading or trailing hyphens", () => {
    expect(isValidSku("-FASH-003")).toBe(false);
    expect(isValidSku("FASH-003-")).toBe(false);
  });
});

// ── validateSku ───────────────────────────────────────────────────────────────

describe("validateSku", () => {
  it("returns empty array for a valid SKU", () => {
    expect(validateSku("FASH-003-BLK-XS")).toEqual([]);
  });

  it("returns multiple errors for a badly formed SKU", () => {
    const errors = validateSku("fash 003 blk");
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.includes("uppercase"))).toBe(true);
    expect(errors.some((e) => e.includes("spaces"))).toBe(true);
  });

  it("reports missing SKU", () => {
    const errors = validateSku("");
    expect(errors).toContain("SKU is required");
  });
});

// ── generateProductCode ───────────────────────────────────────────────────────

describe("generateProductCode", () => {
  it("generates code from multi-word name", () => {
    const code = generateProductCode("Oversized Premium Hoodie", 1);
    expect(code).toBe("OPH-001");
  });

  it("generates code from two words", () => {
    const code = generateProductCode("Smart Watch", 2);
    expect(code).toBe("SW-002");
  });

  it("zero-pads sequence numbers", () => {
    expect(generateProductCode("Tee Shirt", 5)).toBe("TS-005");
    expect(generateProductCode("Tee Shirt", 100)).toBe("TS-100");
  });

  it("skips stop-words", () => {
    const code = generateProductCode("The Premium Cotton T-Shirt", 1);
    // Stop words 'the' skipped; significant: Premium, Cotton, T-Shirt → PCT (or similar)
    expect(code).toMatch(/^[A-Z]{2,4}-001$/);
  });

  it("produces uppercase output", () => {
    const code = generateProductCode("any product", 1);
    expect(code).toBe(code.toUpperCase());
  });

  it("produces only allowed characters", () => {
    const code = generateProductCode("Wireless Noise Cancelling Headphones", 1);
    expect(code).toMatch(/^[A-Z0-9-]+$/);
  });
});

// ── generateVariantSku ────────────────────────────────────────────────────────

describe("generateVariantSku", () => {
  it("generates correct hoodie SKU", () => {
    expect(generateVariantSku("FASH-003", { color: "Black", size: "XS" })).toBe("FASH-003-BLK-XS");
    expect(generateVariantSku("FASH-003", { color: "Beige", size: "L" })).toBe("FASH-003-BEI-L");
    expect(generateVariantSku("FASH-003", { color: "Olive", size: "M" })).toBe("FASH-003-OLV-M");
    expect(generateVariantSku("FASH-003", { color: "Navy", size: "XL" })).toBe("FASH-003-NVY-XL");
    expect(generateVariantSku("FASH-003", { color: "Charcoal", size: "XXL" })).toBe("FASH-003-CHR-XXL");
  });

  it("generates DEFAULT SKU when no options", () => {
    expect(generateVariantSku("ELEC-001", {})).toBe("ELEC-001-DEFAULT");
  });

  it("puts color before size regardless of key order", () => {
    const withColorFirst = generateVariantSku("FASH-003", { color: "Black", size: "M" });
    const withSizeFirst = generateVariantSku("FASH-003", { size: "M", color: "Black" });
    expect(withColorFirst).toBe(withSizeFirst);
    expect(withColorFirst).toBe("FASH-003-BLK-M");
  });

  it("uppercases product code", () => {
    expect(generateVariantSku("fash-003", { color: "Black", size: "S" })).toBe("FASH-003-BLK-S");
  });

  it("throws if productCode is empty", () => {
    expect(() => generateVariantSku("", { color: "Black", size: "S" })).toThrow("productCode is required");
  });
});

// ── generateVariantSkuMatrix ──────────────────────────────────────────────────

describe("generateVariantSkuMatrix", () => {
  it("generates full hoodie matrix without duplicates", () => {
    const colors = ["Black", "Beige", "Olive", "Navy", "Charcoal"];
    const sizes = ["XS", "S", "M", "L", "XL", "XXL"];
    const combinations = colors.flatMap((color) => sizes.map((size) => ({ color, size })));
    const skus = generateVariantSkuMatrix("FASH-003", combinations);
    expect(skus).toHaveLength(30);
    expect(new Set(skus).size).toBe(30);
  });

  it("throws on duplicate option combinations", () => {
    expect(() =>
      generateVariantSkuMatrix("FASH-003", [
        { color: "Black", size: "M" },
        { color: "Black", size: "M" },
      ])
    ).toThrow("Duplicate SKUs");
  });
});

// ── parseSku ──────────────────────────────────────────────────────────────────

describe("parseSku", () => {
  it("parses a full hoodie SKU", () => {
    const result = parseSku("FASH-003-BLK-XS");
    expect(result).not.toBeNull();
    expect(result?.productCode).toBe("FASH-003");
    expect(result?.colorCode).toBe("BLK");
    expect(result?.sizeCode).toBe("XS");
  });

  it("parses a SKU with size only", () => {
    const result = parseSku("FASH-003-DEFAULT");
    expect(result).not.toBeNull();
    expect(result?.productCode).toBe("FASH-003");
  });

  it("returns null for an invalid SKU", () => {
    expect(parseSku("not valid!")).toBeNull();
    expect(parseSku("")).toBeNull();
  });
});

// ── Domain errors ─────────────────────────────────────────────────────────────

describe("CatalogErrors", () => {
  it("DuplicateSkuError has correct code and sku", () => {
    const err = new DuplicateSkuError("FASH-003-BLK-XS");
    expect(err.code).toBe("DUPLICATE_SKU");
    expect(err.sku).toBe("FASH-003-BLK-XS");
    expect(err.message).toContain("FASH-003-BLK-XS");
  });

  it("DuplicateProductCodeError has correct code", () => {
    const err = new DuplicateProductCodeError("FASH-003");
    expect(err.code).toBe("DUPLICATE_PRODUCT_CODE");
    expect(err.productCode).toBe("FASH-003");
  });

  it("MissingProductCodeError has correct code", () => {
    const err = new MissingProductCodeError();
    expect(err.code).toBe("MISSING_PRODUCT_CODE");
  });

  it("MissingVariantSkuError has correct code", () => {
    const err = new MissingVariantSkuError("Black / XS");
    expect(err.code).toBe("MISSING_VARIANT_SKU");
    expect(err.message).toContain("Black / XS");
  });

  it("InvalidSkuFormatError surfaces validation errors", () => {
    const validationErrors = ["SKU must be uppercase", "SKU must not contain spaces"];
    const err = new InvalidSkuFormatError("fash 003", validationErrors);
    expect(err.code).toBe("INVALID_SKU_FORMAT");
    expect(err.validationErrors).toEqual(validationErrors);
  });

  describe("mapDbErrorToCatalogError", () => {
    it("maps product_code unique violation", () => {
      const err = mapDbErrorToCatalogError(
        'duplicate key value violates unique constraint "products_product_code_unique"',
        { productCode: "FASH-003" }
      );
      expect(err).toBeInstanceOf(DuplicateProductCodeError);
    });

    it("maps sku unique violation", () => {
      const err = mapDbErrorToCatalogError(
        'duplicate key value violates unique constraint "product_variants_sku_key"',
        { sku: "FASH-003-BLK-XS" }
      );
      expect(err).toBeInstanceOf(DuplicateSkuError);
    });

    it("returns null for unrelated errors", () => {
      const err = mapDbErrorToCatalogError("connection timeout");
      expect(err).toBeNull();
    });
  });
});

// ── isValidProductCode ────────────────────────────────────────────────────────

describe("isValidProductCode", () => {
  it("accepts valid product codes", () => {
    expect(isValidProductCode("FASH-003")).toBe(true);
    expect(isValidProductCode("ELEC-001")).toBe(true);
    expect(isValidProductCode("OPH-001")).toBe(true);
    expect(isValidProductCode("AB-123")).toBe(true);
  });

  it("rejects codes without hyphen", () => {
    expect(isValidProductCode("FASH003")).toBe(false);
  });

  it("rejects lowercase codes", () => {
    expect(isValidProductCode("fash-003")).toBe(false);
  });

  it("rejects codes that are too long", () => {
    expect(isValidProductCode("VERYLONGPREFIX-001")).toBe(false);
  });
});
