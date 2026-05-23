-- ============================================================================
-- Migration 00058: Phase 3.4 follow-up — drop orphaned SECDEF function overloads
-- ============================================================================
--
-- WHY:
--   Earlier migrations added wider signatures to SECDEF functions (extra
--   params with DEFAULT). Postgres treats those as NEW functions instead of
--   replacing the old ones. The old overloads sit there with the default
--   PUBLIC grant — still callable by anon via PostgREST.
--
--   00057 locked the current (wider) signatures. This migration drops the
--   orphaned narrower overloads so they can't be invoked at all.
--
-- AFFECTED OVERLOADS (verified via pg_proc.proacl on 2026-05-23):
--   • approve_return(uuid, uuid, text)
--   • create_replacement_order(uuid, uuid)
--   • update_order_status(uuid, order_status, uuid, text)             — 4 args
--   • update_order_status(uuid, order_status, text, text)             — 4 args, text changed_by
--
--   Current canonical signatures (kept):
--   • approve_return(uuid, uuid, text, boolean)
--   • create_replacement_order(uuid, uuid, boolean)
--   • update_order_status(uuid, order_status, text, text, text)
--
-- IDEMPOTENCY:
--   DROP FUNCTION IF EXISTS — safe to re-run.
-- ============================================================================

DROP FUNCTION IF EXISTS public.approve_return(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.create_replacement_order(uuid, uuid);
DROP FUNCTION IF EXISTS public.update_order_status(uuid, public.order_status, uuid, text);
DROP FUNCTION IF EXISTS public.update_order_status(uuid, public.order_status, text, text);
