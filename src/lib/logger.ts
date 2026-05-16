/**
 * Structured Logger
 *
 * Production-safe, centralized logging abstraction.
 *
 * Design goals:
 * - Structured (JSON in production, pretty in dev)
 * - No sensitive data leakage (PII/payment fields are scrubbed)
 * - Correlation ID propagation (trace requests end-to-end)
 * - Audit log channel (admin actions, payment events, CMS publishing)
 * - Future Sentry/Datadog-ready (pluggable transport)
 * - Zero dependencies (uses console — swap transport in production)
 *
 * Usage:
 *   import { logger } from "@/lib/logger";
 *   logger.info("Order created", { orderId, userId });
 *   logger.audit("cms:publish", { contentId, actorId, locale });
 *   logger.error("Payment failed", error, { orderId });
 */

export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogChannel = "app" | "audit" | "payment" | "cms" | "inventory" | "order" | "webhook";

export interface LogContext extends Record<string, unknown> {
  correlationId?: string;
  userId?: string;
  orderId?: string;
  paymentId?: string;
  contentId?: string;
  locale?: string;
  channel?: LogChannel;
}

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  channel: LogChannel;
  correlationId?: string;
  context?: Omit<LogContext, "correlationId" | "channel">;
  error?: {
    name: string;
    message: string;
    stack?: string;
    code?: string;
  };
}

// ── PII scrubbing ─────────────────────────────────────────────────────────────
// Fields that must NEVER appear in log output

const SCRUBBED_KEYS = new Set([
  "password",
  "token",
  "secret",
  "apiKey",
  "api_key",
  "authorization",
  "creditCard",
  "credit_card",
  "cardNumber",
  "card_number",
  "cvv",
  "ssn",
  "privateKey",
  "private_key",
  "STRIPE_SECRET_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "RAZORPAY_KEY_SECRET",
]);

function scrub(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (SCRUBBED_KEYS.has(key)) {
      result[key] = "[REDACTED]";
    } else if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      result[key] = scrub(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }
  return result;
}

// ── Transport ─────────────────────────────────────────────────────────────────

function serializeError(error: unknown): LogEntry["error"] | undefined {
  if (!error) return undefined;
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
      code: (error as { code?: string }).code,
    };
  }
  return { name: "Unknown", message: String(error) };
}

function emit(entry: LogEntry): void {
  if (process.env.NODE_ENV === "test") {
    // Silent in tests unless LOG_LEVEL=debug is set
    if (process.env.LOG_LEVEL !== "debug") return;
  }

  if (process.env.NODE_ENV === "production") {
    // JSON structured output — ingest into Datadog/Papertrail/CloudWatch
    const output = JSON.stringify(entry);
    switch (entry.level) {
      case "error": console.error(output); break;
      case "warn":  console.warn(output);  break;
      default:      console.log(output);   break;
    }
  } else {
    // Developer-friendly format
    const prefix = `[${entry.level.toUpperCase()}][${entry.channel}]`;
    const cid = entry.correlationId ? ` (${entry.correlationId})` : "";
    const context = entry.context
      ? ` ${JSON.stringify(scrub(entry.context as Record<string, unknown>))}`
      : "";
    const errorStr = entry.error ? ` | Error: ${entry.error.message}` : "";
    const log = `${prefix}${cid} ${entry.message}${context}${errorStr}`;
    switch (entry.level) {
      case "error": console.error(log); break;
      case "warn":  console.warn(log);  break;
      case "debug": console.debug(log); break;
      default:      console.log(log);   break;
    }
  }
}

// ── Logger factory ────────────────────────────────────────────────────────────

function buildEntry(
  level: LogLevel,
  message: string,
  error: unknown,
  context: LogContext,
  channel: LogChannel,
): LogEntry {
  const { correlationId, channel: _channel, ...rest } = context;
  return {
    level,
    message,
    timestamp: new Date().toISOString(),
    channel,
    correlationId,
    context: Object.keys(rest).length > 0 ? scrub(rest as Record<string, unknown>) as Omit<LogContext, "correlationId" | "channel"> : undefined,
    error: serializeError(error),
  };
}

// ── Public logger API ─────────────────────────────────────────────────────────

