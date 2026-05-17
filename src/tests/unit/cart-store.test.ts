import { beforeEach, describe, expect, it } from "vitest";

import { useCartStore } from "@/store/cart-store";
import type { CartItemWithProduct } from "@/types";
import type { CartSummary } from "@/domain/cart/types";

const mockItem: CartItemWithProduct = {
  id: "item-1",
  cart_id: "cart-1",
  variant_id: "variant-1",
  quantity: 1,
  unit_price_snapshot: null,
  added_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  variant: {
    id: "variant-1",
    product_id: "product-1",
    name: "Default",
    sku: "TEST-001",
    price: 100,
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
      base_price: 100,
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
};

describe("CartStore", () => {
  beforeEach(() => {
    // Reset ALL state including persistedItems — itemCount() reads persistedItems
    useCartStore.setState({ items: [], persistedItems: [], isOpen: false });
  });

  it("adds an item to cart", () => {
    useCartStore.getState().addItem(mockItem);
    expect(useCartStore.getState().items).toHaveLength(1);
  });

  it("increments quantity on duplicate add", () => {
    useCartStore.getState().addItem(mockItem);
    useCartStore.getState().addItem(mockItem);
    expect(useCartStore.getState().items[0].quantity).toBe(2);
  });

  it("removes an item", () => {
    useCartStore.getState().addItem(mockItem);
    useCartStore.getState().removeItem("variant-1");
    expect(useCartStore.getState().items).toHaveLength(0);
  });

  it("clears cart", () => {
    useCartStore.getState().addItem(mockItem);
    useCartStore.getState().clearCart();
    expect(useCartStore.getState().items).toHaveLength(0);
  });

  it("calculates subtotal correctly", () => {
    useCartStore.getState().addItem({ ...mockItem, quantity: 3 });
    expect(useCartStore.getState().subtotal()).toBe(300);
  });

  it("returns correct item count", () => {
    useCartStore.getState().addItem({ ...mockItem, quantity: 2 });
    expect(useCartStore.getState().itemCount()).toBe(2);
  });

  it("toggles cart open state", () => {
    useCartStore.getState().openCart();
    expect(useCartStore.getState().isOpen).toBe(true);
    useCartStore.getState().closeCart();
    expect(useCartStore.getState().isOpen).toBe(false);
  });

  // ── addItem — ADDITIVE behavior ─────────────────────────────────────────────

  it("addItem — ADDITIVE: qty 3 + qty 7 = qty 10 for same variant", () => {
    useCartStore.getState().addItem({ ...mockItem, quantity: 3 });
    useCartStore.getState().addItem({ ...mockItem, quantity: 7 });
    expect(useCartStore.getState().items[0].quantity).toBe(10);
  });

  it("addItem — creates separate lines for different variants", () => {
    const variant2: CartItemWithProduct = {
      ...mockItem,
      id: "item-2",
      variant_id: "variant-2",
      quantity: 1,
      variant: { ...mockItem.variant, id: "variant-2" },
    };
    useCartStore.getState().addItem(mockItem);
    useCartStore.getState().addItem(variant2);
    expect(useCartStore.getState().items).toHaveLength(2);
  });

  it("addItem — caps at CART_MAX_QUANTITY (50)", () => {
    useCartStore.getState().addItem({ ...mockItem, quantity: 40 });
    useCartStore.getState().addItem({ ...mockItem, quantity: 20 }); // 40 + 20 = 60 > 50
    expect(useCartStore.getState().items[0].quantity).toBe(50);
  });
});

// ── serverCart optimistic updates ────────────────────────────────────────────

const baseServerCart: CartSummary = {
  id: "cart-1",
  status: "active",
  currency_code: "INR",
  country_id: "in",
  items: [
    {
      id: "ci-1",
      cart_id: "cart-1",
      variant_id: "variant-1",
      quantity: 5,
      unit_price_snapshot: 100,
      current_unit_price: 100,
      price_changed: false,
      product_name: "Oversized Hoodie",
      variant_name: "Black / XL",
      sku: "FASH-003-BLK-XL",
      image_url: null,
      is_available: true,
      available_stock: 20,
      low_stock: false,
    },
  ],
  coupon_code: null,
  pricing: {
    subtotal: 500,
    discount: 0,
    estimated_shipping: 0,
    estimated_tax: 90,
    total: 590,
    tax_rate: 0.18,
    tax_label: "GST",
  },
  warnings: [],
  item_count: 5,
  expires_at: new Date(Date.now() + 86400_000).toISOString(),
  updated_at: new Date().toISOString(),
};

describe("CartStore — setServerCart", () => {
  beforeEach(() => {
    useCartStore.setState({
      items: [],
      persistedItems: [],
      serverCart: null,
      serverCartId: null,
      serverCartWarnings: [],
      isOpen: false,
    });
  });

  it("sets serverCart, serverCartId, and persistedItems", () => {
    useCartStore.getState().setServerCart(baseServerCart);
    const s = useCartStore.getState();
    expect(s.serverCart?.id).toBe("cart-1");
    expect(s.serverCartId).toBe("cart-1");
    expect(s.persistedItems).toEqual([{ variant_id: "variant-1", quantity: 5 }]);
  });

  it("itemCount() reads from serverCart.item_count", () => {
    useCartStore.getState().setServerCart(baseServerCart);
    expect(useCartStore.getState().itemCount()).toBe(5);
  });

  it("subtotal() reads from serverCart.pricing.subtotal", () => {
    useCartStore.getState().setServerCart(baseServerCart);
    expect(useCartStore.getState().subtotal()).toBe(500);
  });
});

describe("CartStore — updateItemQtyInServerCart (optimistic)", () => {
  beforeEach(() => {
    useCartStore.setState({
      items: [],
      persistedItems: [],
      serverCart: baseServerCart,
      serverCartId: "cart-1",
      serverCartWarnings: [],
      isOpen: false,
    });
  });

  it("updates quantity and recalculates item_count + subtotal", () => {
    // qty 5 → 9: item_count = 9, subtotal = 9 × 100 = 900
    useCartStore.getState().updateItemQtyInServerCart("variant-1", 9);
    const s = useCartStore.getState();
    expect(s.serverCart?.items[0].quantity).toBe(9);
    expect(s.serverCart?.item_count).toBe(9);
    expect(s.serverCart?.pricing.subtotal).toBe(900);
  });

  it("is a no-op for unknown variant", () => {
    useCartStore.getState().updateItemQtyInServerCart("variant-unknown", 3);
    // State should be unchanged
    expect(useCartStore.getState().serverCart?.item_count).toBe(5);
  });
});

describe("CartStore — removeItemFromServerCart (optimistic)", () => {
  beforeEach(() => {
    useCartStore.setState({
      items: [],
      persistedItems: [],
      serverCart: baseServerCart,
      serverCartId: "cart-1",
      serverCartWarnings: [],
      isOpen: false,
    });
  });

  it("removes item and decrements item_count + subtotal", () => {
    useCartStore.getState().removeItemFromServerCart("variant-1");
    const s = useCartStore.getState();
    expect(s.serverCart?.items).toHaveLength(0);
    expect(s.serverCart?.item_count).toBe(0);
    expect(s.serverCart?.pricing.subtotal).toBe(0);
  });

  it("restoreServerCart reverts to snapshot", () => {
    useCartStore.getState().removeItemFromServerCart("variant-1");
    useCartStore.getState().restoreServerCart(baseServerCart);
    expect(useCartStore.getState().serverCart?.item_count).toBe(5);
  });
});
