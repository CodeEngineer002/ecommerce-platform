/**
 * SKU Generation — canonical catalog identifier utilities.
 *
 * Two-level identifier model (ADR-008):
 *   product_code  — product/style level  e.g. FASH-003
 *   variant sku   — sellable unit level  e.g. FASH-003-BLK-XS
 *
 * Rules:
 *   - Uppercase only
 *   - Characters: A–Z, 0–9, hyphen
 *   - No spaces, no special characters
 *   - Stable: SKU must not change when product title changes
 *   - Unique: enforced by DB UNIQUE constraint and DuplicateSkuError
 */

// ── Standardized color codes ──────────────────────────────────────────────────

export const COLOR_CODE_MAP: Readonly<Record<string, string>> = {
  black:     "BLK",
  beige:     "BEI",
  olive:     "OLV",
  navy:      "NVY",
  charcoal:  "CHR",
  white:     "WHT",
  red:       "RED",
  blue:      "BLU",
  green:     "GRN",
  yellow:    "YLW",
  pink:      "PNK",
  orange:    "ORG",
  grey:      "GRY",
  gray:      "GRY",
  purple:    "PRP",
  brown:     "BRN",
  gold:      "GLD",
  silver:    "SLV",
  teal:      "TEL",
  maroon:    "MRN",
  khaki:     "KHK",
  cream:     "CRM",
  coral:     "CRL",
  lavender:  "LVD",
  mint:      "MNT",
  indigo:    "IND",
  turquoise: "TRQ",
};

// ── Standardized size codes ───────────────────────────────────────────────────

export const SIZE_CODE_MAP: Readonly<Record<string, string>> = {
  xs:    "XS",
  s:     "S",
  m:     "M",
  l:     "L",
  xl:    "XL",
  xxl:   "XXL",
  "2xl": "XXL",
  "3xl": "3XL",
  "4xl": "4XL",
  one:   "ONE",
  os:    "ONE",  // one-size
  "one size": "ONE",
  // Numeric shoe/clothing sizes — pass through as-is (normalized)
};

// ── SKU format regex ──────────────────────────────────────────────────────────

const SKU_PATTERN = /^[A-Z0-9][A-Z0-9-]{1,48}[A-Z0-9]$/;
const PRODUCT_CODE_PATTERN = /^[A-Z]{2,8}-[0-9]{3,6}$/;
const MAX_SKU_LENGTH = 50;
const MAX_PRODUCT_CODE_LENGTH = 20;

// ── Normalize ─────────────────────────────────────────────────────────────────

/**
 * Normalize a raw string to a SKU-safe segment:
 * uppercase, spaces→hyphens, strip disallowed chars, collapse hyphens.
 */
export function normalizeSku(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/\s+/g, "-")
    .replace(/[^A-Z0-9-]/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "");
}

// ── Color code resolution ─────────────────────────────────────────────────────

/**
 * Returns the standardized 2–3 character color code for a color name.
 * Falls back to the first 3 uppercase letters of the name if unmapped.
 */
export function resolveColorCode(colorName: string): string {
  const normalized = colorName.toLowerCase().trim();
  return COLOR_CODE_MAP[normalized] ?? normalizeSku(colorName).slice(0, 3);
}

/**
 * Returns the standardized size code for a size name.
 * Passes through standard sizes (XS, S, M, L, XL, XXL) unchanged.
 * Numeric sizes are uppercased and returned as-is.
 */
export function resolveSizeCode(sizeName: string): string {
  const normalized = sizeName.toLowerCase().trim();
  return SIZE_CODE_MAP[normalized] ?? normalizeSku(sizeName);
}

// ── Validation ────────────────────────────────────────────────────────────────

/**
 * Returns true if the string is a valid SKU.
 * Valid: uppercase letters, digits, hyphens; 3–50 chars; no leading/trailing hyphens.
 */
export function isValidSku(sku: string): boolean {
  if (!sku || sku.length < 3 || sku.length > MAX_SKU_LENGTH) return false;
  return SKU_PATTERN.test(sku);
}

/**
 * Returns true if the string is a valid product code.
 * Format: 2–8 uppercase letters, hyphen, 3–6 digits. e.g. FASH-003, ELEC-001.
 */
export function isValidProductCode(code: string): boolean {
  if (!code || code.length > MAX_PRODUCT_CODE_LENGTH) return false;
  return PRODUCT_CODE_PATTERN.test(code);
}

/**
 * Validates a SKU and returns all validation errors.
 * Empty array = valid.
 */
export function validateSku(sku: string): string[] {
  const errors: string[] = [];
  if (!sku || sku.trim().length === 0) {
    errors.push("SKU is required");
    return errors;
  }
  if (sku !== sku.toUpperCase()) errors.push("SKU must be uppercase");
  if (/\s/.test(sku)) errors.push("SKU must not contain spaces");
  if (/[^A-Z0-9-]/.test(sku.toUpperCase())) errors.push("SKU may only contain letters, digits, and hyphens");
  if (sku.startsWith("-") || sku.endsWith("-")) errors.push("SKU must not start or end with a hyphen");
  if (sku.length < 3) errors.push("SKU must be at least 3 characters");
  if (sku.length > MAX_SKU_LENGTH) errors.push(`SKU must not exceed ${MAX_SKU_LENGTH} characters`);
  return errors;
}

