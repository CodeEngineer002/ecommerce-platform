import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { localeUrl } from "./auth";

/** Navigate directly to checkout page. */
export async function goToCheckout(page: Page): Promise<void> {
  await page.goto(localeUrl("/checkout"));
  await page.waitForLoadState("networkidle");
}

/**
 * Wait for the checkout page to finish loading.
 * Handles the skeleton state — returns when the address panel OR empty-cart state is visible.
 */
export async function waitForCheckoutReady(page: Page): Promise<void> {
  // Either the address section or the empty cart message will appear
  await expect(
    page.getByRole("heading", { name: "Checkout" })
      .or(page.getByText("Your cart is empty")),
  ).toBeVisible({ timeout: 20_000 });
}

/**
 * Wait for the checkout address panel to fully load (skeleton gone, address list or form visible).
 */
export async function waitForAddressPanelReady(page: Page): Promise<void> {
  // The animate-pulse skeleton elements should disappear
  await expect(page.locator(".animate-pulse").first()).not.toBeVisible({ timeout: 15_000 })
    .catch(() => {}); // skeletons may not exist if addresses load instantly

  // Either an address card, the "Add an address" prompt, or the add-new form must be visible
  await expect(
    page.getByText("Shipping Address")
      .or(page.getByText("No saved addresses for this region"))
      .or(page.getByRole("button", { name: /add new/i })),
  ).toBeVisible({ timeout: 15_000 });
}

/**
 * Wait for address auto-validation to complete (the "Verifying address…" spinner gone).
 * After this resolves, shippingValidated=true on the checkout form.
 */
export async function waitForAddressValidation(page: Page): Promise<void> {
  const verifyingText = page.getByText("Verifying address…");
  // If it appears, wait for it to disappear
  const appeared = await verifyingText.isVisible().catch(() => false);
  if (appeared) {
    await expect(verifyingText).not.toBeVisible({ timeout: 15_000 });
  }
  // Also wait for any validation errors to settle
  await page.waitForTimeout(500);
}

/**
 * Fill in a new address using the checkout address form.
 * Assumes the "Add New" button has already been clicked or the form is shown.
 */
export interface AddressData {
  firstName: string;
  lastName?: string;
  addressLine1: string;
  city: string;
  postalCode?: string;
  phone?: string;
}

export async function fillAddressForm(page: Page, address: AddressData): Promise<void> {
  const form = page.locator("form").filter({ has: page.getByLabel(/first name/i) });

  await form.getByLabel(/first name/i).fill(address.firstName);
  if (address.lastName) {
    await form.getByLabel(/last name/i).fill(address.lastName);
  }
  await form.getByLabel(/address line 1/i).fill(address.addressLine1);

  // City may be a searchable select — try text input first, then select
  const cityInput = form.getByLabel(/city/i);
  if (await cityInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await cityInput.fill(address.city);
  }

  if (address.postalCode) {
    const postalInput = form.getByLabel(/postal code/i).or(form.getByLabel(/pin code/i));
    if (await postalInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await postalInput.fill(address.postalCode);
    }
  }

  if (address.phone) {
    const phoneInput = form.getByLabel(/phone/i);
    if (await phoneInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await phoneInput.fill(address.phone);
    }
  }

  const saveBtn = form.getByRole("button", { name: /save address/i })
    .or(form.getByRole("button", { name: /save/i }));
  await saveBtn.click();

  // Wait for the form to close (success toast or card appears)
  await expect(form).not.toBeVisible({ timeout: 10_000 }).catch(() => {});
}

/** Select the COD (Cash on Delivery) payment option. */
export async function selectCOD(page: Page): Promise<void> {
  const codRadio = page.getByLabel("Cash on Delivery").or(page.locator("#cod"));
  if (await codRadio.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await codRadio.check();
  }
  // COD is the default — if radio is already checked this is a no-op
}

/** Select Stripe payment option. */
export async function selectStripe(page: Page): Promise<void> {
  await page.getByLabel(/credit.*debit.*card/i)
    .or(page.locator("#stripe"))
    .check();
}

/**
 * Click the "Place Order" submit button.
 * Returns the timestamp for performance measurement.
 */
export async function clickPlaceOrder(page: Page): Promise<number> {
  const t0 = Date.now();
  const btn = page.getByRole("button", { name: /place order/i });
  await expect(btn).toBeEnabled({ timeout: 10_000 });
  await btn.click();
  return t0;
}

/**
 * Wait for the order success page (URL: /orders/{id}/success).
 * Returns the extracted order ID from the URL.
 */
export async function waitForOrderSuccess(page: Page): Promise<string> {
  await page.waitForURL(/\/orders\/[^/]+\/success/, { timeout: 30_000 });
  const match = page.url().match(/\/orders\/([^/]+)\/success/);
  return match?.[1] ?? "";
}

/** Verify the "Order Placed!" success page content. */
export async function assertOrderSuccessPage(page: Page): Promise<void> {
  await expect(page.getByRole("heading", { name: "Order Placed!" })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("link", { name: "View Order" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Continue Shopping" })).toBeVisible();
}
