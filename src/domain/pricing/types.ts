// ── Money abstraction ─────────────────────────────────────────────────────────
// All monetary values in the system are in major currency units (e.g. ₹, $).
// Never store or calculate in sub-units unless explicitly documented.
export interface Money {
  amount: number; // e.g. 1250.00 (INR rupees, not paise)
  currency: string; // ISO 4217, e.g. "INR"
}

// ── Line items ────────────────────────────────────────────────────────────────
export interface LineItem {
  variantId: string;
  quantity: number;
  unitPrice: number;
  productName: string;
}

// ── Coupon data passed into the pricing engine ────────────────────────────────
export interface CouponData {
  id: string;
  code: string;
  type: "percentage" | "fixed";
  value: number;
  maxDiscount: number | null;
  minOrderValue: number | null;
}

// ── Shipping and tax configuration ───────────────────────────────────────────
export interface ShippingConfig {
  freeThreshold: number;
  flatRate: number;
}

export interface TaxConfig {
  rate: number; // 0.18 = 18%
}

// ── Pricing engine output ─────────────────────────────────────────────────────
export interface PriceBreakdown {
  subtotal: number;
  discount: number;
  taxableAmount: number;
  tax: number;
  shipping: number;
  total: number;
}

// ── Cart-level pricing input/output (server-side cart validation) ─────────────
export interface CartPricingItem {
  variantId: string;
  quantity: number;
  clientUnitPrice: number; // price client submitted (used for price-change detection)
  serverUnitPrice: number; // authoritative price from DB
  productName: string;
  available: number; // current stock available
}

export interface CartPricingInput {
  items: CartPricingItem[];
  couponCode?: string;
}

export interface CartPricingResult {
  validItems: CartPricingItem[];
  warnings: CartPricingWarning[];
  errors: CartPricingError[];
  pricing: PriceBreakdown | null; // null if there are hard errors
  coupon: CouponData | null;
}

export type CartPricingWarning =
  | { type: "PRICE_CHANGED"; variantId: string; oldPrice: number; newPrice: number }
  | { type: "LOW_STOCK"; variantId: string; available: number; requested: number };

export type CartPricingError =
  | { type: "VARIANT_UNAVAILABLE"; variantId: string; productName: string }
  | { type: "INSUFFICIENT_STOCK"; variantId: string; available: number; requested: number }
  | { type: "QUANTITY_LIMIT_EXCEEDED"; variantId: string; max: number };

// ── Order pricing snapshot (immutable, saved with order) ──────────────────────
// Captures the exact pricing context at the moment of order creation.
// Critical: once an order is created, these values must never change.
export interface OrderPricingSnapshot {
  currency: string;
  subtotal: number;
  discount: number;
  tax: number;
  taxRate: number;
  shipping: number;
  total: number;
  couponCode: string | null;
  couponType: "percentage" | "fixed" | null;
  couponValue: number | null;
  lineItems: Array<{
    variantId: string;
    productName: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }>;
}
