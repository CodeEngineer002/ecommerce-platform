import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { localeUrl } from "./auth";

export const TEST_PRODUCT_SLUG = process.env.TEST_PRODUCT_SLUG ?? "wireless-noise-cancelling-headphones";

/** Navigate to a product detail page and wait for it to load. */
export async function goToProduct(page: Page, slug: string = TEST_PRODUCT_SLUG): Promise<void> {
  await page.goto(localeUrl(`/products/${slug}`));
  // Wait for the product title to be visible (server component settled)
  await page.waitForLoadState("networkidle");
  await expect(page.locator("h1").first()).toBeVisible({ timeout: 15_000 });
}

/** Navigate to the products listing page. */
export async function goToProductListing(page: Page): Promise<void> {
  await page.goto(localeUrl("/products"));
  await page.waitForLoadState("networkidle");
}

/**
 * Click "Add to Cart" on the product detail page.
 * Returns the start timestamp so callers can measure add-to-cart duration.
 */
export async function addToCart(page: Page): Promise<number> {
  const t0 = Date.now();
  const addBtn = page.getByRole("button", { name: /add to cart/i });
  await expect(addBtn).toBeEnabled({ timeout: 10_000 });
  await addBtn.click();
  return t0;
}

/** Wait for the "Added to cart!" toast and confirm cart sidebar or badge updated. */
export async function waitForAddToCartSuccess(page: Page): Promise<void> {
  // Toast: react-hot-toast renders with role="status" or inside a known portal
  await expect(page.getByText("Added to cart!")).toBeVisible({ timeout: 10_000 });
}

/** Read the numeric cart item count from any badge/counter element in the nav. */
export async function getCartBadgeCount(page: Page): Promise<number> {
  const badge = page.locator(
    "[data-testid='cart-count'], [aria-label*='cart' i] span, header [class*='badge']",
  ).first();
  if (!(await badge.isVisible())) return 0;
  const text = await badge.textContent();
  return parseInt(text?.trim() ?? "0", 10) || 0;
}
