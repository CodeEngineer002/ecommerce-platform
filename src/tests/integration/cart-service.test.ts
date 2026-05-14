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
