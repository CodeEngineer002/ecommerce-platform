import type { Page } from "@playwright/test";

export const TEST_CUSTOMER_EMAIL    = process.env.TEST_CUSTOMER_EMAIL    ?? "e2e-customer@test.shopnest.local";
export const TEST_CUSTOMER_PASSWORD = process.env.TEST_CUSTOMER_PASSWORD ?? "TestCustomer123!";
export const TEST_ADMIN_EMAIL       = process.env.TEST_ADMIN_EMAIL       ?? "e2e-admin@test.shopnest.local";
export const TEST_ADMIN_PASSWORD    = process.env.TEST_ADMIN_PASSWORD    ?? "TestAdmin123!";
export const LOCALE_PREFIX          = process.env.TEST_LOCALE_PREFIX     ?? "/in/en";

/** Build a locale-prefixed URL path (e.g. localeUrl("/cart") → "/in/en/cart"). */
export function localeUrl(path: string): string {
  return `${LOCALE_PREFIX}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Navigate to login and sign in with the given credentials. Waits for redirect off /login. */
export async function loginAs(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign In" }).click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 20_000 });
}

export async function loginAsCustomer(page: Page): Promise<void> {
  await loginAs(page, TEST_CUSTOMER_EMAIL, TEST_CUSTOMER_PASSWORD);
}

export async function loginAsAdmin(page: Page): Promise<void> {
  await loginAs(page, TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD);
}

/** Sign out via the API route and wait for navigation. */
export async function logout(page: Page): Promise<void> {
  await page.goto("/api/auth/signout");
  await page.waitForURL("/", { timeout: 10_000 }).catch(() => {
    // Some configs redirect to /login — either is fine
  });
}
