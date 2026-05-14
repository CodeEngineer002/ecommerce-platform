"use client";

import type { ReactNode } from "react";

import { useAdminContext } from "@/lib/admin/context";
import type { PermissionCode } from "@/lib/admin/permissions";

interface PermissionGateProps {
  permission: PermissionCode | string;
  fallback?: ReactNode;
  children: ReactNode;
}

/**
 * Renders children only when the current admin user holds the required
 * permission. Falls back to `fallback` (default: null) otherwise.
 *
 * Admin and super_admin bypass all permission checks.
 *
 * NOTE: This is a UI convenience only. Server-side route guards and
 * RLS policies are the authoritative enforcement mechanisms.
 */
export function PermissionGate({ permission, fallback = null, children }: PermissionGateProps) {
  const { hasPermission } = useAdminContext();
  return hasPermission(permission) ? <>{children}</> : <>{fallback}</>;
}
