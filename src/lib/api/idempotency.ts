/**
 * Request-level idempotency for mutating API routes.
 *
 * Pattern (inline in each route AFTER permission check, BEFORE work):
 *
 *   const idempKey = request.headers.get("Idempotency-Key");
 *   const cached   = await idempotencyCheck(db, "cod-collect", idempKey);
 *   if (cached) return apiSuccess(cached);
 *
 *   // … do the work, build `result` …
 *
 *   await idempotencyStore(db, "cod-collect", idempKey, result);
 *   return apiSuccess(result);
 *
 * Why a namespace? The `idempotency_keys` table is global — without a
 * per-endpoint prefix, an idempotency key collision between two endpoints
 * would replay the wrong response. Use a short stable identifier per endpoint
 * (e.g. "cod-collect", "refund", "mark-refused").
 *
 * Caller is responsible for choosing a key strategy:
 *   - Customer-provided header (preferred for replays from clients)
 *   - Auto-generated key (e.g. crypto.randomUUID()) for server-initiated ops
 *
 * If `key` is null/undefined, both helpers are no-ops — idempotency is
 * effectively opt-in per request.
 */
import type { Json } from "@/types/database.types";
import type { createServiceClient } from "@/lib/supabase/server";

type ServiceClient = ReturnType<typeof createServiceClient>;

function ns(namespace: string, key: string): string {
  return `${namespace}:${key}`;
}

export async function idempotencyCheck(
  db: ServiceClient,
  namespace: string,
  key: string | null,
): Promise<Record<string, unknown> | null> {
  if (!key) return null;
  const { data } = await db
    .from("idempotency_keys")
    .select("response_body")
    .eq("key", ns(namespace, key))
    .maybeSingle();
  return (data?.response_body as Record<string, unknown> | null) ?? null;
}

export async function idempotencyStore(
  db: ServiceClient,
  namespace: string,
  key: string | null,
  body: Record<string, unknown>,
): Promise<void> {
  if (!key) return;
  await db
    .from("idempotency_keys")
    .upsert(
      { key: ns(namespace, key), response_body: body as unknown as Json },
      { onConflict: "key", ignoreDuplicates: true },
    );
}
