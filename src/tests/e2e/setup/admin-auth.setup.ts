/**
 * Admin auth setup — runs once before any test that depends on "setup:admin".
 * Logs in as the E2E test admin and saves storage state.
 */
import { test as setup } from "@playwright/test";
import path from "path";

import { loginAsAdmin } from "../helpers/auth";

const AUTH_FILE = path.join(process.cwd(), ".playwright/admin.json");

setup("authenticate as admin", async ({ page }) => {
  await loginAsAdmin(page);
  // Verify we landed on admin or home (not login)
  const url = page.url();
  if (url.includes("/login")) {
    throw new Error(
      `[E2E setup] Admin login failed — still on ${url}.\n` +
      "Ensure TEST_ADMIN_EMAIL/TEST_ADMIN_PASSWORD are set and the account has admin role.\n" +
      "Run: npm run db:seed:e2e",
    );
  }
  await page.context().storageState({ path: AUTH_FILE });
});
