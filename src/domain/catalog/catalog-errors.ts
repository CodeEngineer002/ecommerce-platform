/**
 * Domain errors for the catalog (product / variant / SKU) layer.
 *
 * Usage:
 *   throw new DuplicateSkuError("FASH-003-BLK-XS");
 *   throw new InvalidSkuFormatError("fash 003 blk xs", ["SKU must be uppercase", "SKU must not contain spaces"]);
 */

// ── Base ──────────────────────────────────────────────────────────────────────

export class CatalogError extends Error {
  readonly code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = "CatalogError";
    this.code = code;
  }
}

// ── Product code errors ───────────────────────────────────────────────────────

export class DuplicateProductCodeError extends CatalogError {
  readonly productCode: string;
  constructor(productCode: string) {
    super(
      `Product code "${productCode}" is already in use. Product codes must be globally unique.`,
      "DUPLICATE_PRODUCT_CODE"
    );
    this.name = "DuplicateProductCodeError";
    this.productCode = productCode;
  }
}

export class MissingProductCodeError extends CatalogError {
  constructor() {
    super(
      "product_code is required for all products. Generate one using generateProductCode() or supply a custom code.",
      "MISSING_PRODUCT_CODE"
    );
    this.name = "MissingProductCodeError";
  }
}

export class InvalidProductCodeError extends CatalogError {
  readonly productCode: string;
  readonly validationErrors: string[];
  constructor(productCode: string, validationErrors: string[]) {
    super(
      `Product code "${productCode}" is invalid: ${validationErrors.join("; ")}`,
      "INVALID_PRODUCT_CODE"
    );
    this.name = "InvalidProductCodeError";
    this.productCode = productCode;
    this.validationErrors = validationErrors;
  }
}

// ── SKU (variant) errors ──────────────────────────────────────────────────────

export class DuplicateSkuError extends CatalogError {
  readonly sku: string;
  constructor(sku: string) {
    super(
      `SKU "${sku}" is already in use. Variant SKUs must be globally unique across all products.`,
      "DUPLICATE_SKU"
    );
    this.name = "DuplicateSkuError";
    this.sku = sku;
  }
}

export class MissingVariantSkuError extends CatalogError {
  constructor(variantName?: string) {
    super(
      variantName
        ? `Variant "${variantName}" is missing a SKU. All active sellable variants must have a SKU.`
        : "Variant is missing a SKU. All active sellable variants must have a SKU.",
      "MISSING_VARIANT_SKU"
    );
    this.name = "MissingVariantSkuError";
  }
}

export class InvalidSkuFormatError extends CatalogError {
  readonly sku: string;
  readonly validationErrors: string[];
  constructor(sku: string, validationErrors: string[]) {
    super(
      `SKU "${sku}" has invalid format: ${validationErrors.join("; ")}`,
      "INVALID_SKU_FORMAT"
    );
    this.name = "InvalidSkuFormatError";
    this.sku = sku;
    this.validationErrors = validationErrors;
  }
}

// ── Option code errors ────────────────────────────────────────────────────────

export class InvalidOptionCodeError extends CatalogError {
  readonly optionKey: string;
  readonly optionValue: string;
  constructor(optionKey: string, optionValue: string) {
    super(
      `Option "${optionKey}=${optionValue}" could not be resolved to a standardized code.`,
      "INVALID_OPTION_CODE"
    );
    this.name = "InvalidOptionCodeError";
    this.optionKey = optionKey;
    this.optionValue = optionValue;
  }
}

// ── Barcode errors ────────────────────────────────────────────────────────────

export class DuplicateBarcodeError extends CatalogError {
  readonly barcode: string;
  constructor(barcode: string) {
    super(
      `Barcode "${barcode}" is already assigned to another variant. Barcodes (GTIN/EAN/UPC) must be unique.`,
      "DUPLICATE_BARCODE"
    );
    this.name = "DuplicateBarcodeError";
    this.barcode = barcode;
  }
}

// ── Type guard ────────────────────────────────────────────────────────────────

export function isCatalogError(err: unknown): err is CatalogError {
  return err instanceof CatalogError;
}

/**
 * Maps a Supabase/PostgreSQL error message to the appropriate domain error.
 * Called when a DB operation fails to convert DB constraint violations to
 * typed domain errors.
 */
export function mapDbErrorToCatalogError(
  dbMessage: string,
  context?: { sku?: string; productCode?: string; barcode?: string }
): CatalogError | null {
  const msg = dbMessage.toLowerCase();

  if (msg.includes("products_product_code_unique") || msg.includes("product_code")) {
    return new DuplicateProductCodeError(context?.productCode ?? "unknown");
  }
  if (msg.includes("product_variants_sku_key") || (msg.includes("unique") && msg.includes("sku"))) {
    return new DuplicateSkuError(context?.sku ?? "unknown");
  }
  if (msg.includes("product_variants_barcode_unique") || (msg.includes("unique") && msg.includes("barcode"))) {
    return new DuplicateBarcodeError(context?.barcode ?? "unknown");
  }

  return null;
}
