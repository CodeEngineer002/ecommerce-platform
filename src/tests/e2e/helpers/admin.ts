import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

/** Navigate to the admin orders list page. */
export async function goToAdminOrders(page: Page): Promise<void> {
  await page.goto("/admin/orders");
  await page.waitForLoadState("networkidle");
}

/** Navigate to the admin dashboard. */
export async function goToAdminDashboard(page: Page): Promise<void> {
  await page.goto("/admin");
  await page.waitForLoadState("networkidle");
}

/**
 * Wait for the admin orders table to finish loading.
 * Handles the loading skeleton state.
 */
export async function waitForOrdersTableReady(page: Page): Promise<void> {
  // "Loading orders…" disappears once data is fetched
  await expect(page.getByText("Loading orders…")).not.toBeVisible({ timeout: 20_000 })
    .catch(() => {}); // may not show if data is already available
  await expect(
    page.getByRole("heading", { name: "Orders" })
      .or(page.getByText("No orders yet")),
  ).toBeVisible({ timeout: 15_000 });
}

/**
 * Find an order row in the admin orders table by order number prefix.
 * Returns the row locator.
 */
export async function findOrderRow(page: Page, orderNumber: string) {
  return page.getByRole("link", { name: orderNumber }).first();
}

/**
 * Click "Details" for a specific order number.
 * Waits for navigation to the order detail page.
 */
export async function openOrderDetail(page: Page, orderNumber: string): Promise<void> {
  // Find the row containing this order number and click its Details button
  const orderLink = page.getByRole("link", { name: orderNumber }).first();
  await expect(orderLink).toBeVisible({ timeout: 10_000 });

  // The Details button is in the same row
  const row = page.locator("tr").filter({ has: page.getByText(orderNumber) });
  const detailsBtn = row.getByRole("link", { name: "Details" });
  await detailsBtn.click();

  await page.waitForURL(/\/admin\/orders\/[^/]+$/, { timeout: 15_000 });
}

/**
 * Read the payment status badge text from the admin order detail page.
 */
export async function getOrderPaymentStatus(page: Page): Promise<string> {
  const statusEl = page.getByText(/cod_pending_collection|pending|succeeded|failed/i).first();
  return (await statusEl.textContent()) ?? "";
}

/** Verify the admin is properly authenticated (sees admin header). */
export async function assertAdminAuthenticated(page: Page): Promise<void> {
  await expect(
    page.getByText(/signed in as/i).or(page.locator("[data-testid='admin-header']")),
  ).toBeVisible({ timeout: 10_000 });
}
