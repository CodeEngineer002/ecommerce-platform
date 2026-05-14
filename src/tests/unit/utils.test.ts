import { describe, expect, it } from "vitest";

import { calculateDiscount, formatPrice, getInitials, slugify, truncate } from "@/lib/utils";

describe("formatPrice", () => {
  it("formats INR correctly", () => {
    expect(formatPrice(1000)).toContain("1,000");
  });

  it("handles zero", () => {
    expect(formatPrice(0)).toContain("0");
  });
});

describe("calculateDiscount", () => {
  it("returns 0 when no compare price", () => {
    expect(calculateDiscount(800, 800)).toBe(0);
  });

  it("calculates percentage correctly", () => {
    expect(calculateDiscount(800, 1000)).toBe(20);
  });

  it("returns 0 when base is higher than compare", () => {
    expect(calculateDiscount(1200, 1000)).toBe(0);
  });
});

describe("slugify", () => {
  it("converts to lowercase slug", () => {
    expect(slugify("Hello World")).toBe("hello-world");
  });

  it("removes special characters", () => {
    expect(slugify("Hello! World?")).toBe("hello-world");
  });

  it("collapses multiple hyphens", () => {
    expect(slugify("hello   world")).toBe("hello-world");
  });
});

describe("truncate", () => {
  it("does not truncate short text", () => {
    expect(truncate("hello", 10)).toBe("hello");
  });

  it("truncates and adds ellipsis", () => {
    const result = truncate("hello world", 5);
    expect(result).toHaveLength(6);
    expect(result.endsWith("…")).toBe(true);
  });
});

describe("getInitials", () => {
  it("returns first two initials", () => {
    expect(getInitials("John Doe")).toBe("JD");
  });

  it("handles single name", () => {
    expect(getInitials("John")).toBe("J");
  });
});
