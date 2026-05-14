import { expect, test } from "@playwright/test";

test.describe("Home Page", () => {
  test("loads home page successfully", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/ShopNest/);
  });

  test("hero section is visible", async ({ page }) => {
    await page.goto("/");
    const hero = page.locator("section").first();
    await expect(hero).toBeVisible();
  });

  test("can navigate to products page", async ({ page }) => {
    await page.goto("/");
    await page.click("text=Shop Now");
    await expect(page).toHaveURL(/products/);
  });
});

test.describe("Product Listing", () => {
  test("shows products grid", async ({ page }) => {
    await page.goto("/products");
    await expect(page.locator("h1")).toContainText("All Products");
  });

  test("search bar is functional", async ({ page }) => {
    await page.goto("/products");
    const searchBar = page.getByPlaceholder(/search/i);
    await searchBar.fill("headphones");
    await searchBar.press("Enter");
    await expect(page).toHaveURL(/q=headphones/);
  });
});

test.describe("Auth Flow", () => {
  test("login page loads", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading")).toContainText("ShopNest");
  });

  test("shows validation errors on empty submit", async ({ page }) => {
    await page.goto("/login");
    await page.click("button[type=submit]");
    await expect(page.locator("text=Invalid email")).toBeVisible();
  });
});
