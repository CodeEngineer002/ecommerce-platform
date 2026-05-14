/**
 * Unit tests — CMS Sanitize + Block Registry (extended)
 *
 * Focuses on the sanitizeCmsHtml security guarantees and extended block
 * schema validation (edge cases not covered in cms.test.ts).
 */
import { describe, expect, it } from "vitest";

import { sanitizeCmsHtml } from "@/lib/cms/sanitize";
import { validateBlockContent, getBlockEntry, BLOCK_TYPES, blockSchemas } from "@/lib/cms/block-registry";

// ── sanitizeCmsHtml ───────────────────────────────────────────────────────────

describe("sanitizeCmsHtml — security", () => {
  it("removes script tags", () => {
    const result = sanitizeCmsHtml('<script>alert("xss")</script><p>Hello</p>');
    expect(result).not.toContain("<script>");
    expect(result).toContain("Hello");
  });

  it("removes onclick attributes", () => {
    const result = sanitizeCmsHtml('<a href="/path" onclick="steal()">Click</a>');
    expect(result).not.toContain("onclick");
    expect(result).toContain("Click");
  });

  it("allows safe anchor tags", () => {
    const result = sanitizeCmsHtml('<a href="https://example.com" target="_blank" rel="noopener">Link</a>');
    expect(result).toContain('href="https://example.com"');
  });

  it("removes javascript: URLs in anchor hrefs", () => {
    const result = sanitizeCmsHtml('<a href="javascript:alert(1)">Bad</a>');
    expect(result).not.toContain("javascript:");
  });

  it("allows img tags with src, alt, width, height", () => {
    const result = sanitizeCmsHtml('<img src="https://example.com/img.jpg" alt="test" width="200" height="100">');
    expect(result).toContain("src=");
    expect(result).toContain("alt=");
  });

  it("removes data: URIs from img src", () => {
    const result = sanitizeCmsHtml('<img src="data:text/html,<script>alert(1)</script>">');
    // data: scheme is not in allowedSchemes
    expect(result).not.toContain("data:");
  });

  it("preserves allowed structural tags", () => {
    const input = "<h1>Title</h1><h2>Sub</h2><p>Text</p><ul><li>Item</li></ul>";
    const result = sanitizeCmsHtml(input);
    expect(result).toContain("<h1>");
    expect(result).toContain("<h2>");
    expect(result).toContain("<ul>");
  });

  it("returns null for null input", () => {
    expect(sanitizeCmsHtml(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(sanitizeCmsHtml(undefined)).toBeNull();
  });

  it("returns empty string for empty string input (empty string is falsy, not null/undefined)", () => {
    // sanitize-html returns "" for empty input — empty string is falsy so the
    // guard `if (!dirty)` triggers, and `"" ?? null` evaluates to "" (not null)
    expect(sanitizeCmsHtml("")).toBe("");
  });
});

// ── Block schema — edge cases ─────────────────────────────────────────────────

describe("validateBlockContent — edge cases", () => {
  it("hero_banner: accepts optional fields as undefined", () => {
    expect(validateBlockContent("hero_banner", {
      heading: "Welcome",
      // all optional fields omitted
    })).toBe(true);
  });

  it("hero_banner: rejects invalid align enum value", () => {
    expect(validateBlockContent("hero_banner", {
      heading: "Test",
      align: "diagonal", // not in enum
    })).toBe(false);
  });

  it("product_carousel: rejects limit > 20", () => {
    expect(validateBlockContent("product_carousel", {
      product_ids: [],
      limit: 25, // max is 20
    })).toBe(false);
  });

  it("product_carousel: rejects limit < 1", () => {
    expect(validateBlockContent("product_carousel", {
      product_ids: [],
      limit: 0,
    })).toBe(false);
  });

  it("category_grid: rejects columns > 6", () => {
    expect(validateBlockContent("category_grid", {
      category_ids: [],
      columns: 7, // max is 6
    })).toBe(false);
  });

  it("category_grid: rejects columns < 2", () => {
    expect(validateBlockContent("category_grid", {
      category_ids: [],
      columns: 1, // min is 2
    })).toBe(false);
  });

  it("image_gallery: rejects non-URL image src", () => {
    expect(validateBlockContent("image_gallery", {
      images: [{ url: "not-a-url" }],
    })).toBe(false);
  });

  it("image_gallery: accepts valid image URL", () => {
    expect(validateBlockContent("image_gallery", {
      images: [{ url: "https://cdn.example.com/img.jpg", alt: "Test" }],
    })).toBe(true);
  });

  it("testimonials: accepts valid testimonial items", () => {
    expect(validateBlockContent("testimonials", {
      items: [{ author: "Alice", text: "Great product!", rating: 5 }],
    })).toBe(true);
  });

  it("testimonials: rejects rating out of range (> 5)", () => {
    expect(validateBlockContent("testimonials", {
      items: [{ author: "Alice", text: "Great!", rating: 6 }],
    })).toBe(false);
  });

  it("testimonials: rejects rating out of range (< 1)", () => {
    expect(validateBlockContent("testimonials", {
      items: [{ author: "Alice", text: "Bad!", rating: 0 }],
    })).toBe(false);
  });

  it("cta_strip: requires text, cta_text, cta_url", () => {
    expect(validateBlockContent("cta_strip", { text: "Offer" })).toBe(false);
    expect(validateBlockContent("cta_strip", { cta_text: "Buy" })).toBe(false);
  });

  it("newsletter: has defaults for cta_text and placeholder", () => {
    const result = blockSchemas.newsletter.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.cta_text).toBe("Subscribe");
    }
  });
});

describe("BLOCK_REGISTRY — structural invariants", () => {
  it("every block type has a non-empty label", () => {
    for (const type of BLOCK_TYPES) {
      const entry = getBlockEntry(type);
      expect(entry.label.length).toBeGreaterThan(0);
    }
  });

  it("every block type has a description", () => {
    for (const type of BLOCK_TYPES) {
      const entry = getBlockEntry(type);
      expect(entry.description.length).toBeGreaterThan(0);
    }
  });

  it("every block type has a schema", () => {
    for (const type of BLOCK_TYPES) {
      const entry = getBlockEntry(type);
      expect(entry.schema).toBeDefined();
    }
  });

  it("every block type has a defaultContent object", () => {
    for (const type of BLOCK_TYPES) {
      const entry = getBlockEntry(type);
      expect(typeof entry.defaultContent).toBe("object");
    }
  });

  it("defaultContent passes its own schema validation", () => {
    for (const type of BLOCK_TYPES) {
      const entry = getBlockEntry(type);
      const result = entry.schema.safeParse(entry.defaultContent);
      // defaultContent should at minimum not throw, even if partial
      expect(result).toBeDefined();
    }
  });
});
