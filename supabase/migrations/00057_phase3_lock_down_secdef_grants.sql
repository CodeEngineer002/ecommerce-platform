-- ============================================================================
-- Migration 00057: Phase 3.4 — Lock down SECURITY DEFINER function grants
-- ============================================================================
--
-- BACKGROUND:
--   Postgres grants EXECUTE on new functions to PUBLIC by default. Combined
--   with SECURITY DEFINER (runs as the function owner, bypassing the
--   caller's RLS), the default grants mean anon / authenticated callers can
--   invoke these functions via PostgREST RPC and trigger privileged side
--   effects.
--
--   The Phase 3.4 audit (audit/phase-3/results/secdef_audit.txt) identified
--   13 mutating SECDEF functions with overly-broad grants.
--
-- THIS MIGRATION:
--   For every mutating, internal, or admin-only SECDEF function, we REVOKE
--   EXECUTE from PUBLIC/anon/authenticated and GRANT only to service_role.
--   Customer-callable RPCs (request_return, cancel_order — both NON-DEFINER)
--   and read-only helpers (is_admin, has_permission, available_stock_for_country)
--   are left as-is.
--
--   Triggers (handle_new_user, auto_create_fulfillment_on_ship,
--   sync_primary_category, update_review_vote_counts) keep PUBLIC grant
--   because the trigger fires implicitly — REVOKE wouldn't break them.
--
-- BLAST RADIUS:
--   Customer-facing flows (cart, returns, cancels) go through API routes
--   that use the server's service_role client, which is unaffected. No
--   customer code calls these RPCs directly via the anon/authenticated
--   PostgREST client.
--
-- DROPPING DEBUG FUNCTION:
--   auto_queue_confirmed_orders_debug was a one-off debug helper that
--   shouldn't exist in production with public execute. Drop it.
--
-- IDEMPOTENCY:
--   REVOKE / GRANT are naturally idempotent.
-- ============================================================================

-- ── 1. Drop the prod-leaked debug function ──────────────────────────────────
DROP FUNCTION IF EXISTS public.auto_queue_confirmed_orders_debug();

-- ── 2. Helper: revoke from public/anon/auth and grant only to service_role ─
-- We list functions explicitly (no dynamic SQL) so the migration is auditable
-- and obvious in code review.

-- Order state machine + inventory
REVOKE ALL ON FUNCTION public.update_order_status(uuid, public.order_status, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_order_status(uuid, public.order_status, text, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.commit_inventory_for_order(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commit_inventory_for_order(uuid, uuid) TO service_role;

-- release_inventory_reservation may exist with several signatures; revoke broadly via DO block.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid, n.nspname, p.proname,
           pg_get_function_identity_arguments(p.oid) AS args
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = 'release_inventory_reservation'
  LOOP
    EXECUTE format(
      'REVOKE ALL ON FUNCTION %I.%I(%s) FROM PUBLIC, anon, authenticated',
      r.nspname, r.proname, r.args
    );
    EXECUTE format(
      'GRANT EXECUTE ON FUNCTION %I.%I(%s) TO service_role',
      r.nspname, r.proname, r.args
    );
  END LOOP;
END $$;

-- Cron jobs (no caller other than cron/service-role)
REVOKE ALL ON FUNCTION public.cancel_unpaid_orders()                  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.auto_queue_confirmed_orders()           FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.detect_stuck_orders()                   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reconcile_cod_pending_collection()      FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expire_abandoned_carts()                FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_unpaid_orders()             TO service_role;
GRANT EXECUTE ON FUNCTION public.auto_queue_confirmed_orders()      TO service_role;
GRANT EXECUTE ON FUNCTION public.detect_stuck_orders()              TO service_role;
GRANT EXECUTE ON FUNCTION public.reconcile_cod_pending_collection() TO service_role;
GRANT EXECUTE ON FUNCTION public.expire_abandoned_carts()           TO service_role;

-- Admin-only return / replacement lifecycle
REVOKE ALL ON FUNCTION public.approve_return(uuid, uuid, text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_replacement_order(uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.restock_returned_items(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_return_collected(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_return_pickup_scheduled(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_return_received(uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.check_replacement_inventory(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_return(uuid, uuid, text, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_replacement_order(uuid, uuid, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.restock_returned_items(uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_return_collected(uuid, uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_return_pickup_scheduled(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_return_received(uuid, uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.check_replacement_inventory(uuid) TO service_role;

-- Tracking + fulfillment (admin/service surface)
REVOKE ALL ON FUNCTION public.append_tracking_event(uuid, text, text, text, text, timestamptz, text, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.append_tracking_event(uuid, text, text, text, text, timestamptz, text, jsonb, text) TO service_role;

-- merge_guest_cart — guest carts merge into authenticated user carts.
-- The function checks p_user_cart_id ownership, so authenticated callers
-- ARE allowed (this is the customer-callable login-merge path).
-- Keep authenticated grant; revoke from anon + PUBLIC.
REVOKE ALL ON FUNCTION public.merge_guest_cart(uuid, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.merge_guest_cart(uuid, uuid, integer) TO authenticated, service_role;

-- get_or_create_user_cart — authenticated callers fetching their own cart.
REVOKE ALL ON FUNCTION public.get_or_create_user_cart(uuid, char, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_or_create_user_cart(uuid, char, text) TO authenticated, service_role;

-- ── 3. Verification helpers — read-only, fine to keep wide ──────────────────
-- is_admin, is_content_manager, has_permission are checks used inside RLS
-- policies and called by JWT-aware code. They return a boolean based on the
-- CURRENT actor's identity (auth.uid()), so they're safe with PUBLIC grant.
-- available_stock_for_country is a public read for the storefront.
-- handle_new_user is a trigger (no direct callers).
-- We leave their grants untouched.
