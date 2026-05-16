import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { localeUrl } from "./auth";

/** Navigate directly to the cart page. */
export async function goToCart(page: Page): Promise<void> {
  await page.goto(localeUrl("/cart"));
  await page.waitForLoadState("networkidle");
}

/**
 * Click "Proceed to Checkout" on the cart page.
 * Waits for navigation to the checkout page.
 */
export async function proceedToCheckout(page: Page): Promise<void> {
  const checkoutBtn = page.getByRole("link", { name: /proceed to checkout/i });
  await expect(checkoutBtn).toBeVisible({ timeout: 10_000 });
  await checkoutBtn.click();
  await page.waitForURL(/\/checkout/, { timeout: 20_000 });
}

/**
 * Confirm the cart page is in "empty" state.
 * Returns true if the empty state is shown.
 */
export async function isCartEmpty(page: Page): Promise<boolean> {
  const emptyText = page.getByText("Your cart is empty");
  return emptyText.isVisible();
}

/** Returns the number of line items shown in the cart. */
export async function getCartItemCount(page: Page): Promise<number> {
  const items = page.locator("ul[class*='divide'] li, ul li");
  return items.count();
}

/** Remove first item from cart via the trash/remove button. */
export async function removeFirstCartItem(page: Page): Promise<void> {
  const removeBtn = page
    .getByRole("button", { name: /remove/i })
    .or(page.locator("button[aria-label='Remove']"))
    .first();
  await removeBtn.click();
}
