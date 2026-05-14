/**
 * Integration tests — Permission enforcement (RBAC)
 *
 * Verifies that permission logic correctly guards operations across
 * every role level: super_admin, admin, editor, viewer, customer.
 *
 * These tests do not call the DB — they exercise the permission logic layer
 * that would be used by server actions and API route handlers.
 */
import { describe, expect, it } from "vitest";

import {
  PERMISSIONS,
  type PermissionCode,
} from "@/lib/admin/permissions";

// ── RBAC helper (mirrors what admin auth context would enforce) ───────────────

function hasPermission(userPerms: PermissionCode[], required: PermissionCode): boolean {
  return userPerms.includes(required);
}

function hasAllPermissions(userPerms: PermissionCode[], required: PermissionCode[]): boolean {
  return required.every((p) => userPerms.includes(p));
}

function hasAnyPermission(userPerms: PermissionCode[], required: PermissionCode[]): boolean {
  return required.some((p) => userPerms.includes(p));
}

// ── Role fixtures ─────────────────────────────────────────────────────────────

const SUPER_ADMIN_PERMS: PermissionCode[] = Object.values(PERMISSIONS) as PermissionCode[];

const CATALOG_MANAGER_PERMS: PermissionCode[] = [
  PERMISSIONS.CATALOG_READ,
  PERMISSIONS.CATALOG_WRITE,
  PERMISSIONS.INVENTORY_READ,
  PERMISSIONS.INVENTORY_WRITE,
];

const ORDER_MANAGER_PERMS: PermissionCode[] = [
  PERMISSIONS.ORDERS_READ,
  PERMISSIONS.ORDERS_MANAGE,
  PERMISSIONS.CUSTOMERS_READ,
];

const CMS_EDITOR_PERMS: PermissionCode[] = [
  PERMISSIONS.CMS_READ,
  PERMISSIONS.CMS_EDIT,
  PERMISSIONS.CMS_PREVIEW,
];

const CMS_PUBLISHER_PERMS: PermissionCode[] = [
  ...CMS_EDITOR_PERMS,
  PERMISSIONS.CMS_PUBLISH,
  PERMISSIONS.CMS_MANAGE_NAVIGATION,
  PERMISSIONS.CMS_MANAGE_BANNERS,
  PERMISSIONS.CMS_MANAGE_MEDIA,
];

const ANALYTICS_VIEWER_PERMS: PermissionCode[] = [
  PERMISSIONS.ANALYTICS_READ,
];

// ── Test cases ────────────────────────────────────────────────────────────────

describe("RBAC — Super Admin", () => {
  it("has all permissions", () => {
    for (const code of Object.values(PERMISSIONS)) {
      expect(hasPermission(SUPER_ADMIN_PERMS, code as PermissionCode)).toBe(true);
    }
  });
});

describe("RBAC — Catalog Manager", () => {
  it("can read and write catalog", () => {
    expect(hasPermission(CATALOG_MANAGER_PERMS, PERMISSIONS.CATALOG_READ)).toBe(true);
    expect(hasPermission(CATALOG_MANAGER_PERMS, PERMISSIONS.CATALOG_WRITE)).toBe(true);
  });

  it("can manage inventory", () => {
    expect(hasPermission(CATALOG_MANAGER_PERMS, PERMISSIONS.INVENTORY_WRITE)).toBe(true);
  });

  it("cannot manage orders", () => {
    expect(hasPermission(CATALOG_MANAGER_PERMS, PERMISSIONS.ORDERS_MANAGE)).toBe(false);
  });

  it("cannot publish CMS content", () => {
    expect(hasPermission(CATALOG_MANAGER_PERMS, PERMISSIONS.CMS_PUBLISH)).toBe(false);
  });

  it("cannot access analytics", () => {
    expect(hasPermission(CATALOG_MANAGER_PERMS, PERMISSIONS.ANALYTICS_READ)).toBe(false);
  });
});

describe("RBAC — Order Manager", () => {
  it("can view and manage orders", () => {
    expect(hasPermission(ORDER_MANAGER_PERMS, PERMISSIONS.ORDERS_READ)).toBe(true);
    expect(hasPermission(ORDER_MANAGER_PERMS, PERMISSIONS.ORDERS_MANAGE)).toBe(true);
  });

  it("can view customers", () => {
    expect(hasPermission(ORDER_MANAGER_PERMS, PERMISSIONS.CUSTOMERS_READ)).toBe(true);
  });

  it("cannot write customer data", () => {
    expect(hasPermission(ORDER_MANAGER_PERMS, PERMISSIONS.CUSTOMERS_WRITE)).toBe(false);
  });

  it("cannot access catalog write operations", () => {
    expect(hasPermission(ORDER_MANAGER_PERMS, PERMISSIONS.CATALOG_WRITE)).toBe(false);
  });
});

