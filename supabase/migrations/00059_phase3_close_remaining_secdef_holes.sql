-- ============================================================================
-- Migration 00059: Phase 3.4 closure — lock the 5 remaining SECDEF holes
-- ============================================================================
--
-- POST-PHASE-3 RE-AUDIT (2026-05-23) caught 5 mutating SECURITY DEFINER
-- functions that still granted EXECUTE to anon + authenticated:
--
--   • cancel_cod_payment         (00021 → 00035, missed in 00057)
--   • confirm_cod_cash_collected (00021 → 00033 → 00035, missed in 00057)
--   • mark_delivery_refused      (00053 — REVOKE only hit PUBLIC, not anon/auth)
--   • mark_rto_in_transit        (00053 — same bug)
--   • complete_rto               (00053 — same bug)
--
-- WHY THIS IS P0:
--   These bypass RLS. With anon EXECUTE, a logged-in user (or even unauth'd
--   visitor depending on session) could call them via PostgREST RPC and:
--     • Mark someone else's COD order as paid (confirm_cod_cash_collected)
--     • Mark in-transit orders as refused (mark_delivery_refused)
--     • Cancel COD payments belonging to other users (cancel_cod_payment)
--     • Skip-cancel orders via the RTO completion path (complete_rto)
--
--   State-machine guards inside the functions REJECT invalid transitions
--   (e.g. you can't mark `confirmed` as paid), but for orders already in
--   valid states the action would succeed.
--
-- CALLER VERIFICATION (done before writing this migration):
--   All 5 functions are called only from server-side API routes that use
--   createServiceClient(). No client-side / anon callers exist. Locking to
--   service_role-only does NOT break any user-facing flow.
--
-- IDEMPOTENCY:
--   REVOKE / GRANT are naturally re-runnable.
-- ============================================================================

REVOKE ALL ON FUNCTION public.cancel_cod_payment(uuid, uuid, text)                          FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.confirm_cod_cash_collected(uuid, numeric, uuid, text, text)   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_delivery_refused(uuid, uuid, text)                       FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_rto_in_transit(uuid, uuid, text)                         FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_rto(uuid, uuid, text)                                FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.cancel_cod_payment(uuid, uuid, text)                          TO service_role;
GRANT EXECUTE ON FUNCTION public.confirm_cod_cash_collected(uuid, numeric, uuid, text, text)   TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_delivery_refused(uuid, uuid, text)                       TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_rto_in_transit(uuid, uuid, text)                         TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_rto(uuid, uuid, text)                                TO service_role;

-- Bonus: aggregate_cod_collections_* (Phase 2.3) — same default-grant issue.
-- The daily aggregator is only invoked by the cron route (service_role) or
-- by manual admin trigger via /api/admin/cod-reconciliation/route.ts (also
-- service_role). No customer/admin client-side caller exists.
REVOKE ALL ON FUNCTION public.aggregate_cod_collections_for_date(date)  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.aggregate_cod_collections_yesterday()     FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.aggregate_cod_collections_for_date(date)  TO service_role;
GRANT EXECUTE ON FUNCTION public.aggregate_cod_collections_yesterday()     TO service_role;
