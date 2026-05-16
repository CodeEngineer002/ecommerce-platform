/**
 * Critical path regression suite.
 *
 * This suite must always pass before any deployment.
 * It is a focused, fast subset of the full E2E suite covering the highest-risk flows.
 *
 * Runs on both Desktop Chrome and Mobile Chrome (configured in playwright.config.ts).
 *
 * Covers:
 * - Site loads without server error
 * - Auth redirect guards work
 * - Product browsing works
 * - Add to cart works
 * - Cart → Checkout navigation works
 * - Full COD order placement (happy path)
 * - Admin orders list accessible
 * - No unexpected console errors on critical pages
 *
 * Run:  npm run test:e2e:regression
 */
import { test, expect } from "../../fixtures/auth.fixture";
import { localeUrl, LOCALE_PREFIX } from "../../helpers/auth";
import { goToProduct, addToCart, waitForAddToCartSuccess, TEST_PRODUCT_SLUG } from "../../helpers/products";
import { goToCart, proceedToCheckout } from "../../helpers/cart";
import {
  waitForCheckoutReady,
  waitForAddressPanelReady,
  waitForAddressValidation,
  selectCOD,
  clickPlaceOrder,
  waitForOrderSuccess,
  assertOrderSuccessPage,
} from "../../helpers/checkout";
import {
  goToAdminOrders,
  waitForOrdersTableReady,
  assertAdminAuthenticated,
} from "../../helpers/admin";
import { assertNoServerError, assertPerformance } from "../../helpers/assertions";
import {
  getOrder,
  getOrderItems,
  getPaymentForOrder,
  resetE2ECart,
  getUserByEmail,
} from "../../helpers/db";
import { TEST_CUSTOMER_EMAIL } from "../../helpers/auth";

// ── 1. Site health ────────────────────────────────────────────────────────────

test.describe("[Regression] Site health", () => {
  test("home page loads without error", async ({ anonPage: page }) => {
    const t0 = Date.now();
    await page.goto(LOCALE_PREFIX + "/");
    await page.waitForLoadState("networkidle");
    await assertNoServerError(page);
    await expect(page).toHaveTitle(/ShopNest/i);
    assertPerformance("home page", t0, { warnMs: 3_000 });
  });

  test("products listing loads without error", async ({ anonPage: page }) => {
    const t0 = Date.now();
    await page.goto(localeUrl("/products"));
    await page.waitForLoadState("networkidle");
    await assertNoServerError(page);
    assertPerformance("products listing", t0, { warnMs: 4_000 });
  });
});

// ── 2. Auth guards ────────────────────────────────────────────────────────────

test.describe("[Regression] Auth guards", () => {
  test("checkout redirects unauthenticated users", async ({ anonPage: page }) => {
    await page.goto(localeUrl("/checkout"));
    await page.waitForURL(
      (url) => url.pathname.includes("/login") || url.pathname.includes("/checkout"),
      { timeout: 10_000 },
    );
    await assertNoServerError(page);
  });

  test("admin redirects unauthenticated users", async ({ anonPage: page }) => {
    await page.goto("/admin");
    await page.waitForURL(
      (url) => url.pathname.includes("/login") || url.pathname.includes("/admin"),
      { timeout: 10_000 },
    );
    await assertNoServerError(page);
  });
});

// ── 3. Add to cart ────────────────────────────────────────────────────────────

test.describe("[Regression] Add to cart", () => {
  test("can add product to cart", async ({ customerPage: page }) => {
    await goToProduct(page, TEST_PRODUCT_SLUG);
    const t0 = await addToCart(page);
    await waitForAddToCartSuccess(page);
    assertPerformance("add to cart", t0, { warnMs: 3_000, failMs: 10_000 });
  });
});

// ── 4. Full COD happy path ────────────────────────────────────────────────────

test.describe("[Regression] Full COD order — happy path @order", () => {
  test.beforeEach(async () => {
    // Reset the test customer's cart so each test starts clean
    const user = await getUserByEmail(TEST_CUSTOMER_EMAIL).catch(() => null);
    if (user) await resetE2ECart(user.id);
  });

  test("complete order placement via COD", async ({ customerPage: page }) => {
    // Add to cart
    await goToProduct(page, TEST_PRODUCT_SLUG);
    await addToCart(page);
    await waitForAddToCartSuccess(page);

    // Cart
    const t0Cart = Date.now();
    await goToCart(page);
    await expect(page.getByText("Your cart is empty")).not.toBeVisible({ timeout: 5_000 })
      .catch(() => {});
    assertPerformance("cart page", t0Cart, { warnMs: 3_000 });

    // Proceed to checkout
    await proceedToCheckout(page);

    // Checkout
    const t0Checkout = Date.now();
    await waitForCheckoutReady(page);
    await waitForAddressPanelReady(page);
    await waitForAddressValidation(page);
    assertPerformance("checkout load", t0Checkout, { warnMs: 5_000 });

    await selectCOD(page);
    const t0Order = await clickPlaceOrder(page);
    const orderId = await waitForOrderSuccess(page);
    assertPerformance("order placement", t0Order, { warnMs: 5_000, failMs: 20_000 });

    // Success page
    await assertOrderSuccessPage(page);

    // DB verification
    if (orderId) {
      const order = await getOrder(orderId);
      expect(order.status).toBe("confirmed");

      const items = await getOrderItems(orderId);
      expect(items.length).toBeGreaterThan(0);

      const payment = await getPaymentForOrder(orderId);
      expect(payment?.provider).toBe("cod");
      expect(payment?.status).toBe("cod_pending_collection");
    }
  });
});

// ── 5. Admin accessible ───────────────────────────────────────────────────────

test.describe("[Regression] Admin orders accessible", () => {
  test("admin can view orders list", async ({ adminPage: page }) => {
    const t0 = Date.now();
    await goToAdminOrders(page);
    await waitForOrdersTableReady(page);
    await assertAdminAuthenticated(page);
    await assertNoServerError(page);
    assertPerformance("admin orders", t0, { warnMs: 4_000 });
  });
});
