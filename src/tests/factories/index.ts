/**
 * Shared test factories.
 *
 * Provides deterministic, reusable builders for all domain entities.
 * Use these in unit, integration, and E2E tests for consistent fixtures.
 *
 * Every factory accepts a partial override so callers only provide the
 * fields they care about — defaults are stable and semantically meaningful.
 */

import type { CouponData, LineItem, PriceBreakdown, ShippingConfig, TaxConfig } from "@/domain/pricing/types";
import type { RefundCalculationInput, RefundOrderItem } from "@/domain/returns/refund-calculator";
import type { ReturnItem } from "@/domain/returns/refund-calculator";
import type { StockCheckItem } from "@/domain/inventory/stock-guard";
import type { PersistedCartItem } from "@/store/cart-store";
import type { CartItemWithProduct } from "@/types";

// ── Pricing / coupon ──────────────────────────────────────────────────────────

export function makeLineItem(overrides: Partial<LineItem> = {}): LineItem {
  return {
    variantId: "variant-default",
    productName: "Test Product",
    unitPrice: 500,
    quantity: 1,
    ...overrides,
  };
}

export function makeLineItems(specs: Array<{ price: number; qty?: number }>): LineItem[] {
  return specs.map(({ price, qty = 1 }, i) =>
    makeLineItem({ variantId: `variant-${i}`, unitPrice: price, quantity: qty }),
  );
}

export function makeShippingConfig(overrides: Partial<ShippingConfig> = {}): ShippingConfig {
  return { freeThreshold: 999, flatRate: 99, ...overrides };
}

export function makeTaxConfig(overrides: Partial<TaxConfig> = {}): TaxConfig {
  return { rate: 0.18, ...overrides };
}

export function makePercentageCoupon(overrides: Partial<CouponData> = {}): CouponData {
  return {
    id: "coupon-pct",
    code: "SAVE10",
    type: "percentage",
    value: 10,
    maxDiscount: null,
    minOrderValue: null,
    ...overrides,
  };
}

export function makeFixedCoupon(overrides: Partial<CouponData> = {}): CouponData {
  return {
    id: "coupon-flat",
    code: "FLAT50",
    type: "fixed",
    value: 50,
    maxDiscount: null,
    minOrderValue: null,
    ...overrides,
  };
}

// ── Refund / returns ──────────────────────────────────────────────────────────

export function makeRefundOrderItem(overrides: Partial<RefundOrderItem> = {}): RefundOrderItem {
  return {
    id: "order-item-1",
    quantity: 2,
    unitPrice: 500,
    total: 1000,
    ...overrides,
  };
}

export function makeReturnItem(overrides: Partial<ReturnItem> = {}): ReturnItem {
  return {
    orderItemId: "order-item-1",
    quantity: 1,
    ...overrides,
  };
}

export function makeRefundInput(overrides: Partial<RefundCalculationInput> = {}): RefundCalculationInput {
  return {
    orderSubtotal: 1300,
    orderShipping: 99,
    orderTaxRate: 0.18,
    orderItems: [
      makeRefundOrderItem({ id: "item-1", quantity: 2, unitPrice: 500, total: 1000 }),
      makeRefundOrderItem({ id: "item-2", quantity: 1, unitPrice: 300, total: 300 }),
    ],
    returnItems: [],
    restockingFeeRate: 0,
    refundShippingOnFullReturn: true,
    ...overrides,
  };
}

// ── Inventory ─────────────────────────────────────────────────────────────────

export function makeStockCheckItem(overrides: Partial<StockCheckItem> = {}): StockCheckItem {
  return {
    variantId: "variant-default",
    quantity: 1,
    ...overrides,
  };
}

// ── Cart ──────────────────────────────────────────────────────────────────────

export function makePersistedCartItem(overrides: Partial<PersistedCartItem> = {}): PersistedCartItem {
  return {
    variant_id: "variant-default",
    quantity: 1,
    ...overrides,
  };
}

export function makeCartItemWithProduct(overrides: Partial<CartItemWithProduct> = {}): CartItemWithProduct {
  return {
    id: "cart-item-1",
    cart_id: "cart-1",
    variant_id: "variant-default",
    quantity: 1,
    unit_price_snapshot: null,
    added_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    variant: {
      id: "variant-default",
      product_id: "product-1",
      name: "Default",
      sku: "SKU-001",
      price: 500,
      options: {},
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      product: {
        id: "product-1",
        name: "Test Product",
        slug: "test-product",
        description: null,
        short_desc: null,
        category_id: null,
        base_price: 500,
        compare_price: null,
        cost_price: null,
        sku: null,
        barcode: null,
        is_active: true,
        is_featured: false,
        is_digital: false,
        weight: null,
        tags: [],
        seo_title: null,
        seo_desc: null,
        meta_image: null,
        brand_id: null,
        deleted_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        images: [],
      },
    },
    ...(overrides as Partial<CartItemWithProduct>),
  };
}

// ── Price breakdown ───────────────────────────────────────────────────────────

export function makePriceBreakdown(overrides: Partial<PriceBreakdown> = {}): PriceBreakdown {
  return {
    subtotal: 1000,
    discount: 0,
    taxableAmount: 1000,
    tax: 180,
    taxRate: 0.18,
    taxLabel: "GST",
    shipping: 0,
    total: 1180,
    ...overrides,
  };
}
