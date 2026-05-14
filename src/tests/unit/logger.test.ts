/**
 * Unit tests — Logger
 *
 * Tests: structured log emission, PII scrubbing, correlation IDs,
 * child logger creation, and audit log semantics.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { logger, generateCorrelationId, createRequestLogger } from "@/lib/logger";

// Capture console output for assertions
let consoleInfoSpy: ReturnType<typeof vi.spyOn>;
let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  consoleInfoSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
  consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  // Enable logging in test mode for these tests
  process.env.LOG_LEVEL = "debug";
});

afterEach(() => {
  consoleInfoSpy.mockRestore();
  consoleErrorSpy.mockRestore();
  consoleWarnSpy.mockRestore();
  delete process.env.LOG_LEVEL;
});

describe("generateCorrelationId", () => {
  it("returns a non-empty string", () => {
    expect(generateCorrelationId().length).toBeGreaterThan(0);
  });

  it("returns unique IDs on repeated calls", () => {
    const ids = Array.from({ length: 10 }, () => generateCorrelationId());
    const unique = new Set(ids);
    expect(unique.size).toBe(10);
  });

  it("follows the {ts}-{rand} format", () => {
    const id = generateCorrelationId();
    expect(id).toMatch(/^[0-9a-z]+-[0-9a-z]+$/);
  });
});

describe("logger.info", () => {
  it("emits in development mode (LOG_LEVEL=debug)", () => {
    logger.info("test message");
    expect(consoleInfoSpy).toHaveBeenCalled();
  });

  it("includes message in output", () => {
    logger.info("hello world", { correlationId: "cid-1" });
    const output = consoleInfoSpy.mock.calls[0]?.[0] as string;
    expect(output).toContain("hello world");
  });
});

describe("logger.error", () => {
  it("logs Error objects via console.error", () => {
    logger.error("something went wrong", new Error("boom"));
    expect(consoleErrorSpy).toHaveBeenCalled();
    const output = consoleErrorSpy.mock.calls[0]?.[0] as string;
    expect(output).toContain("something went wrong");
  });
});

describe("logger — PII scrubbing", () => {
  it("redacts 'password' field", () => {
    logger.info("user action", { password: "supersecret123" } as Record<string, unknown>);
    const output = consoleInfoSpy.mock.calls[0]?.[0] as string;
    expect(output).not.toContain("supersecret123");
    expect(output).toContain("[REDACTED]");
  });

  it("redacts 'token' field", () => {
    logger.info("token check", { token: "eyJhbGciOiJIUzI1NiJ9.test" } as Record<string, unknown>);
    const output = consoleInfoSpy.mock.calls[0]?.[0] as string;
    expect(output).not.toContain("eyJhbGciOiJIUzI1NiJ9");
  });

  it("redacts 'secret' field", () => {
    logger.info("payment", { secret: "whsec_123abc" } as Record<string, unknown>);
    const output = consoleInfoSpy.mock.calls[0]?.[0] as string;
    expect(output).not.toContain("whsec_123abc");
  });

  it("does NOT redact non-sensitive fields", () => {
    logger.info("order event", { orderId: "order-xyz", userId: "user-abc" });
    const output = consoleInfoSpy.mock.calls[0]?.[0] as string;
    expect(output).toContain("order-xyz");
  });
});

describe("logger.audit", () => {
  it("emits audit events when AUDIT_LOG=true", () => {
    process.env.AUDIT_LOG = "true";
    logger.audit("cms:publish", { contentId: "page-1", actorId: "admin-1" });
    // Audit log may use console.log
    const wasCalled =
      consoleInfoSpy.mock.calls.length > 0 ||
      consoleErrorSpy.mock.calls.length > 0;
    expect(wasCalled).toBe(true);
    delete process.env.AUDIT_LOG;
  });
});

describe("createRequestLogger", () => {
  it("creates a child logger with correlationId bound", () => {
    const reqLogger = createRequestLogger("req-cid-123");
    reqLogger.info("request received");
    const output = consoleInfoSpy.mock.calls[0]?.[0] as string;
    expect(output).toContain("req-cid-123");
  });

  it("child logger supports error logging with correlationId", () => {
    const reqLogger = createRequestLogger("req-error-456");
    reqLogger.error("handler failed", new Error("test error"));
    expect(consoleErrorSpy).toHaveBeenCalled();
    const output = consoleErrorSpy.mock.calls[0]?.[0] as string;
    expect(output).toContain("req-error-456");
  });

  it("child logger supports payment events", () => {
    const reqLogger = createRequestLogger("req-pay-789");
    reqLogger.payment("stripe.webhook.received", { orderId: "order-1" });
    expect(consoleInfoSpy).toHaveBeenCalled();
  });
});
