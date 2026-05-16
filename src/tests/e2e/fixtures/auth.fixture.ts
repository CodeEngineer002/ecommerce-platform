/**
 * Auth-aware page fixtures.
 *
 * customerPage  — pre-authenticated as E2E test customer, with console/network capture.
 * adminPage     — pre-authenticated as E2E test admin, with console/network capture.
 * anonPage      — standard unauthenticated page (for redirect / guard tests).
 *
 * Usage:
 *   import { test } from "../fixtures/auth.fixture";
 *   test("my test", async ({ customerPage }) => { ... });
 */
import { test as base } from "@playwright/test";
import path from "path";

import {
  attachConsoleCapture,
  attachNetworkCapture,
  assertNoConsoleErrors,
  warnNetworkFailures,
} from "../helpers/assertions";

const CUSTOMER_AUTH = path.join(process.cwd(), ".playwright/customer.json");
const ADMIN_AUTH    = path.join(process.cwd(), ".playwright/admin.json");

type AuthFixtures = {
  customerPage: ReturnType<typeof base.extend> extends { page: infer P } ? P : never;
  adminPage:    ReturnType<typeof base.extend> extends { page: infer P } ? P : never;
  anonPage:     ReturnType<typeof base.extend> extends { page: infer P } ? P : never;
};

// We extend the base `test` so callers get all standard Playwright fixtures too
export const test = base.extend<{
  customerPage: import("@playwright/test").Page;
  adminPage:    import("@playwright/test").Page;
  anonPage:     import("@playwright/test").Page;
}>({
  // ── Customer-authenticated page ─────────────────────────────────────────────
  customerPage: async ({ browser }, use) => {
    const ctx = await browser.newContext({ storageState: CUSTOMER_AUTH });
    const page = await ctx.newPage();
    const { errors } = attachConsoleCapture(page);
    const { failures } = attachNetworkCapture(page);

    await use(page);

    warnNetworkFailures(failures);
    assertNoConsoleErrors(errors);
    await ctx.close();
  },

  // ── Admin-authenticated page ────────────────────────────────────────────────
  adminPage: async ({ browser }, use) => {
    const ctx = await browser.newContext({ storageState: ADMIN_AUTH });
    const page = await ctx.newPage();
    const { errors } = attachConsoleCapture(page);
    const { failures } = attachNetworkCapture(page);

    await use(page);

    warnNetworkFailures(failures);
    assertNoConsoleErrors(errors);
    await ctx.close();
  },

  // ── Anonymous page (no saved auth) ─────────────────────────────────────────
  anonPage: async ({ browser }, use) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const { errors } = attachConsoleCapture(page);
    attachNetworkCapture(page); // capture but do not assert for anon pages

    await use(page);

    assertNoConsoleErrors(errors);
    await ctx.close();
  },
});

export { expect } from "@playwright/test";
