/**
 * Unit tests — Locale-aware Routing Helpers
 *
 * Tests localePath, localeRoute, buildLocaleRoutes, buildAlternates.
 * All pure functions — no framework dependencies.
 */
import { describe, expect, it } from "vitest";

import {
  localePath,
  localeRoute,
  buildLocaleRoutes,
  buildAlternates,
  type LocaleParams,
} from "@/lib/i18n/routing";
import { COUNTRIES } from "@/lib/i18n/config";

const DE: LocaleParams = { country: "de", lang: "de" };
const IN_EN: LocaleParams = { country: "in", lang: "en" };
const AE_AR: LocaleParams = { country: "ae", lang: "ar" };

describe("localePath", () => {
  it("builds /de/de for Germany German", () => {
    expect(localePath(DE)).toBe("/de/de");
  });

  it("builds /in/en for India English", () => {
    expect(localePath(IN_EN)).toBe("/in/en");
  });

  it("builds /ae/ar for UAE Arabic", () => {
    expect(localePath(AE_AR)).toBe("/ae/ar");
  });
});

describe("localeRoute", () => {
  it("prepends locale prefix to absolute path", () => {
    expect(localeRoute(DE, "/products")).toBe("/de/de/products");
  });

  it("prepends locale prefix to relative path (normalizes leading slash)", () => {
    expect(localeRoute(DE, "products")).toBe("/de/de/products");
  });

  it("handles nested paths", () => {
    expect(localeRoute(IN_EN, "/categories/electronics")).toBe(
      "/in/en/categories/electronics",
    );
  });

  it("handles root path", () => {
    expect(localeRoute(DE, "/")).toBe("/de/de/");
  });
});

describe("buildLocaleRoutes", () => {
  it("home is the locale prefix itself", () => {
    const routes = buildLocaleRoutes(DE);
    expect(routes.home).toBe("/de/de");
  });

  it("products path is locale-prefixed", () => {
    const routes = buildLocaleRoutes(DE);
    expect(routes.products).toBe("/de/de/products");
  });

  it("product() builder includes slug", () => {
    const routes = buildLocaleRoutes(DE);
    expect(routes.product("my-shirt")).toBe("/de/de/products/my-shirt");
  });

  it("checkout path is locale-prefixed", () => {
    const routes = buildLocaleRoutes(IN_EN);
    expect(routes.checkout).toBe("/in/en/checkout");
  });

  it("login is NOT locale-prefixed (global route)", () => {
    const routes = buildLocaleRoutes(DE);
    expect(routes.login).toBe("/login");
  });

  it("admin is NOT locale-prefixed", () => {
    const routes = buildLocaleRoutes(DE);
    expect(routes.admin).toBe("/admin");
  });

  it("order() builder includes order id", () => {
    const routes = buildLocaleRoutes(IN_EN);
    expect(routes.order("order-123")).toBe("/in/en/orders/order-123");
  });
});

describe("buildAlternates", () => {
  it("returns an entry for every supported language in the country", () => {
    const alts = buildAlternates("/de/de/products", DE);
    // Germany supports ['de', 'en']
    expect(alts).toHaveLength(COUNTRIES.de.supportedLangs.length);
  });

  it("strips the current locale prefix from the path", () => {
    const alts = buildAlternates("/de/de/products", DE);
    for (const alt of alts) {
      expect(alt.href).toMatch(/\/de\/(de|en)\/products/);
    }
  });

  it("includes the current locale as one of the alternates", () => {
    const alts = buildAlternates("/de/de/products", DE);
    const selfAlt = alts.find((a) => a.lang === "de" && a.country === "de");
    expect(selfAlt).toBeDefined();
  });

  it("includes the secondary language alternate", () => {
    const alts = buildAlternates("/de/de/products", DE);
    const enAlt = alts.find((a) => a.lang === "en");
    expect(enAlt).toBeDefined();
    expect(enAlt!.href).toContain("/de/en/products");
  });

  it("Arabic alternate points to RTL locale path", () => {
    const alts = buildAlternates("/ae/en/products", { country: "ae", lang: "en" });
    const arAlt = alts.find((a) => a.lang === "ar");
    expect(arAlt).toBeDefined();
    expect(arAlt!.href).toContain("/ae/ar/products");
  });
});
