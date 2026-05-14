// All permission codes that exist in the DB `permissions` table.
// Source of truth: supabase/migrations/00008_enterprise_core.sql + 00011_cms_permissions.sql

export const PERMISSIONS = {
  // Catalog
  CATALOG_READ:    "catalog:read",
  CATALOG_WRITE:   "catalog:write",

  // Inventory
  INVENTORY_READ:  "inventory:read",
  INVENTORY_WRITE: "inventory:write",

  // Orders
  ORDERS_READ:     "orders:read",
  ORDERS_MANAGE:   "orders:manage",

  // Customers
  CUSTOMERS_READ:  "customers:read",
  CUSTOMERS_WRITE: "customers:write",

  // CMS
  CMS_READ:              "cms:read",
  CMS_EDIT:              "cms:edit",
  CMS_PUBLISH:           "cms:publish",
  CMS_PREVIEW:           "cms:preview",
  CMS_MANAGE_NAVIGATION: "cms:manage_navigation",
  CMS_MANAGE_BANNERS:    "cms:manage_banners",
  CMS_MANAGE_MEDIA:      "cms:manage_media",

  // Analytics
  ANALYTICS_READ: "analytics:read",
} as const;

export type PermissionCode = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

// Groups used for sidebar nav guards
export const PERMISSION_GROUPS = {
  catalog:   [PERMISSIONS.CATALOG_READ, PERMISSIONS.CATALOG_WRITE],
  orders:    [PERMISSIONS.ORDERS_READ, PERMISSIONS.ORDERS_MANAGE],
  cms:       [PERMISSIONS.CMS_READ, PERMISSIONS.CMS_EDIT, PERMISSIONS.CMS_PUBLISH],
  analytics: [PERMISSIONS.ANALYTICS_READ],
} as const;

// Display names for the admin UI
export const PERMISSION_LABELS: Record<PermissionCode, string> = {
  "catalog:read":            "View products & categories",
  "catalog:write":           "Manage products & categories",
  "inventory:read":          "View inventory",
  "inventory:write":         "Manage inventory",
  "orders:read":             "View orders",
  "orders:manage":           "Manage orders",
  "customers:read":          "View customers",
  "customers:write":         "Manage customers",
  "cms:read":                "View CMS content",
  "cms:edit":                "Edit CMS content",
  "cms:publish":             "Publish CMS content",
  "cms:preview":             "Preview drafts",
  "cms:manage_navigation":   "Manage navigation menus",
  "cms:manage_banners":      "Manage banners",
  "cms:manage_media":        "Manage media library",
  "analytics:read":          "View analytics",
};
