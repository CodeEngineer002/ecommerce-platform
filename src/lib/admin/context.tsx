"use client";

import { createContext, useContext, type ReactNode } from "react";

import type { PermissionCode } from "./permissions";

export interface AdminUser {
  id: string;
  email: string;
}

export interface AdminProfile {
  id: string;
  role: "customer" | "admin" | "super_admin";
}

export interface AdminContextValue {
  user: AdminUser;
  profile: AdminProfile;
  permissions: string[];
  hasPermission: (code: PermissionCode | string) => boolean;
  isAdmin: boolean;
  isSuperAdmin: boolean;
}

const AdminContext = createContext<AdminContextValue | null>(null);

export function useAdminContext(): AdminContextValue {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error("useAdminContext must be used inside AdminProvider");
  return ctx;
}

interface AdminProviderProps {
  user: AdminUser;
  profile: AdminProfile;
  permissions: string[];
  children: ReactNode;
}

export function AdminProvider({ user, profile, permissions, children }: AdminProviderProps) {
  const isAdmin = profile.role === "admin" || profile.role === "super_admin";
  const isSuperAdmin = profile.role === "super_admin";

  function hasPermission(code: string): boolean {
    if (isAdmin) return true;
    if (permissions.includes("*")) return true;
    return permissions.includes(code);
  }

  return (
    <AdminContext.Provider value={{ user, profile, permissions, hasPermission, isAdmin, isSuperAdmin }}>
      {children}
    </AdminContext.Provider>
  );
}