// ── Generation ────────────────────────────────────────────────────────────────

/**
 * Generates a product code from a product name and sequence number.
 *
 * Example: generateProductCode("Oversized Premium Hoodie", 3) → "OVH-003"
 *
 * Strategy:
 *   1. Take first letter of each significant word (stop-words excluded)
 *   2. Take first 2–4 letters of the result
 *   3. Append zero-padded sequence number
 *
 * The sequence number must be managed by the caller (e.g. count of existing
 * products in the category + 1). This function is deterministic given inputs.
 *
 * IMPORTANT: Do not re-generate existing product codes. This is for new products only.
 */
export function generateProductCode(productName: string, sequenceNumber: number): string {
  const STOP_WORDS = new Set(["a", "an", "the", "and", "or", "of", "for", "in", "on", "with", "to", "by", "from"]);

  const words = productName
    .toLowerCase()
    .replace(/[^a-z\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w));

  let prefix: string;
  if (words.length === 0) {
    prefix = normalizeSku(productName).slice(0, 3);
  } else if (words.length === 1) {
    prefix = words[0].slice(0, 4).toUpperCase();
  } else {
    prefix = words.map((w) => w[0].toUpperCase()).join("").slice(0, 4);
  }

  const seq = String(sequenceNumber).padStart(3, "0");
  return `${prefix}-${seq}`;
}

/**
 * Generates a variant SKU from a product code and option values.
 *
 * Example:
 *   generateVariantSku("FASH-003", { color: "Black", size: "XS" }) → "FASH-003-BLK-XS"
 *   generateVariantSku("ELEC-002", {}) → "ELEC-002-DEFAULT"
 *
 * Option keys are processed in sorted order for determinism.
 * Color and size options use the standardized code maps.
 * Unknown option keys are normalized and appended.
 */
export function generateVariantSku(
  productCode: string,
  optionValues: Record<string, string>
): string {
  if (!productCode) throw new Error("productCode is required");

  const parts: string[] = [productCode.toUpperCase()];

  const keys = Object.keys(optionValues).sort();
  if (keys.length === 0) {
    parts.push("DEFAULT");
    return parts.join("-");
  }

  // Process color first (if present), then size, then other options alphabetically
  const orderedKeys = [
    ...keys.filter((k) => k.toLowerCase() === "color"),
    ...keys.filter((k) => k.toLowerCase() === "size"),
    ...keys.filter((k) => k.toLowerCase() !== "color" && k.toLowerCase() !== "size"),
  ];

  for (const key of orderedKeys) {
    const value = optionValues[key];
    if (!value) continue;

    let code: string;
    if (key.toLowerCase() === "color") {
      code = resolveColorCode(value);
    } else if (key.toLowerCase() === "size") {
      code = resolveSizeCode(value);
    } else {
      code = normalizeSku(value).slice(0, 6);
    }

    if (code) parts.push(code);
  }

  return parts.join("-");
}

/**
 * Generates all variant SKUs for a product given its code and a matrix of options.
 *
 * Example:
 *   generateVariantSkuMatrix("FASH-003", [
 *     { color: "Black", size: "XS" },
 *     { color: "Black", size: "S" },
 *   ])
 *   → ["FASH-003-BLK-XS", "FASH-003-BLK-S"]
 */
export function generateVariantSkuMatrix(
  productCode: string,
  optionCombinations: Record<string, string>[]
): string[] {
  const skus = optionCombinations.map((opts) => generateVariantSku(productCode, opts));
  const unique = new Set(skus);
  if (unique.size !== skus.length) {
    throw new Error("Duplicate SKUs generated — check for duplicate option combinations");
  }
  return skus;
}

// ── Parsing ───────────────────────────────────────────────────────────────────

/**
 * Parses a variant SKU back into its components.
 * Assumes format: PRODUCT_CODE-COLOR_CODE-SIZE_CODE (and optional extras).
 *
 * Returns null if the SKU does not match the expected pattern.
 */
export interface ParsedSku {
  productCode: string;
  colorCode: string | null;
  sizeCode: string | null;
  extra: string[];
  raw: string;
}

export function parseSku(sku: string): ParsedSku | null {
  if (!isValidSku(sku)) return null;

  const parts = sku.split("-");
  if (parts.length < 2) return null;

  // Product code: first two segments (e.g. FASH + 003)
  const productCode = `${parts[0]}-${parts[1]}`;

  const colorCodes = new Set(Object.values(COLOR_CODE_MAP));
  const sizeCodes = new Set(Object.values(SIZE_CODE_MAP));

  let colorCode: string | null = null;
  let sizeCode: string | null = null;
  const extra: string[] = [];

  for (let i = 2; i < parts.length; i++) {
    const part = parts[i];
    if (!colorCode && colorCodes.has(part)) {
      colorCode = part;
    } else if (!sizeCode && (sizeCodes.has(part) || /^\d+$/.test(part))) {
      sizeCode = part;
    } else {
      extra.push(part);
    }
  }

  return { productCode, colorCode, sizeCode, extra, raw: sku };
}
