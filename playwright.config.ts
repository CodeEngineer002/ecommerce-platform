import { defineConfig, devices } from "@playwright/test";
import path from "path";
import * as dotenv from "dotenv";

// Load .env.e2e first, fall back to .env.local
dotenv.config({ path: path.join(__dirname, ".env.e2e") });
dotenv.config({ path: path.join(__dirname, ".env.local") });

// ── Auth state paths — persisted between test setup and test runs ─────────────
export const CUSTOMER_AUTH_FILE = path.join(__dirname, ".playwright/customer.json");
export const ADMIN_AUTH_FILE    = path.join(__dirname, ".playwright/admin.json");

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:4000";

export default defineConfig({
  testDir: "./src/tests/e2e",
  globalTeardown: "./src/tests/e2e/teardown/global.teardown.ts",
  fullyParallel: false,           // sequential — shares a single dev DB
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: process.env.CI ? 1 : 1,

  reporter: process.env.CI
    ? [["html", { outputFolder: "src/tests/e2e/reports/html" }], ["junit", { outputFile: "src/tests/e2e/reports/results.xml" }], ["line"]]
    : [["html", { outputFolder: "src/tests/e2e/reports/html", open: "never" }], ["list"]],

  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "on-first-retry",

    // Capture all console messages and network errors in test context
    // (tests attach listeners via page.on("console") in fixtures/helpers)
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },

  projects: [
    // ── Auth setup — runs before any test that needs logged-in state ──────────
    {
      name: "setup:customer",
      testMatch: "**/setup/customer-auth.setup.ts",
    },
    {
      name: "setup:admin",
      testMatch: "**/setup/admin-auth.setup.ts",
    },

    // ── Desktop Chromium — primary E2E browser ────────────────────────────────
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup:customer", "setup:admin"],
    },

    // ── Mobile smoke — only for regression suite ─────────────────────────────
    {
      name: "Mobile Chrome",
      use: { ...devices["Pixel 5"] },
      testMatch: "**/specs/regression/**",
      dependencies: ["setup:customer"],
    },
  ],

  webServer: {
    command: "npm run dev",
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: "ignore",
    stderr: "pipe",
  },

  outputDir: "src/tests/e2e/reports/artifacts",
});
