/**
 * Standardized API response utilities.
 *
 * All Route Handlers should return responses through these helpers so:
 * - Response shapes are consistent (clients always see { data } or { error })
 * - HTTP status codes are determined from error types, not scattered if-blocks
 * - Internal error details are never leaked to clients
 * - Logging happens in one place
 */

import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { AppError, getErrorMessage } from "./errors";
import { logger } from "./logger";

// ── Response shapes ────────────────────────────────────────────────────────────

export type ApiSuccess<T> = { data: T; error: null };
export type ApiError = {
  data: null;
  error: { message: string; code: string; fields?: Record<string, string[]> };
};
export type ApiResponse<T> = ApiSuccess<T> | ApiError;

// ── Helpers used in Route Handlers ────────────────────────────────────────────

export function apiSuccess<T>(data: T, status = 200): NextResponse<ApiSuccess<T>> {
  return NextResponse.json({ data, error: null }, { status });
}

export function apiError(
  message: string,
  status = 500,
  code = "INTERNAL_ERROR",
  fields?: Record<string, string[]>,
): NextResponse<ApiError> {
  return NextResponse.json(
    { data: null, error: { message, code, ...(fields && { fields }) } },
    { status },
  );
}

/**
 * Wraps a Route Handler body in consistent error handling.
 *
 * Usage:
 *   export const POST = withApiHandler(async (req) => {
 *     const data = await doSomething();
 *     return apiSuccess(data);
 *   });
 */
export function withApiHandler<T extends unknown[]>(
  handler: (...args: T) => Promise<NextResponse>,
): (...args: T) => Promise<NextResponse> {
  return async (...args: T) => {
    try {
      return await handler(...args);
    } catch (error) {
      // AppErrors carry status codes and structured context
      if (error instanceof AppError) {
        return apiError(error.message, error.statusCode, error.code);
      }

      // Zod errors that escape handler-level validation
      if (error instanceof ZodError) {
        return apiError(
          "Validation failed",
          400,
          "VALIDATION_ERROR",
          error.flatten().fieldErrors as Record<string, string[]>,
        );
      }

      // Unknown errors: log full context server-side, return generic message
      logger.error("[API Error] Unhandled exception in route handler", error);
      return apiError(
        process.env.NODE_ENV === "development"
          ? getErrorMessage(error)
          : "An internal error occurred",
        500,
      );
    }
  };
}

// ── Client-side fetch helper ──────────────────────────────────────────────────

export class ApiRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

/**
 * Typed fetch wrapper for client components calling internal API routes.
 * Throws ApiRequestError on HTTP errors so callers get structured failures.
 *
 * Usage:
 *   const { data } = await apiFetch<{ orderId: string }>("/api/orders/create", {
 *     method: "POST",
 *     body: JSON.stringify(payload),
 *   });
 */
export async function apiFetch<T>(
  url: string,
  init?: RequestInit,
): Promise<ApiSuccess<T>> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });

  const json = (await res.json()) as ApiResponse<T>;

  if (!res.ok || json.error) {
    throw new ApiRequestError(
      json.error?.message ?? "Request failed",
      res.status,
      json.error?.code ?? "UNKNOWN",
    );
  }

  return json as ApiSuccess<T>;
}
