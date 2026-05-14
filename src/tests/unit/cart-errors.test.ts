/**
 * Unit tests — cart domain errors
 */

import { describe, expect, it } from "vitest";

import {
  CartAlreadyConvertedError,
  CartCouponError,
  CartExpiredError,
  CartItemNotFoundError,
  CartNotActiveError,
  CartNotFoundError,
  CartOwnershipError,
  CartValidationError,
  EmptyCartError,
  InvalidCartQuantityError,
  ProductUnavailableError,
  QuantityExceedsStockError,
  VariantUnavailableError,
} from "@/domain/cart/errors";
import { AppError } from "@/lib/errors";

describe("CartNotFoundError", () => {
  it("is an AppError with 404 status", () => {
    const err = new CartNotFoundError();
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe("CART_NOT_FOUND");
  });

  it("includes cartId in message when provided", () => {
    const err = new CartNotFoundError("abc-123");
    expect(err.message).toContain("abc-123");
  });

  it("uses generic message when no cartId", () => {
    const err = new CartNotFoundError();
    expect(err.message).toBe("Cart not found");
  });
});

describe("CartNotActiveError", () => {
  it("is a 409 ConflictError", () => {
    const err = new CartNotActiveError("expired");
    expect(err.statusCode).toBe(409);
    expect(err.code).toBe("CART_NOT_ACTIVE");
    expect(err.message).toContain("expired");
  });
});

describe("CartAlreadyConvertedError", () => {
  it("is a 409 ConflictError", () => {
    const err = new CartAlreadyConvertedError();
    expect(err.statusCode).toBe(409);
    expect(err.code).toBe("CART_ALREADY_CONVERTED");
  });
});

describe("CartExpiredError", () => {
  it("is a 409 ConflictError", () => {
    const err = new CartExpiredError();
    expect(err.statusCode).toBe(409);
    expect(err.code).toBe("CART_EXPIRED");
  });
});

describe("CartOwnershipError", () => {
  it("is a 403 ForbiddenError", () => {
    const err = new CartOwnershipError();
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe("CART_OWNERSHIP_VIOLATION");
  });
});

describe("CartItemNotFoundError", () => {
  it("is a 404 NotFoundError with variantId in message", () => {
    const err = new CartItemNotFoundError("variant-xyz");
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe("CART_ITEM_NOT_FOUND");
    expect(err.message).toContain("variant-xyz");
  });
});

describe("ProductUnavailableError", () => {
  it("is a 422 AppError with product name in message", () => {
    const err = new ProductUnavailableError("Blue Widget");
    expect(err.statusCode).toBe(422);
    expect(err.code).toBe("PRODUCT_UNAVAILABLE");
    expect(err.message).toContain("Blue Widget");
  });
});

describe("VariantUnavailableError", () => {
  it("is a 422 AppError with variantId in message", () => {
    const err = new VariantUnavailableError("v-001");
    expect(err.statusCode).toBe(422);
    expect(err.code).toBe("VARIANT_UNAVAILABLE");
    expect(err.message).toContain("v-001");
  });
});

describe("QuantityExceedsStockError", () => {
  it("is a 422 AppError with available count in message", () => {
    const err = new QuantityExceedsStockError(3);
    expect(err.statusCode).toBe(422);
    expect(err.code).toBe("QUANTITY_EXCEEDS_STOCK");
    expect(err.message).toContain("3");
  });

  it("uses singular 'unit' for 1 item", () => {
    const err = new QuantityExceedsStockError(1);
    expect(err.message).toContain("1 unit");
    expect(err.message).not.toContain("units");
  });

  it("uses plural 'units' for multiple items", () => {
    const err = new QuantityExceedsStockError(5);
    expect(err.message).toContain("5 units");
  });
});

describe("InvalidCartQuantityError", () => {
  it("is a 422 AppError with max in message", () => {
    const err = new InvalidCartQuantityError(10);
    expect(err.statusCode).toBe(422);
    expect(err.code).toBe("INVALID_CART_QUANTITY");
    expect(err.message).toContain("10");
  });
});

describe("CartCouponError", () => {
  it("is a 422 AppError with custom message", () => {
    const err = new CartCouponError("Coupon expired");
    expect(err.statusCode).toBe(422);
    expect(err.code).toBe("CART_COUPON_ERROR");
    expect(err.message).toBe("Coupon expired");
  });

  it("accepts custom error code", () => {
    const err = new CartCouponError("Usage limit reached", "COUPON_USAGE_LIMIT");
    expect(err.code).toBe("COUPON_USAGE_LIMIT");
  });
});

describe("EmptyCartError", () => {
  it("is a 422 AppError", () => {
    const err = new EmptyCartError();
    expect(err.statusCode).toBe(422);
    expect(err.code).toBe("EMPTY_CART");
  });
});

describe("CartValidationError", () => {
  it("is a 422 AppError with custom message", () => {
    const err = new CartValidationError("Cart has price changes");
    expect(err.statusCode).toBe(422);
    expect(err.code).toBe("CART_VALIDATION_FAILED");
    expect(err.message).toBe("Cart has price changes");
  });
});
