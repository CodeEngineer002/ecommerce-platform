import { beforeEach, describe, expect, it } from "vitest";

import { useCartStore } from "@/store/cart-store";
import type { CartItemWithProduct } from "@/types";

const mockItem: CartItemWithProduct = {
  id: "item-1",
  cart_id: "cart-1",
  variant_id: "variant-1",
  quantity: 1,
  added_at: new Date().toISOString(),
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
});