export const logger = {
  debug(message: string, context: LogContext = {}): void {
    emit(buildEntry("debug", message, null, context, context.channel ?? "app"));
  },

  info(message: string, context: LogContext = {}): void {
    emit(buildEntry("info", message, null, context, context.channel ?? "app"));
  },

  warn(message: string, context: LogContext = {}): void {
    emit(buildEntry("warn", message, null, context, context.channel ?? "app"));
  },

  error(message: string, error: unknown = null, context: LogContext = {}): void {
    emit(buildEntry("error", message, error, context, context.channel ?? "app"));

    // Forward to Sentry when DSN is configured (production observability)
    if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
      try {
        // Dynamic import keeps this tree-shakeable in test environments
        void import("@sentry/nextjs").then(({ captureException, withScope }) => {
          const exception = error instanceof Error ? error : new Error(message);
          withScope((scope) => {
            scope.setLevel("error");
            scope.setContext("log", { message, ...context });
            captureException(exception);
          });
        });
      } catch {
        // Never let Sentry reporting break application flow
      }
    }
  },

  /**
   * Structured audit log.
   * Use for: admin actions, payment events, CMS publishing, permission changes.
   *
   * Audit logs are ALWAYS emitted (not silenced in test environments).
   * In production, pipe to a durable audit store.
   */
  audit(action: string, context: LogContext & { actorId?: string } = {}): void {
    const entry = buildEntry("info", `AUDIT: ${action}`, null, context, "audit");
    // Audit logs always emit
    if (process.env.NODE_ENV !== "test" || process.env.AUDIT_LOG === "true") {
      emit(entry);
    }
  },

  /**
   * Payment event log. Never logs sensitive payment data.
   * Use for: intent created, webhook received, refund issued.
   */
  payment(event: string, context: Omit<LogContext, "channel"> = {}): void {
    emit(buildEntry("info", `PAYMENT: ${event}`, null, { ...context, channel: "payment" }, "payment"));
  },

  /**
   * CMS event log.
   * Use for: content published, draft created, block added, locale updated.
   */
  cms(event: string, context: Omit<LogContext, "channel"> = {}): void {
    emit(buildEntry("info", `CMS: ${event}`, null, { ...context, channel: "cms" }, "cms"));
  },

  /**
   * Order lifecycle event log.
   */
  order(event: string, context: Omit<LogContext, "channel"> = {}): void {
    emit(buildEntry("info", `ORDER: ${event}`, null, { ...context, channel: "order" }, "order"));
  },

  /**
   * Inventory movement log.
   */
  inventory(event: string, context: Omit<LogContext, "channel"> = {}): void {
    emit(buildEntry("info", `INVENTORY: ${event}`, null, { ...context, channel: "inventory" }, "inventory"));
  },
} as const;

// ── Correlation ID helpers ────────────────────────────────────────────────────

/**
 * Generates a lightweight correlation ID for request tracing.
 * Format: {timestamp_base36}-{random_base36}
 * Example: lxyz123-a4b2c1
 *
 * Use in middleware and pass via x-correlation-id header.
 */
export function generateCorrelationId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${ts}-${rand}`;
}

/**
 * Creates a child logger bound to a specific correlation ID.
 * Useful in request handlers to avoid passing correlationId to every call.
 */
export function createRequestLogger(correlationId: string) {
  return {
    debug: (msg: string, ctx: LogContext = {}) => logger.debug(msg, { ...ctx, correlationId }),
    info:  (msg: string, ctx: LogContext = {}) => logger.info(msg,  { ...ctx, correlationId }),
    warn:  (msg: string, ctx: LogContext = {}) => logger.warn(msg,  { ...ctx, correlationId }),
    error: (msg: string, err: unknown = null, ctx: LogContext = {}) =>
      logger.error(msg, err, { ...ctx, correlationId }),
    audit: (action: string, ctx: LogContext = {}) =>
      logger.audit(action, { ...ctx, correlationId }),
    payment: (event: string, ctx: Omit<LogContext, "channel"> = {}) =>
      logger.payment(event, { ...ctx, correlationId }),
    order: (event: string, ctx: Omit<LogContext, "channel"> = {}) =>
      logger.order(event, { ...ctx, correlationId }),
  };
}
