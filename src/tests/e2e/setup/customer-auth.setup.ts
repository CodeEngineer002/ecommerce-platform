/**
 * Customer auth setup — runs once before any test that depends on "setup:customer".
 * Logs in as the E2E test customer and saves the browser storage state to disk.
 * Subsequent tests load this state via storageState in their fixture, skipping the
 * login step entirely.
 */
import { test as setup } from "@playwright/test";
import path from "path";

import { loginAsCustomer } from "../helpers/auth";

const AUTH_FILE = path.join(process.cwd(), ".playwright/customer.json");

setup("authenticate as customer", async ({ page }) => {
  await loginAsCustomer(page);
  // Persist the session cookies + localStorage to disk
  await page.context().storageState({ path: AUTH_FILE });
});
