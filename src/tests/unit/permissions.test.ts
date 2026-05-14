/**
 * Unit tests — RBAC Permissions
 *
 * Verifies the permission constants and group structures are consistent
 * and that the display-label map covers every permission code.
 */
import { describe, expect, it } from "vitest";

import {
  PERMISSIONS,
  PERMISSION_GROUPS,
  PERMISSION_LABELS,
  type PermissionCode,
} from "@/lib/admin/permissions";

describe("PERMISSIONS constant", () => {
  it("exports all expected permission codes", () => {
    const codes = Object.values(PERMISSIONS);
    expect(codes).toContain("catalog:read");
    expect(codes).toContain("catalog:write");
    expect(codes).toContain("orders:read");
    expect(codes).toContain("orders:manage");
    expect(codes).toContain("cms:read");
    expect(codes).toContain("cms:edit");
    expect(codes).toContain("cms:publish");
    expect(codes).toContain("cms:preview");
    expect(codes).toContain("cms:manage_navigation");
    expect(codes).toContain("cms:manage_banners");
    expect(codes).toContain("cms:manage_media");
    expect(codes).toContain("inventory:read");
    expect(codes).toContain("inventory:write");
    expect(codes).toContain("customers:read");
    expect(codes).toContain("customers:write");
    expect(codes).toContain("analytics:read");
  });

  it("all permission values follow the 'scope:action' pattern", () => {
    for (const code of Object.values(PERMISSIONS)) {
      expect(code).toMatch(/^[a-z_]+:[a-z_]+$/);
    }
  });

  it("has no duplicate permission codes", () => {
    const codes = Object.values(PERMISSIONS);
    const unique = new Set(codes);
    expect(unique.size).toBe(codes.length);
  });
});

describe("PERMISSION_LABELS", () => {
  it("has a label for every permission code", () => {
    for (const code of Object.values(PERMISSIONS)) {
      expect(PERMISSION_LABELS[code as PermissionCode]).toBeDefined();
      expect(PERMISSION_LABELS[code as PermissionCode].length).toBeGreaterThan(0);
    }
  });

  it("every labeled key is a known permission code", () => {
    const knownCodes = new Set(Object.values(PERMISSIONS));
    for (const key of Object.keys(PERMISSION_LABELS)) {
      expect(knownCodes.has(key as PermissionCode)).toBe(true);
    }
  });

  it("no label is an empty string", () => {
    for (const label of Object.values(PERMISSION_LABELS)) {
      expect(label.trim().length).toBeGreaterThan(0);
    }
  });
});

describe("PERMISSION_GROUPS", () => {
  it("catalog group contains read and write", () => {
    expect(PERMISSION_GROUPS.catalog).toContain(PERMISSIONS.CATALOG_READ);
    expect(PERMISSION_GROUPS.catalog).toContain(PERMISSIONS.CATALOG_WRITE);
  });

  it("orders group contains read and manage", () => {
    expect(PERMISSION_GROUPS.orders).toContain(PERMISSIONS.ORDERS_READ);
    expect(PERMISSION_GROUPS.orders).toContain(PERMISSIONS.ORDERS_MANAGE);
  });

  it("cms group contains read, edit, and publish", () => {
    expect(PERMISSION_GROUPS.cms).toContain(PERMISSIONS.CMS_READ);
    expect(PERMISSION_GROUPS.cms).toContain(PERMISSIONS.CMS_EDIT);
    expect(PERMISSION_GROUPS.cms).toContain(PERMISSIONS.CMS_PUBLISH);
  });

  it("analytics group contains analytics:read", () => {
    expect(PERMISSION_GROUPS.analytics).toContain(PERMISSIONS.ANALYTICS_READ);
  });

  it("all codes in groups are known permission codes", () => {
    const knownCodes = new Set(Object.values(PERMISSIONS));
    for (const group of Object.values(PERMISSION_GROUPS)) {
      for (const code of group) {
        expect(knownCodes.has(code as PermissionCode)).toBe(true);
      }
    }
  });
});

describe("Permission access control logic", () => {
  function hasPermission(userPerms: PermissionCode[], required: PermissionCode): boolean {
    return userPerms.includes(required);
  }

  function hasAnyPermission(userPerms: PermissionCode[], required: PermissionCode[]): boolean {
    return required.some((p) => userPerms.includes(p));
  }

  it("grants access when user has exact permission", () => {
    const user: PermissionCode[] = ["catalog:read", "orders:read"];
    expect(hasPermission(user, "catalog:read")).toBe(true);
  });

  it("denies access when user lacks the permission", () => {
    const user: PermissionCode[] = ["catalog:read"];
    expect(hasPermission(user, "catalog:write")).toBe(false);
  });

  it("denies read-only user from write operations", () => {
    const readOnlyUser: PermissionCode[] = [
      "catalog:read",
      "orders:read",
      "cms:read",
    ];
    expect(hasPermission(readOnlyUser, "catalog:write")).toBe(false);
    expect(hasPermission(readOnlyUser, "cms:publish")).toBe(false);
    expect(hasPermission(readOnlyUser, "orders:manage")).toBe(false);
  });

  it("grants CMS editor access to edit but not publish", () => {
    const editor: PermissionCode[] = ["cms:read", "cms:edit", "cms:preview"];
    expect(hasPermission(editor, "cms:edit")).toBe(true);
    expect(hasPermission(editor, "cms:publish")).toBe(false);
  });

  it("hasAnyPermission returns true when at least one matches", () => {
    const user: PermissionCode[] = ["analytics:read"];
    expect(hasAnyPermission(user, ["catalog:read", "analytics:read"])).toBe(true);
  });

  it("hasAnyPermission returns false when none match", () => {
    const user: PermissionCode[] = ["catalog:read"];
    expect(hasAnyPermission(user, ["cms:publish", "orders:manage"])).toBe(false);
  });
});
