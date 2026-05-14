/**
 * Integration test setup helpers.
 *
 * For integration tests that exercise the domain layer with mocked Supabase,
 * these helpers provide a controlled, isolated DB simulation that:
 * - returns deterministic data per test
 * - validates that the correct tables/RPCs are called
 * - resets between tests to prevent state leakage
 *
 * NOTE: Real DB integration tests should run against a local Supabase instance
 * (see `supabase start`). The helpers here support mocked variants for CI.
 */

import { vi, type MockedFunction } from "vitest";

// ── Supabase mock builder ─────────────────────────────────────────────────────

interface ChainMock {
  select: MockedFunction<() => ChainMock>;
  insert: MockedFunction<() => ChainMock>;
  update: MockedFunction<() => ChainMock>;
  upsert: MockedFunction<() => ChainMock>;
  delete: MockedFunction<() => ChainMock>;
  eq: MockedFunction<() => ChainMock>;
  in: MockedFunction<() => ChainMock>;
  neq: MockedFunction<() => ChainMock>;
  gte: MockedFunction<() => ChainMock>;
  lte: MockedFunction<() => ChainMock>;
  order: MockedFunction<() => ChainMock>;
  limit: MockedFunction<() => ChainMock>;
  single: MockedFunction<() => Promise<{ data: unknown; error: null }>>;
  maybeSingle: MockedFunction<() => Promise<{ data: unknown; error: null }>>;
  then: undefined;
  // Resolves the chain to a data/error pair
  __resolve: (data: unknown, error?: unknown) => void;
}

export function makeSupabaseChainMock(defaultData: unknown = null): ChainMock {
  let resolveWith: unknown = defaultData;

  const terminal = () =>
    Promise.resolve({ data: resolveWith, error: null, count: null });

  const chain: ChainMock = {
    __resolve: (data: unknown) => { resolveWith = data; },
    select: vi.fn().mockReturnThis() as unknown as ChainMock["select"],
    insert: vi.fn().mockReturnValue({ data: resolveWith, error: null }),
    update: vi.fn().mockReturnThis() as unknown as ChainMock["update"],
    upsert: vi.fn().mockReturnValue({ data: resolveWith, error: null }),
    delete: vi.fn().mockReturnThis() as unknown as ChainMock["delete"],
    eq: vi.fn().mockReturnThis() as unknown as ChainMock["eq"],
    in: vi.fn().mockReturnThis() as unknown as ChainMock["in"],
    neq: vi.fn().mockReturnThis() as unknown as ChainMock["neq"],
    gte: vi.fn().mockReturnThis() as unknown as ChainMock["gte"],
    lte: vi.fn().mockReturnThis() as unknown as ChainMock["lte"],
    order: vi.fn().mockReturnThis() as unknown as ChainMock["order"],
    limit: vi.fn().mockReturnThis() as unknown as ChainMock["limit"],
    single: vi.fn().mockImplementation(terminal) as unknown as ChainMock["single"],
    maybeSingle: vi.fn().mockImplementation(terminal) as unknown as ChainMock["maybeSingle"],
    then: undefined,
  };

  return chain;
}

/**
 * Builds a minimal mock Supabase service client.
 * Pass table-specific handlers to override default behavior.
 */
export function makeSupabaseServiceMock(
  tables: Record<string, Partial<ChainMock>> = {},
) {
  const defaultChain = makeSupabaseChainMock();

  return {
    from: vi.fn().mockImplementation((table: string) => {
      return tables[table] ?? defaultChain;
    }),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    storage: {
      from: vi.fn().mockReturnValue({
        upload: vi.fn().mockResolvedValue({ data: { path: "mock/path.jpg" }, error: null }),
        getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: "https://cdn.example.com/mock.jpg" } }),
        remove: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
    },
  };
}

// ── Supabase user auth mock ───────────────────────────────────────────────────

export function makeAuthUser(overrides: Partial<{
  id: string;
  email: string;
  role: string;
}> = {}) {
  return {
    id: overrides.id ?? "user-test-001",
    email: overrides.email ?? "test@example.com",
    role: overrides.role ?? "authenticated",
    aud: "authenticated",
    created_at: new Date().toISOString(),
  };
}

// ── RLS test assertions ────────────────────────────────────────────────────────

/**
 * Asserts that a query was filtered by user_id (RLS pattern).
 */
export function assertRLSFilterApplied(
  mockFn: MockedFunction<() => ChainMock>,
  userId: string,
): void {
  const eqCalls = mockFn.mock.calls as unknown as Array<[string, string]>;
  const hasUserFilter = eqCalls.some(
    ([field, value]) => field === "user_id" && value === userId,
  );
  if (!hasUserFilter) {
    throw new Error(
      `Expected RLS filter user_id = ${userId} to be applied but it was not found in .eq() calls`,
    );
  }
}