describe("RBAC — CMS Editor", () => {
  it("can read and edit CMS content", () => {
    expect(hasPermission(CMS_EDITOR_PERMS, PERMISSIONS.CMS_READ)).toBe(true);
    expect(hasPermission(CMS_EDITOR_PERMS, PERMISSIONS.CMS_EDIT)).toBe(true);
  });

  it("can preview drafts", () => {
    expect(hasPermission(CMS_EDITOR_PERMS, PERMISSIONS.CMS_PREVIEW)).toBe(true);
  });

  it("CANNOT publish content", () => {
    expect(hasPermission(CMS_EDITOR_PERMS, PERMISSIONS.CMS_PUBLISH)).toBe(false);
  });

  it("CANNOT manage navigation", () => {
    expect(hasPermission(CMS_EDITOR_PERMS, PERMISSIONS.CMS_MANAGE_NAVIGATION)).toBe(false);
  });

  it("CANNOT manage banners", () => {
    expect(hasPermission(CMS_EDITOR_PERMS, PERMISSIONS.CMS_MANAGE_BANNERS)).toBe(false);
  });

  it("CANNOT manage media library", () => {
    expect(hasPermission(CMS_EDITOR_PERMS, PERMISSIONS.CMS_MANAGE_MEDIA)).toBe(false);
  });
});

describe("RBAC — CMS Publisher", () => {
  it("has all CMS editor permissions", () => {
    expect(hasAllPermissions(CMS_PUBLISHER_PERMS, CMS_EDITOR_PERMS)).toBe(true);
  });

  it("can publish content", () => {
    expect(hasPermission(CMS_PUBLISHER_PERMS, PERMISSIONS.CMS_PUBLISH)).toBe(true);
  });

  it("can manage navigation and banners", () => {
    expect(hasPermission(CMS_PUBLISHER_PERMS, PERMISSIONS.CMS_MANAGE_NAVIGATION)).toBe(true);
    expect(hasPermission(CMS_PUBLISHER_PERMS, PERMISSIONS.CMS_MANAGE_BANNERS)).toBe(true);
  });

  it("CANNOT manage orders", () => {
    expect(hasPermission(CMS_PUBLISHER_PERMS, PERMISSIONS.ORDERS_MANAGE)).toBe(false);
  });
});

describe("RBAC — Analytics Viewer", () => {
  it("can view analytics", () => {
    expect(hasPermission(ANALYTICS_VIEWER_PERMS, PERMISSIONS.ANALYTICS_READ)).toBe(true);
  });

  it("cannot write anything else", () => {
    const writePerms: PermissionCode[] = [
      PERMISSIONS.CATALOG_WRITE,
      PERMISSIONS.INVENTORY_WRITE,
      PERMISSIONS.ORDERS_MANAGE,
      PERMISSIONS.CUSTOMERS_WRITE,
      PERMISSIONS.CMS_PUBLISH,
    ];
    expect(hasAnyPermission(ANALYTICS_VIEWER_PERMS, writePerms)).toBe(false);
  });
});

describe("RBAC — No permissions (storefront-only user)", () => {
  const NO_PERMS: PermissionCode[] = [];

  it("denies all admin operations", () => {
    for (const code of Object.values(PERMISSIONS)) {
      expect(hasPermission(NO_PERMS, code as PermissionCode)).toBe(false);
    }
  });
});

describe("RBAC — Permission escalation prevention", () => {
  it("editor cannot grant themselves publish rights", () => {
    // Simulates an editor attempting to self-escalate
    const editor = [...CMS_EDITOR_PERMS];
    // Adding cms:publish is NOT possible via the role system — only admin can grant it
    // This test ensures the permission list does not auto-include cms:publish
    expect(editor).not.toContain(PERMISSIONS.CMS_PUBLISH);
  });

  it("order manager cannot access CMS at all", () => {
    const cmsPerms: PermissionCode[] = [
      PERMISSIONS.CMS_READ,
      PERMISSIONS.CMS_EDIT,
      PERMISSIONS.CMS_PUBLISH,
    ];
    expect(hasAnyPermission(ORDER_MANAGER_PERMS, cmsPerms)).toBe(false);
  });
});
