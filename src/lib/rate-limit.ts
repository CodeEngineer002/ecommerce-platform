/**
 * Rate limiter — Upstash Redis (primary) with in-memory fallback.
 *
 * ── Production / Vercel / multi-instance ─────────────────────────────────────
 * Set these env vars (from https://console.upstash.com → Redis → REST API):
 *   UPSTASH_REDIS_REST_URL=https://xxx.upstash.io
 *   UPSTASH_REDIS_REST_TOKEN=AXxx...
 *
 * When these are present, Upstash Redis is used — works on:
 *   ✅ Vercel Edge Runtime
 *   ✅ Multi-instance Node.js (Railway, Render, Fly.io)
 *   ✅ Serverless functions
 *
 * ── Local development / fallback ─────────────────────────────────────────────
 * When env vars are absent, falls back to in-memory sliding window (same interface).
 * Safe for local dev and single-server setups where Redis is not available.
 */

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// ── Upstash client (only created when env vars are present) ───────────────────
function tryCreateRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

const redis = tryCreateRedis();

// ── Limiter registry: one Ratelimit instance per routeKey ─────────────────────
// Upstash recommends caching Ratelimit instances to reuse HTTP connections.
const upstashLimiters = new Map<string, Ratelimit>();

function getUpstashLimiter(routeKey: string, config: RateLimitConfig): Ratelimit {
  const cached = upstashLimiters.get(routeKey);
  if (cached) return cached;
  const limiter = new Ratelimit({
    redis: redis!,
    limiter: Ratelimit.slidingWindow(config.limit, `${config.windowMs}ms`),
    prefix: `ratelimit:${routeKey}`,
    analytics: false,
  });
  upstashLimiters.set(routeKey, limiter);
  return limiter;
}

// ── In-memory fallback (single-server / local dev) ───────────────────────────
interface MemWindow {
  count: number;
  resetAt: number;
}
const memStore = new Map<string, MemWindow>();
setInterval(() => {
  const now = Date.now();
  for (const [key, win] of memStore) {
    if (now >= win.resetAt) memStore.delete(key);
  }
}, 5 * 60 * 1000);

function checkMemoryLimit(key: string, config: RateLimitConfig): RateLimitResult {
  const now = Date.now();
  const existing = memStore.get(key);
  if (!existing || now >= existing.resetAt) {
    const resetAt = now + config.windowMs;
    memStore.set(key, { count: 1, resetAt });
    return { success: true, limit: config.limit, remaining: config.limit - 1, resetAt };
  }
  existing.count += 1;
  const remaining = Math.max(0, config.limit - existing.count);
  return {
    success: existing.count <= config.limit,
    limit: config.limit,
    remaining,
    resetAt: existing.resetAt,
  };
}

// ── Public types ──────────────────────────────────────────────────────────────

export interface RateLimitConfig {
  /** Maximum requests allowed within the window */
  limit: number;
  /** Window duration in milliseconds */
  windowMs: number;
}

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  /** Unix timestamp (ms) when the current window resets */
  resetAt: number;
}

// ── Unified check function ─────────────────────────────────────────────────────

/**
 * Check and record a request against the rate limit for `key`.
 * Automatically uses Upstash Redis if configured, otherwise in-memory.
 */
export async function checkRateLimit(
  key: string,
  config: RateLimitConfig & { routeKey: string },
): Promise<RateLimitResult> {
  if (redis) {
    const limiter = getUpstashLimiter(config.routeKey, config);
    const result = await limiter.limit(key);
    return {
      success: result.success,
      limit: result.limit,
      remaining: result.remaining,
      resetAt: result.reset,
    };
  }
  // Fallback: synchronous in-memory check
  return checkMemoryLimit(key, config);
}

// ── IP extraction ─────────────────────────────────────────────────────────────

/**
 * Extracts the real client IP from standard proxy/edge headers.
 * Falls back to `"unknown"` if none are present.
 */
export function getClientIp(headers: Headers): string {
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    headers.get("cf-connecting-ip") ??
    headers.get("x-real-ip") ??
    "unknown"
  );
}

// ── Route handler wrapper ─────────────────────────────────────────────────────

/**
 * Higher-order function that wraps a Next.js App Router route handler
 * with rate limiting. Works identically whether using Upstash or in-memory.
 *
 * @example
 * export const POST = withRateLimit(
 *   withApiHandler(async (req) => { ... }),
 *   { limit: 5, windowMs: 60_000, routeKey: "orders:create" }
 * );
 */
export function withRateLimit(
  handler: (request: Request) => Promise<Response>,
  config: RateLimitConfig & { routeKey: string },
): (request: Request) => Promise<Response> {
  return async (request: Request): Promise<Response> => {
    const ip = getClientIp(request.headers);
    const result = await checkRateLimit(`${config.routeKey}:${ip}`, config);

    if (!result.success) {
      const retryAfter = Math.ceil((result.resetAt - Date.now()) / 1000);
      return Response.json(
        { error: "Too many requests. Please slow down and try again." },
        {
          status: 429,
          headers: {
            "Retry-After": String(retryAfter),
            "X-RateLimit-Limit": String(result.limit),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": String(result.resetAt),
          },
        },
      );
    }

    const response = await handler(request);

    // Attach rate limit info headers to successful responses too
    response.headers.set("X-RateLimit-Limit", String(result.limit));
    response.headers.set("X-RateLimit-Remaining", String(result.remaining));
    response.headers.set("X-RateLimit-Reset", String(result.resetAt));

    return response;
  };
}
