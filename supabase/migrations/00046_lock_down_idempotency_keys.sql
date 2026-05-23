-- ============================================================================
-- Migration 00046: Lock down idempotency_keys
-- ============================================================================
--
-- VULNERABILITY (Phase 0 audit 2026-05-23):
--   `public.idempotency_keys` had RLS DISABLED with full SELECT/INSERT/UPDATE/
--   DELETE/TRUNCATE/TRIGGER/REFERENCES grants to both `anon` and
--   `authenticated`. This means:
--
--     • Any web visitor (no auth) could read every cached order-creation
--       response, leaking order IDs and response payloads.
--     • Any visitor could UPDATE rows, poisoning cached responses so a legit
--       retry returns fake order data (or hides a real order from the user).
--     • Any visitor could DELETE / TRUNCATE the cache, removing the
--       idempotency guard and enabling duplicate-order attacks under retry.
--
-- DECISION:
--   Service-role-only. This matches industry practice (Stripe, AWS, Shopify):
--   idempotency stores are server infrastructure, never exposed to clients.
--   All code that touches this table (orders/create + stripe webhook) already
--   uses `createServiceClient()` which bypasses RLS, so no application
--   refactor is needed.
--
-- CHANGES:
--   1. Enable RLS on the table.
--   2. Add a single ALL policy gated on service_role (defence in depth —
--      grants are also revoked below, so this only matters if grants are
--      ever restored).
--   3. REVOKE every privilege from anon + authenticated + PUBLIC.
--   4. service_role retains its implicit superuser-equivalent access via
--      Supabase's role configuration.
-- ============================================================================

ALTER TABLE public.idempotency_keys ENABLE ROW LEVEL SECURITY;

-- Defence-in-depth policy: even if grants are accidentally restored later,
-- only service_role can act on this table.
DROP POLICY IF EXISTS "service_role_only" ON public.idempotency_keys;
CREATE POLICY "service_role_only"
  ON public.idempotency_keys
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Revoke all client-role access. service_role uses a separate connection
-- pool and is unaffected by this.
REVOKE ALL ON public.idempotency_keys FROM anon;
REVOKE ALL ON public.idempotency_keys FROM authenticated;
REVOKE ALL ON public.idempotency_keys FROM PUBLIC;
