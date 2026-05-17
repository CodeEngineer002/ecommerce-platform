/**
 * Integration tests — cart service
 *
 * These tests mock the Supabase service client to verify that
 * cart-service.ts calls the correct tables and enforces ownership.
 *
 * The service imports createServiceClient from @/lib/supabase/server —
 * we vi.mock that module and inject controlled responses.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock BEFORE any import from cart-service to avoid module hoisting issues
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: vi.fn(),
  createClient: vi.fn(),
}));

vi.mock("@/domain/cart/cart-events", () => ({
  emitCartEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/domain/pricing/pricing-engine", () => ({
  calculatePricing: vi.fn().mockReturnValue({
    subtotal: 1000,
    discount: 0,
    estimated_shipping: 0,
    estimated_tax: 90,
    total: 1090,
  }),
  calculateDiscount: vi.fn().mockReturnValue(0),
}));

import { createServiceClient } from "@/lib/supabase/server";
import {
  CartNotFoundError,
  CartOwnershipError,
  EmptyCartError,
  InvalidCartQuantityError,
  QuantityExceedsStockError,
  VariantUnavailableError,
} from "@/domain/cart/errors";
import type { CartIdentity } from "@/domain/cart/types";

// ── Test fixtures ─────────────────────────────────────────────────────────────

const USER_ID = "user-abc-001";
const CART_ID = "cart-xyz-001";
const VARIANT_ID = "variant-001";

const mockCart = {
  id: CART_ID,
  user_id: USER_ID,
  session_id: null,
  status: "active",
  currency_code: "INR",
  country_id: "in",
  coupon_id: null,
  coupon_code: null,
  expires_at: new Date(Date.now() + 3600_000).toISOString(),
  abandoned_at: null,
  merged_from: null,
  converted_to_order_id: null,
  metadata: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  cart_items: [],
};

const mockVariant = {
  id: VARIANT_ID,
  price: 999,
  is_active: true,
  options: {},
  sku: "SKU-001",
  product: {
    id: "prod-001",
    name: "Test Widget",
    base_price: 999,
    is_active: true,
    images: [{ url: "https://cdn.example.com/img.jpg" }],
  },
  inventory: { quantity: 50, reserved: 5 },
};

const userIdentity: CartIdentity = {
  user_id: USER_ID,
  country_id: "in",
  currency_code: "INR",
};

// ── Helper: build a minimal chainable mock ────────────────────────────────────

function makeChain(resolvedData: unknown) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: resolvedData, error: null }),
    maybeSingle: vi.fn().mockResolvedValue({ data: resolvedData, error: null }),
    then: undefined as undefined,
  };
  // Make chain thenable so awaiting a terminal expression works
  Object.assign(chain, {
    [Symbol.iterator]: undefined,
  });
  return chain;
}

function buildDb(tableMap: Record<string, unknown>) {
  return {
    from: vi.fn().mockImplementation((table: string) => makeChain(tableMap[table] ?? null)),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("CartService — ownership enforcement", () => {
  it("throws CartOwnershipError when user_id does not match cart", async () => {
    const wrongIdentity: CartIdentity = {
      user_id: "other-user-999",
      country_id: "in",
      currency_code: "INR",
    };

    const cartWithItems = { ...mockCart, cart_items: [] };

    vi.mocked(createServiceClient).mockReturnValue(
      buildDb({ carts: cartWithItems }) as never,
    );

    const { getCart } = await import("@/domain/cart/cart-service");
    await expect(getCart(CART_ID, wrongIdentity)).rejects.toThrow(CartOwnershipError);
  });

  it("allows owner access", async () => {
    const cartWithItems = { ...mockCart, cart_items: [] };

    const db = buildDb({ carts: cartWithItems });
    vi.mocked(createServiceClient).mockReturnValue(db as never);

    const { getCart } = await import("@/domain/cart/cart-service");
    const result = await getCart(CART_ID, userIdentity);

    expect(result.id).toBe(CART_ID);
  });
});

describe("CartService — getCart", () => {
  it("throws CartNotFoundError when cart is missing", async () => {
    const db = {
      from: vi.fn().mockReturnValue({
        ...makeChain(null),
        single: vi.fn().mockResolvedValue({ data: null, error: { code: "PGRST116" } }),
      }),
      rpc: vi.fn(),
    };
    vi.mocked(createServiceClient).mockReturnValue(db as never);

    const { getCart } = await import("@/domain/cart/cart-service");
    await expect(getCart(CART_ID, userIdentity)).rejects.toThrow(CartNotFoundError);
  });
});

describe("CartService — addCartItem", () => {
  it("throws VariantUnavailableError when variant is inactive", async () => {
    const inactiveVariant = { ...mockVariant, is_active: false };
    const cartWithItems = { ...mockCart, cart_items: [] };

    // First call: cart (from), second call: variant (from)
    let callCount = 0;
    const db = {
      from: vi.fn().mockImplementation(() => {
        callCount++;
        // Return cart on first call, inactive variant on second
        return makeChain(callCount === 1 ? cartWithItems : inactiveVariant);
      }),
      rpc: vi.fn(),
    };
    vi.mocked(createServiceClient).mockReturnValue(db as never);

    const { addCartItem } = await import("@/domain/cart/cart-service");
    await expect(
      addCartItem(CART_ID, userIdentity, { variant_id: VARIANT_ID, quantity: 1 }),
    ).rejects.toThrow(VariantUnavailableError);
  });

  it("throws QuantityExceedsStockError when quantity exceeds available inventory", async () => {
    const lowStockVariant = {
      ...mockVariant,
      inventory: { quantity: 2, reserved: 0 },
    };
    const cartWithItems = { ...mockCart, cart_items: [] };

    let callCount = 0;
    const db = {
      from: vi.fn().mockImplementation(() => {
        callCount++;
        return makeChain(callCount === 1 ? cartWithItems : lowStockVariant);
      }),
      rpc: vi.fn(),
    };
    vi.mocked(createServiceClient).mockReturnValue(db as never);

    const { addCartItem } = await import("@/domain/cart/cart-service");
    await expect(
      addCartItem(CART_ID, userIdentity, { variant_id: VARIANT_ID, quantity: 5 }),
    ).rejects.toThrow(QuantityExceedsStockError);
  });

  it("throws InvalidCartQuantityError for quantity 0", async () => {
    const cartWithItems = { ...mockCart, cart_items: [] };
    const db = buildDb({ carts: cartWithItems });
    vi.mocked(createServiceClient).mockReturnValue(db as never);

    const { addCartItem } = await import("@/domain/cart/cart-service");
    await expect(
      addCartItem(CART_ID, userIdentity, { variant_id: VARIANT_ID, quantity: 0 }),
    ).rejects.toThrow(InvalidCartQuantityError);
  });
});

describe("CartService — validateCartForCheckout", () => {
  it("throws EmptyCartError for cart with no items", async () => {
    const cartWithItems = { ...mockCart, cart_items: [] };
    const db = buildDb({ carts: cartWithItems });
    vi.mocked(createServiceClient).mockReturnValue(db as never);

    const { validateCartForCheckout } = await import("@/domain/cart/cart-service");
    await expect(validateCartForCheckout(CART_ID, userIdentity)).rejects.toThrow(EmptyCartError);
  });
});

// ── addCartItem — ADDITIVE merge behavior + add_result ────────────────────────

/**
 * Builds a mock DB that serves responses in call order.
 * Each call to `db.from(table)` pops the next response from the queue.
 */
