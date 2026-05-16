/**
 * Checkout fixture — composes auth + cart state for checkout tests.
 *
 * checkoutPage — authenticated customer page with a product already in cart.
 * customerPage — authenticated customer page with NO pre-loaded cart (clean session).
 *
 * Usage:
 *   import { test } from "../fixtures/checkout.fixture";
 *   test("place order", async ({ checkoutPage }) => { ... });
 *   test("empty cart", async ({ customerPage }) => { ... });
 */
import { test as base, expect } from "@playwright/test";
import path from "path";

import {
  attachConsoleCapture,
  attachNetworkCapture,
  assertNoConsoleErrors,
  warnNetworkFailures,
} from "../helpers/assertions";
import { resetE2ECart, getUserByEmail } from "../helpers/db";
import { TEST_CUSTOMER_EMAIL, LOCALE_PREFIX } from "../helpers/auth";
import { TEST_PRODUCT_SLUG } from "../helpers/products";

const CUSTOMER_AUTH = path.join(process.cwd(), ".playwright/customer.json");

export const test = base.extend<{
  checkoutPage: import("@playwright/test").Page;
  customerPage: import("@playwright/test").Page;
  /** The order number extracted from a completed checkout — available via orderNumber fixture. */
  orderNumber: string;
}>({
  checkoutPage: async ({ browser }, use) => {
    // Reset the customer's cart before each checkout test
    const user = await getUserByEmail(TEST_CUSTOMER_EMAIL).catch(() => null);
    if (user) await resetE2ECart(user.id);

    const ctx = await browser.newContext({ storageState: CUSTOMER_AUTH });
    const page = await ctx.newPage();
    const { errors } = attachConsoleCapture(page);
    const { failures } = attachNetworkCapture(page);

    // Add the test product to cart via UI navigation
    await page.goto(`${LOCALE_PREFIX}/products/${TEST_PRODUCT_SLUG}`);
    await page.waitForLoadState("networkidle");
    const addBtn = page.getByRole("button", { name: /add to cart/i });
    await expect(addBtn).toBeEnabled({ timeout: 10_000 });
    await addBtn.click();
    await expect(page.getByText("Added to cart!")).toBeVisible({ timeout: 10_000 });

    await use(page);

    warnNetworkFailures(failures);
    assertNoConsoleErrors(errors);
    await ctx.close();
  },

  // ── Clean customer page (no pre-loaded cart) ────────────────────────────────
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

  // Placeholder — individual tests set this via their own variable
  // eslint-disable-next-line no-empty-pattern
  orderNumber: async ({}, use) => {
    await use("");
  },
});

export { expect } from "@playwright/test";
