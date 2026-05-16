/**
 * Lightweight performance measurement utility.
 *
 * In development: logs timing + warnings for slow operations.
 * In production: no-op (tree-shaken away by the bundler).
 *
 * Usage:
 *   const end = perfMark("cart-fetch");
 *   const data = await fetchCart();
 *   end();  // logs "[perf] cart-fetch: 423ms" in dev; warns if > threshold
 *
 * Or with the async wrapper:
 *   const data = await perfAsync("checkout-load", fetchCheckoutData());
 */

const isDev = process.env.NODE_ENV === "development";

const SLOW_THRESHOLD_MS = 1000;

/**
 * Starts a performance mark. Returns a function that stops the mark and logs
 * the duration. No-op in production.
 */
export function perfMark(label: string): () => number {
  if (!isDev) return () => 0;
  const start = performance.now();
  return () => {
    const ms = Math.round(performance.now() - start);
    if (ms >= SLOW_THRESHOLD_MS) {
      console.warn(`[perf:slow] ⚠ ${label}: ${ms}ms (threshold ${SLOW_THRESHOLD_MS}ms)`);
    } else {
      console.debug(`[perf] ${label}: ${ms}ms`);
    }
    return ms;
  };
}

/**
 * Wraps an async operation with performance measurement.
 * Returns the resolved value of the promise.
 */
export async function perfAsync<T>(label: string, promise: Promise<T>): Promise<T> {
  const end = perfMark(label);
  try {
    const result = await promise;
    end();
    return result;
  } catch (err) {
    end();
    throw err;
  }
}

/**
 * Wraps an async API route handler with timing. Server-side only.
 * Logs "POST /api/orders/create: 834ms" style entries in dev.
 */
export function withPerfLogging<T>(
  label: string,
  fn: () => Promise<T>,
): Promise<T> {
  return perfAsync(label, fn());
}