function makeSequentialDb(responses: unknown[]) {
  let idx = 0;
  return {
    from: vi.fn().mockImplementation(() => {
      const data = responses[idx++] ?? null;
      return {
        select: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
        delete: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        neq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        lte: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data, error: null }),
        maybeSingle: vi.fn().mockResolvedValue({ data, error: null }),
      };
    }),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  };
}

const mockVariantWithLevels = {
  id: VARIANT_ID,
  price: 999,
  is_active: true,
  options: { color: "Black", size: "XL" },
  sku: "FASH-003-BLK-XL",
  product: {
    id: "prod-001",
    name: "Oversized Premium Hoodie",
    base_price: 999,
    is_active: true,
    images: [{ url: "https://cdn.example.com/img.jpg" }],
  },
  // inventory_levels as array (PostgREST shape)
  inventory_levels: [{ quantity: 20, reserved: 0 }],
};

describe("CartService — addCartItem: ADDITIVE behavior and add_result", () => {
  it("returns add_result.was_new_item=true for brand-new cart line", async () => {
    // Sequence: cart → variant → existing item (null = not in cart) → upsert
    // Then buildCartSummary: cart-with-items → variants-for-summary
    const cartWithItems = { ...mockCart, cart_items: [{ id: "ci-1", variant_id: VARIANT_ID, quantity: 5, unit_price_snapshot: 999, added_at: "", updated_at: "" }] };
    const db = makeSequentialDb([
      mockCart,             // getCart ownership check
      mockVariantWithLevels, // fetchVariant
      null,                  // existing item check: null = brand-new item
      // buildCartSummary calls: carts then product_variants
      cartWithItems,
      [mockVariantWithLevels],
    ]);
    vi.mocked(createServiceClient).mockReturnValue(db as never);

    const { addCartItem } = await import("@/domain/cart/cart-service");
    const result = await addCartItem(CART_ID, userIdentity, { variant_id: VARIANT_ID, quantity: 5 });

    expect(result.add_result).toBeDefined();
    expect(result.add_result?.was_new_item).toBe(true);
    expect(result.add_result?.previous_quantity).toBe(0);
    expect(result.add_result?.added_quantity).toBe(5);
    expect(result.add_result?.final_quantity).toBe(5);
    expect(result.add_result?.was_capped).toBe(false);
  });

  it("returns add_result with additive quantities for existing line", async () => {
    const existingItem = { id: "ci-1", quantity: 10 };
    const cartWithItems = { ...mockCart, cart_items: [{ id: "ci-1", variant_id: VARIANT_ID, quantity: 19, unit_price_snapshot: 999, added_at: "", updated_at: "" }] };
    const db = makeSequentialDb([
      mockCart,
      mockVariantWithLevels,   // stock: 20 available
      existingItem,             // existing: qty 10
      cartWithItems,
      [mockVariantWithLevels],
    ]);
    vi.mocked(createServiceClient).mockReturnValue(db as never);

    const { addCartItem } = await import("@/domain/cart/cart-service");
    // Add 9 on top of existing 10 → total 19 (stock=20, so not capped)
    const result = await addCartItem(CART_ID, userIdentity, { variant_id: VARIANT_ID, quantity: 9 });

    expect(result.add_result?.was_new_item).toBe(false);
    expect(result.add_result?.previous_quantity).toBe(10);
    expect(result.add_result?.added_quantity).toBe(9);
    expect(result.add_result?.final_quantity).toBe(19);
    expect(result.add_result?.was_capped).toBe(false);
  });

  it("caps final quantity at available stock and sets was_capped=true", async () => {
    const lowStockVariant = {
      ...mockVariantWithLevels,
      inventory_levels: [{ quantity: 12, reserved: 0 }], // only 12 available
    };
    const existingItem = { id: "ci-1", quantity: 10 };
    const cartWithItems = { ...mockCart, cart_items: [{ id: "ci-1", variant_id: VARIANT_ID, quantity: 12, unit_price_snapshot: 999, added_at: "", updated_at: "" }] };
    const db = makeSequentialDb([
      mockCart,
      lowStockVariant,
      existingItem,   // existing: qty 10
      cartWithItems,
      [lowStockVariant],
    ]);
    vi.mocked(createServiceClient).mockReturnValue(db as never);

    const { addCartItem } = await import("@/domain/cart/cart-service");
    // Requesting 9 more, existing 10, stock 12 → capped to 12
    const result = await addCartItem(CART_ID, userIdentity, { variant_id: VARIANT_ID, quantity: 9 });

    expect(result.add_result?.final_quantity).toBe(12);
    expect(result.add_result?.was_capped).toBe(true);
  });

  it("throws QuantityExceedsStockError when stock is completely exhausted", async () => {
    const oosVariant = {
      ...mockVariantWithLevels,
      inventory_levels: [{ quantity: 5, reserved: 5 }], // 0 available
    };
    const db = makeSequentialDb([mockCart, oosVariant]);
    vi.mocked(createServiceClient).mockReturnValue(db as never);

    const { addCartItem } = await import("@/domain/cart/cart-service");
    await expect(
      addCartItem(CART_ID, userIdentity, { variant_id: VARIANT_ID, quantity: 1 }),
    ).rejects.toThrow(QuantityExceedsStockError);
  });
});
