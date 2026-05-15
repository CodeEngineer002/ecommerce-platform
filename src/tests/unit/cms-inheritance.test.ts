// ─────────────────────────────────────────────────────────────────────────────
// CMS Inheritance Service — Unit Tests
// Tests the pure helper functions (no DB) and module constants.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, expect, it } from "vitest";

import {
  getInheritanceMeta,
  isInheritedContent,
  isLocaleOverride,
  type InheritanceFields,
} from "@/features/cms/services/cms.inheritance";

// ── isInheritedContent ────────────────────────────────────────────────────────

describe("isInheritedContent", () => {
  it("returns true for locale row with inherited status", () => {
    const row: Partial<InheritanceFields> = {
      scope_type:          "locale",
      override_status:     "inherited",
      inheritance_enabled: true,
    };
    expect(isInheritedContent(row)).toBe(true);
  });

  it("returns false for country-level source row", () => {
    const row: Partial<InheritanceFields> = {
      scope_type:      "country",
      override_status: "inherited",
    };
    expect(isInheritedContent(row)).toBe(false);
  });

  it("returns false for locale override row", () => {
    const row: Partial<InheritanceFields> = {
      scope_type:      "locale",
      override_status: "overridden",
    };
    expect(isInheritedContent(row)).toBe(false);
  });

  it("returns false for detached override row", () => {
    const row: Partial<InheritanceFields> = {
      scope_type:      "locale",
      override_status: "detached",
    };
    expect(isInheritedContent(row)).toBe(false);
  });

  it("returns false for legacy row with no scope_type", () => {
    expect(isInheritedContent({})).toBe(false);
  });

  it("returns false when inheritance disabled", () => {
    const row: Partial<InheritanceFields> = {
      scope_type:          "locale",
      override_status:     "inherited",
      inheritance_enabled: false,
    };
    expect(isInheritedContent(row)).toBe(false);
  });
});

// ── isLocaleOverride ──────────────────────────────────────────────────────────

describe("isLocaleOverride", () => {
  it("returns true for locale + overridden", () => {
    expect(isLocaleOverride({ scope_type: "locale", override_status: "overridden" })).toBe(true);
  });

  it("returns false for country source", () => {
    expect(isLocaleOverride({ scope_type: "country", override_status: "overridden" })).toBe(false);
  });

  it("returns false for inherited locale", () => {
    expect(isLocaleOverride({ scope_type: "locale", override_status: "inherited" })).toBe(false);
  });

  it("returns false for detached override", () => {
    expect(isLocaleOverride({ scope_type: "locale", override_status: "detached" })).toBe(false);
  });
});

// ── getInheritanceMeta ────────────────────────────────────────────────────────

describe("getInheritanceMeta", () => {
  it("correctly classifies country source row", () => {
    const meta = getInheritanceMeta({
      scope_type:      "country",
      override_status: "inherited",
    });
    expect(meta.isCountrySource).toBe(true);
    expect(meta.isInherited).toBe(false);
    expect(meta.isLocaleOverride).toBe(false);
  });

  it("correctly classifies inherited locale row", () => {
    const meta = getInheritanceMeta({
      scope_type:          "locale",
      override_status:     "inherited",
      inheritance_enabled: true,
      inherits_from_id:    "source-id",
    });
    expect(meta.isInherited).toBe(true);
    expect(meta.isCountrySource).toBe(false);
    expect(meta.isLocaleOverride).toBe(false);
    expect(meta.sourceId).toBe("source-id");
  });

  it("correctly classifies locale override row", () => {
    const meta = getInheritanceMeta({
      scope_type:       "locale",
      override_status:  "overridden",
      inherits_from_id: "source-id",
    });
    expect(meta.isLocaleOverride).toBe(true);
    expect(meta.isInherited).toBe(false);
    expect(meta.isCountrySource).toBe(false);
    expect(meta.sourceId).toBe("source-id");
  });

  it("returns defaults for legacy row with no scope_type", () => {
    const meta = getInheritanceMeta({});
    expect(meta.isCountrySource).toBe(false);
    expect(meta.isInherited).toBe(false);
    expect(meta.isLocaleOverride).toBe(false);
    expect(meta.sourceId).toBeNull();
  });
});

// ── Module registration ───────────────────────────────────────────────────────

describe("CMS module constants", () => {
  it("exports expected module IDs", async () => {
    const { CMS_MODULES } = await import("@/components/cms/cms-country-nav");
    const moduleIds = CMS_MODULES.map((m) => m.id);
    expect(moduleIds).toContain("homepage");
    expect(moduleIds).toContain("pages");
    expect(moduleIds).toContain("blocks");
    expect(moduleIds).toContain("navigation");
    expect(moduleIds).toContain("banners");
    expect(moduleIds).toContain("media");
  });
});
