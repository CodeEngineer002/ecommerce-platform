/**
 * Integration tests — Admin permission enforcement (requireAdminPermission + logAdminAction)
 *
 * Tests every auth/permission path through requireAdminPermission:
 *   - unauthenticated → 401
 *   - non-admin role → 403
 *   - super_admin → always passes (no fine-grained check)
 *   - admin + has_permission=true → passes
 *   - admin + has_permission=false + has user_roles entries → 403
 *   - admin + has_permission=false + zero user_roles (legacy) → passes
 *
 * Also verifies that logAdminAction writes the correct fields and
 * that errors from audit writes are silently swallowed.
 *
 * Supabase server client is mocked — no real DB needed.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PERMISSIONS } from "@/lib/admin/permissions";
import { logAdminAction, requireAdminPermission } from "@/lib/admin/with-admin-permission";
import { AuthError, ForbiddenError } from "@/lib/errors";

// ── Supabase server mock ──────────────────────────────────────────────────────

const mockGetUser = vi.fn();
const mockRpc = vi.fn();
const mockProfilesSingle = vi.fn();
const mockUserRolesQuery = vi.fn();
const mockLogsInsert = vi.fn();

function makeServiceClient() {
  return {
    from: vi.fn().mockImplementation((table: string) => {
      switch (table) {
        case "profiles":
          return {
            select: () => ({ eq: () => ({ single: mockProfilesSingle }) }),
          };
        case "user_roles":
          return {
            select: () => ({ eq: mockUserRolesQuery }),
          };
        case "admin_action_logs":
          return { insert: mockLogsInsert };
        default:
          return {};
      }
    }),
  };
}

function makeUserClient() {
  return {
    auth: { getUser: mockGetUser },
    rpc: mockRpc,
  };
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => makeUserClient()),
  createServiceClient: vi.fn(() => makeServiceClient()),
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

const MOCK_USER = { id: "user-abc-123", email: "admin@test.com" };

function authedAs(role: string) {
  mockGetUser.mockResolvedValueOnce({ data: { user: MOCK_USER }, error: null });
  mockProfilesSingle.mockResolvedValueOnce({ data: { role }, error: null });
}

function noSession() {
  mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });
}

function permissionResult(hasPerm: boolean) {
  mockRpc.mockResolvedValueOnce({ data: hasPerm });
}

function userRolesCount(count: number) {
  mockUserRolesQuery.mockResolvedValueOnce({ count, error: null });
}

function makeRequest(headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/admin/orders/order-1/status", {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      "user-agent": "vitest/1.0",
      ...headers,
    },
  });
}

// ── requireAdminPermission ────────────────────────────────────────────────────

describe("requireAdminPermission — authentication", () => {
  beforeEach(() => vi.clearAllMocks());

  it("throws AuthError (401) when user is not logged in", async () => {
    noSession();
    await expect(
      requireAdminPermission(PERMISSIONS.ORDERS_MANAGE),
    ).rejects.toThrow(AuthError);
  });
});

describe("requireAdminPermission — coarse role check", () => {
  beforeEach(() => vi.clearAllMocks());

  it("throws ForbiddenError (403) when profile is null (deleted user)", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: MOCK_USER }, error: null });
    mockProfilesSingle.mockResolvedValueOnce({ data: null, error: null });
    await expect(
      requireAdminPermission(PERMISSIONS.ORDERS_MANAGE),
    ).rejects.toThrow(ForbiddenError);
  });

  it("throws ForbiddenError (403) for customer role", async () => {
    authedAs("customer");
    await expect(
      requireAdminPermission(PERMISSIONS.ORDERS_MANAGE),
    ).rejects.toThrow(ForbiddenError);
  });

  it("throws ForbiddenError (403) for unrecognised role", async () => {
    authedAs("warehouse_operator");
    await expect(
      requireAdminPermission(PERMISSIONS.ORDERS_MANAGE),
    ).rejects.toThrow(ForbiddenError);
  });
});

describe("requireAdminPermission — super_admin bypass", () => {
  beforeEach(() => vi.clearAllMocks());

  it("grants access to super_admin without calling has_permission", async () => {
    authedAs("super_admin");

    const ctx = await requireAdminPermission(PERMISSIONS.ORDERS_MANAGE);

    expect(ctx.user.id).toBe(MOCK_USER.id);
    expect(ctx.role).toBe("super_admin");
    // has_permission RPC must NOT be called — super_admin always wins
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("super_admin passes for every permission code", async () => {
    for (const perm of Object.values(PERMISSIONS)) {
      vi.clearAllMocks();
      authedAs("super_admin");
      const ctx = await requireAdminPermission(perm);
      expect(ctx.role).toBe("super_admin");
    }
  });
});

describe("requireAdminPermission — fine-grained permission (admin role)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("grants access when has_permission returns true", async () => {
    authedAs("admin");
    permissionResult(true);

    const ctx = await requireAdminPermission(PERMISSIONS.ORDERS_READ);

    expect(ctx.user.id).toBe(MOCK_USER.id);
    expect(ctx.role).toBe("admin");
    expect(mockRpc).toHaveBeenCalledWith("has_permission", {
      p_permission_code: PERMISSIONS.ORDERS_READ,
    });
  });

  it("throws ForbiddenError when has_permission false and admin has role entries", async () => {
    authedAs("admin");
    permissionResult(false);
    userRolesCount(2); // has roles but lacks THIS permission

    await expect(
      requireAdminPermission(PERMISSIONS.ORDERS_MANAGE),
    ).rejects.toThrow(ForbiddenError);
  });

  it("throws ForbiddenError when has_permission false even if zero user_roles (no bypass)", async () => {
    authedAs("admin");
    permissionResult(false);
    userRolesCount(0); // zero roles = no access; RBAC is fully enforced

    await expect(
      requireAdminPermission(PERMISSIONS.ORDERS_MANAGE),
    ).rejects.toThrow(ForbiddenError);
  });

  it("checks has_permission with the exact permission code requested", async () => {
    authedAs("admin");
    permissionResult(true);

    await requireAdminPermission(PERMISSIONS.CATALOG_WRITE);

    expect(mockRpc).toHaveBeenCalledWith("has_permission", {
      p_permission_code: "catalog:write",
    });
  });
});

// ── logAdminAction ────────────────────────────────────────────────────────────

describe("logAdminAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLogsInsert.mockResolvedValue({});
  });

  function makeCtx() {
    return {
      user: MOCK_USER,
      role: "admin",
      db: makeServiceClient() as unknown as ReturnType<
        typeof import("@/lib/supabase/server").createServiceClient
      >,
    };
  }

  it("inserts correct fields to admin_action_logs", async () => {
    const ctx = makeCtx();
    const request = makeRequest({
      "x-forwarded-for": "1.2.3.4",
      "user-agent": "TestBrowser/1.0",
    });

    await logAdminAction(ctx, request, {
      action: "update_order_status",
      entityType: "order",
      entityId: "order-xyz",
      metadata: { status: "confirmed" },
    });

    expect(mockLogsInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        actor_id: MOCK_USER.id,
        actor_role: "admin",
        action: "update_order_status",
        entity_type: "order",
        entity_id: "order-xyz",
        ip_address: "1.2.3.4",
        user_agent: "TestBrowser/1.0",
        metadata: { status: "confirmed" },
      }),
    );
  });

  it("uses x-real-ip when x-forwarded-for is absent", async () => {
    const ctx = makeCtx();
    const request = makeRequest({ "x-real-ip": "9.8.7.6" });

    await logAdminAction(ctx, request, {
      action: "process_refund",
      entityType: "order",
      entityId: "order-xyz",
    });

    expect(mockLogsInsert).toHaveBeenCalledWith(
      expect.objectContaining({ ip_address: "9.8.7.6" }),
    );
  });

  it("defaults metadata to empty object when not provided", async () => {
    const ctx = makeCtx();

    await logAdminAction(ctx, makeRequest(), {
      action: "approve_return",
      entityType: "return",
      entityId: "return-1",
    });

    expect(mockLogsInsert).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: {} }),
    );
  });

  it("swallows errors from the audit insert without throwing", async () => {
    mockLogsInsert.mockRejectedValueOnce(new Error("DB write failed"));
    const ctx = makeCtx();

    // Must not throw — audit failures cannot break main request
    await expect(
      logAdminAction(ctx, makeRequest(), {
        action: "update_order_status",
        entityType: "order",
        entityId: "order-1",
      }),
    ).resolves.toBeUndefined();
  });
});
