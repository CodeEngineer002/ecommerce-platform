import type { Page, ConsoleMessage } from "@playwright/test";
import { expect } from "@playwright/test";

// ── Console error capture ─────────────────────────────────────────────────────

const CONSOLE_ERROR_ALLOWLIST = [
  /ResizeObserver loop/,
  /Non-Error promise rejection captured/,
  /NEXT_REDIRECT/,    // Next.js server redirect errors are not bugs
  /Failed to load resource.*favicon/,
  /Expected server HTML/,  // hydration warnings during development
];

/**
 * Attach a console error listener to the page.
 * Call this early (e.g. in beforeEach) and then call assertNoConsoleErrors() after.
 * Returns the accumulated errors array so you can inspect them in tests.
 */
export function attachConsoleCapture(page: Page): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  page.on("console", (msg: ConsoleMessage) => {
    const text = msg.text();
    if (msg.type() === "error") {
      const isAllowed = CONSOLE_ERROR_ALLOWLIST.some((re) => re.test(text));
      if (!isAllowed) errors.push(text);
    }
    if (msg.type() === "warning") {
      warnings.push(text);
    }
  });

  return { errors, warnings };
}

/** Fail the test if unexpected console errors were captured. */
export function assertNoConsoleErrors(errors: string[]): void {
  if (errors.length > 0) {
    throw new Error(
      `[E2E] Unexpected console errors (${errors.length}):\n` +
      errors.map((e, i) => `  ${i + 1}. ${e}`).join("\n"),
    );
  }
}

// ── Network error capture ─────────────────────────────────────────────────────

const NETWORK_ERROR_ALLOWLIST = [
  /favicon\.ico/,
  /\/__nextjs_original-stack-frame/,
  /\/api\/jobs\//,   // background jobs may 401 in test
];

/**
 * Attach a response listener and collect non-2xx/3xx responses from API routes.
 * Returns the accumulated failures array.
 */
export function attachNetworkCapture(page: Page): { failures: string[] } {
  const failures: string[] = [];

  page.on("response", async (response) => {
    const url = response.url();
    const status = response.status();
    const isApiRoute = url.includes("/api/");
    const isFailed = status >= 400;

    if (isApiRoute && isFailed) {
      const isAllowed = NETWORK_ERROR_ALLOWLIST.some((re) => re.test(url));
      if (!isAllowed) {
        failures.push(`${status} ${response.request().method()} ${url}`);
      }
    }
  });

  return { failures };
}

/** Warn (not fail) if API failures were captured — useful for non-critical paths. */
export function warnNetworkFailures(failures: string[]): void {
  if (failures.length > 0) {
    console.warn(
      `[E2E] API failures detected (${failures.length}):\n` +
      failures.map((f, i) => `  ${i + 1}. ${f}`).join("\n"),
    );
  }
}

// ── Performance helpers ───────────────────────────────────────────────────────

const PERF_WARN_THRESHOLD_MS = 3_000;   // warn if operation takes > 3s
const PERF_FAIL_THRESHOLD_MS = 15_000;  // fail if operation takes > 15s

/**
 * Measure elapsed time from a start timestamp.
 * Warns if > WARN threshold; fails if > FAIL threshold.
 * Performance checks are soft warnings unless extremely slow — keeps tests stable.
 */
export function assertPerformance(
  label: string,
  startTs: number,
  opts?: { warnMs?: number; failMs?: number },
): void {
  const elapsed = Date.now() - startTs;
  const warnMs = opts?.warnMs ?? PERF_WARN_THRESHOLD_MS;
  const failMs = opts?.failMs ?? PERF_FAIL_THRESHOLD_MS;

  if (elapsed > failMs) {
    throw new Error(`[E2E PERF] "${label}" took ${elapsed}ms — exceeded hard limit of ${failMs}ms`);
  }
  if (elapsed > warnMs) {
    console.warn(`[E2E PERF] "${label}" took ${elapsed}ms — exceeded warn threshold of ${warnMs}ms`);
  }
}

// ── Page state assertions ─────────────────────────────────────────────────────

/** Assert no visible error page (500, "Internal Server Error"). */
export async function assertNoServerError(page: Page): Promise<void> {
  const body = page.locator("body");
  await expect(body).not.toContainText("Internal Server Error");
  await expect(body).not.toContainText("Application error");
  // Next.js error overlay in dev
  const devOverlay = page.locator("[data-nextjs-dialog-overlay]");
  if (await devOverlay.isVisible().catch(() => false)) {
    const overlayText = await devOverlay.textContent();
    throw new Error(`[E2E] Next.js error overlay visible:\n${overlayText}`);
  }
}

/** Assert page loaded without 404. */
export async function assertNotFound(page: Page, shouldBe404: boolean): Promise<void> {
  const has404 = (await page.locator("body").textContent())?.includes("404") ?? false;
  if (shouldBe404) {
    expect(has404).toBe(true);
  } else {
    expect(has404).toBe(false);
  }
}
