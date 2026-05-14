/**
 * Typed error hierarchy for the application.
 *
 * Why typed errors vs plain Error:
 * - Callers can distinguish error categories without string-matching messages
 * - API routes can map error types to HTTP status codes deterministically
 * - Errors carry structured context (code, statusCode) for logging
 *
 * Usage pattern in API routes:
 *   throw new NotFoundError("Product not found");
 *   // or
 *   throw new InventoryError("Insufficient stock", "STOCK_DEPLETED");
 */

export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string = "INTERNAL_ERROR",
    public readonly statusCode: number = 500,
  ) {
    super(message);
    this.name = this.constructor.name;
    // Maintains proper stack trace in V8
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

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

export class NotFoundError extends AppError {
  constructor(message = "Not found", code = "NOT_FOUND") {
    super(message, code, 404);
  }
}

export class ValidationError extends AppError {
  constructor(
    message: string,
    public readonly fieldErrors?: Record<string, string[]>,
    code = "VALIDATION_ERROR",
  ) {
    super(message, code, 400);
  }
}

export class ConflictError extends AppError {
  constructor(message: string, code = "CONFLICT") {
    super(message, code, 409);
  }
}

export class InventoryError extends ConflictError {
  constructor(message = "Insufficient stock", code = "INSUFFICIENT_STOCK") {
    super(message, code);
  }
}

export class PaymentError extends AppError {
  constructor(message: string, code = "PAYMENT_ERROR") {
    super(message, code, 402);
  }
}

export class RateLimitError extends AppError {
  constructor(message = "Too many requests", code = "RATE_LIMITED") {
    super(message, code, 429);
  }
}

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
