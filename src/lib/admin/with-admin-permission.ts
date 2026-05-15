import "server-only";

import type { User } from "@supabase/supabase-js";

import { AuthError, ForbiddenError } from "@/lib/errors";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database.types";

import type { PermissionCode } from "./permissions";

export interface AdminContext {
  user: User;
  role: string;
  db: ReturnType<typeof createServiceClient>;
}

/**
 * Validates that the current request comes from an authenticated admin with
 * the specified fine-grained permission. Returns { user, role, db } on success.
 *
 * Auth flow:
 * 1. Must be authenticated
 * 2. profile.role must be 'admin' or 'super_admin'
 * 3. super_admin always passes (bypasses fine-grained check)
 * 4. admin: has_permission() called via user client (uses auth.uid() internally)
 *    - Legacy admins with no user_roles rows are allowed-all during transition
 */
export async function requireAdminPermission(permission: PermissionCode): Promise<AdminContext> {
  const userClient = await createClient();
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) throw new AuthError();

  const db = createServiceClient();

  const { data: profile } = await db
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || !["admin", "super_admin"].includes(profile.role)) {
    throw new ForbiddenError();
  }

  if (profile.role === "super_admin") {
    return { user, role: profile.role, db };
  }

  // has_permission uses auth.uid() — must be called on the user client, not service client
  const { data: hasPerm } = await userClient.rpc("has_permission", {
    p_permission_code: permission,
  });

  if (!hasPerm) {
    // Legacy transition: admins with no user_roles entries predate RBAC — allow-all
    const { count } = await db
      .from("user_roles")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);

    if ((count ?? 0) === 0) {
      return { user, role: profile.role, db };
    }

    throw new ForbiddenError(`Missing permission: ${permission}`);
  }

  return { user, role: profile.role, db };
}

/**
 * Writes an audit entry to admin_action_logs.
 * Errors are swallowed so an audit failure never breaks the request.
 */
export async function logAdminAction(
  ctx: AdminContext,
  request: Request,
  params: {
    action: string;
    entityType: string;
    entityId: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  try {
    await ctx.db.from("admin_action_logs").insert({
      actor_id: ctx.user.id,
      actor_role: ctx.role,
      action: params.action,
      entity_type: params.entityType,
      entity_id: params.entityId,
      metadata: (params.metadata ?? {}) as Json,
      ip_address:
        request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip"),
      user_agent: request.headers.get("user-agent"),
    });
  } catch {
    // Intentional: audit failures must not break the main request
  }
}
