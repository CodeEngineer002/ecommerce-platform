/**
 * Cart domain errors.
 *
 * All cart errors extend AppError so `withApiHandler` maps them to
 * the correct HTTP status codes automatically.
 */

import { AppError, ConflictError, ForbiddenError, NotFoundError } from "@/lib/errors";

// ── Cart not found ────────────────────────────────────────────────────────────

export class CartNotFoundError extends NotFoundError {
  constructor(cartId?: string) {
    super(
      cartId ? `Cart '${cartId}' not found` : "Cart not found",
      "CART_NOT_FOUND",
    );
  }
}

// ── Cart status violations ─────────────────────────────────────────────────────

export class CartNotActiveError extends ConflictError {
  constructor(status: string) {
    super(`Cart cannot be modified — current status is '${status}'`, "CART_NOT_ACTIVE");
  }
}

export class CartAlreadyConvertedError extends ConflictError {
  constructor() {
    super("This cart has already been converted to an order", "CART_ALREADY_CONVERTED");
  }
}

export class CartExpiredError extends ConflictError {
  constructor() {
    super("This cart has expired. Please start a new cart.", "CART_EXPIRED");
  }
}

// ── Ownership / access ────────────────────────────────────────────────────────

export class CartOwnershipError extends ForbiddenError {
  constructor() {
    super("You do not have permission to access this cart", "CART_OWNERSHIP_VIOLATION");
  }
}

// ── Item / variant errors ─────────────────────────────────────────────────────

export class CartItemNotFoundError extends NotFoundError {
  constructor(variantId: string) {
    super(`Item with variant '${variantId}' not found in cart`, "CART_ITEM_NOT_FOUND");
  }
}

export class ProductUnavailableError extends AppError {
  constructor(name: string) {
    super(`Product '${name}' is no longer available`, "PRODUCT_UNAVAILABLE", 422);
  }
}

export class VariantUnavailableError extends AppError {
  constructor(variantId: string) {
    super(`Variant '${variantId}' is not available`, "VARIANT_UNAVAILABLE", 422);
  }
}

export class QuantityExceedsStockError extends AppError {
  constructor(available: number) {
    super(
      `Only ${available} unit${available === 1 ? "" : "s"} available`,
      "QUANTITY_EXCEEDS_STOCK",
      422,
    );
  }
}

export class InvalidCartQuantityError extends AppError {
  constructor(max: number) {
    super(`Quantity must be between 1 and ${max}`, "INVALID_CART_QUANTITY", 422);
  }
}

// ── Coupon errors ─────────────────────────────────────────────────────────────

export class CartCouponError extends AppError {
  constructor(message: string, code = "CART_COUPON_ERROR") {
    super(message, code, 422);
  }
}

// ── Checkout handoff errors ───────────────────────────────────────────────────

export class EmptyCartError extends AppError {
  constructor() {
    super("Cannot checkout with an empty cart", "EMPTY_CART", 422);
  }
}

export class CartValidationError extends AppError {
  constructor(message: string) {
    super(message, "CART_VALIDATION_FAILED", 422);
  }
}
