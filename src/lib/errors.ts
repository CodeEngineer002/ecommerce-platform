export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string = "INTERNAL_ERROR",
    public readonly statusCode: number = 500,
  ) {
    super(message);
    this.name = this.constructor.name;
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

// ── Auth ──────────────────────────────────────────────────────────────────────
export class AuthError extends AppError {
  constructor(message = "Unauthorized", code = "UNAUTHORIZED") {
    super(message, code, 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Forbidden", code = "FORBIDDEN") {
    super(message, code, 403);
  }
}

export class UnauthorizedOrderAccessError extends ForbiddenError {
  constructor() {
    super("You do not have permission to access this order", "UNAUTHORIZED_ORDER_ACCESS");
  }
}

// ── Not found ─────────────────────────────────────────────────────────────────
export class NotFoundError extends AppError {
  constructor(message = "Not found", code = "NOT_FOUND") {
    super(message, code, 404);
  }
}

// ── Validation ────────────────────────────────────────────────────────────────
export class ValidationError extends AppError {
  constructor(
    message: string,
    public readonly fieldErrors?: Record<string, string[]>,
    code = "VALIDATION_ERROR",
  ) {
    super(message, code, 400);
  }
}

// ── Conflict / business rule violations ──────────────────────────────────────
export class ConflictError extends AppError {
  constructor(message: string, code = "CONFLICT") {
    super(message, code, 409);
  }
}

export class ConcurrencyError extends ConflictError {
  constructor(message = "Request conflict — please retry", code = "CONCURRENCY_CONFLICT") {
    super(message, code);
  }
}

export class DuplicateCheckoutError extends ConflictError {
  constructor() {
    super("An order for this checkout already exists", "DUPLICATE_CHECKOUT");
  }
}

// ── Order lifecycle ───────────────────────────────────────────────────────────
export class OrderStateError extends AppError {
  constructor(message: string, code = "INVALID_STATE_TRANSITION") {
    super(message, code, 409);
  }
}

// ── Inventory ─────────────────────────────────────────────────────────────────
export class InventoryError extends ConflictError {
  constructor(message = "Insufficient stock", code = "INSUFFICIENT_STOCK") {
    super(message, code);
  }
}

export class InventoryReservationFailedError extends InventoryError {
  constructor(variantId: string) {
    super(`Failed to reserve inventory for variant ${variantId}`, "INVENTORY_RESERVATION_FAILED");
  }
}

// ── Product / Variant ─────────────────────────────────────────────────────────
export class ProductNotAvailableError extends NotFoundError {
  constructor(identifier: string) {
    super(`Product '${identifier}' is not available`, "PRODUCT_NOT_AVAILABLE");
  }
}

export class VariantOutOfStockError extends InventoryError {
  constructor(variantId: string) {
    super(`Variant '${variantId}' is out of stock`, "VARIANT_OUT_OF_STOCK");
  }
}

// ── Coupons ───────────────────────────────────────────────────────────────────
export class CouponError extends AppError {
  constructor(message: string, code = "COUPON_INVALID") {
    super(message, code, 422);
  }
}

export class InvalidCouponError extends CouponError {
  constructor() {
    super("Coupon not found or inactive", "INVALID_COUPON");
  }
}

export class CouponExpiredError extends CouponError {
  constructor() {
    super("This coupon has expired", "COUPON_EXPIRED");
  }
}

// ── Payments ──────────────────────────────────────────────────────────────────
export class PaymentError extends AppError {
  constructor(message: string, code = "PAYMENT_ERROR") {
    super(message, code, 402);
  }
}

export class PaymentVerificationFailedError extends PaymentError {
  constructor() {
    super("Payment verification failed", "PAYMENT_VERIFICATION_FAILED");
  }
}

// ── Returns / Refunds ─────────────────────────────────────────────────────────
export class ReturnNotEligibleError extends AppError {
  constructor(reason: string) {
    super(reason, "RETURN_NOT_ELIGIBLE", 422);
  }
}

export class RefundNotAllowedError extends AppError {
  constructor(reason: string) {
    super(reason, "REFUND_NOT_ALLOWED", 422);
  }
}

// ── Rate limiting ─────────────────────────────────────────────────────────────
export class RateLimitError extends AppError {
  constructor(message = "Too many requests", code = "RATE_LIMITED") {
    super(message, code, 429);
  }
}

// ── Utilities ─────────────────────────────────────────────────────────────────
/** Narrow an unknown catch value to a safe error message string. */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "An unexpected error occurred";
}

/** Returns true when the error should be treated as an expected business error. */
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
