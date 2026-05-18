-- ══════════════════════════════════════════════════════════════════════════════
-- Migration: 00034_fix_payment_events_schema
--
-- Problem: public.payment_events was created in migration 00006 with a minimal
-- schema (no actor_id / actor_role / notes / metadata columns, and a narrow
-- event_type CHECK constraint).  Migration 00021 tried to re-create the table
-- with richer columns via CREATE TABLE IF NOT EXISTS — that silently no-ops
-- because the table already exists.  The confirm_cod_cash_collected function
-- then fails with "column actor_id does not exist".
--
-- Fix:
--   1. Add the missing columns (IF NOT EXISTS so re-runs are safe).
--   2. Drop the old event_type CHECK and add a broader one that includes COD
--      event types used by confirm_cod_cash_collected / cancel_cod_payment.
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 1. Add missing columns ────────────────────────────────────────────────────
ALTER TABLE public.payment_events
  ADD COLUMN IF NOT EXISTS actor_id   uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS actor_role text,
  ADD COLUMN IF NOT EXISTS notes      text,
  ADD COLUMN IF NOT EXISTS metadata   jsonb;

-- ── 2. Expand event_type CHECK constraint ─────────────────────────────────────
-- Drop the existing constraint (name may vary; use a DO block to be safe)
DO $$
DECLARE
  v_constraint text;
BEGIN
  SELECT conname INTO v_constraint
    FROM pg_constraint
   WHERE conrelid = 'public.payment_events'::regclass
     AND contype  = 'c'
     AND pg_get_constraintdef(oid) LIKE '%event_type%'
   LIMIT 1;

  IF v_constraint IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.payment_events DROP CONSTRAINT ' || quote_ident(v_constraint);
  END IF;
END;
$$;

ALTER TABLE public.payment_events
  ADD CONSTRAINT payment_events_event_type_check
  CHECK (event_type IN (
    -- original payment gateway events
    'created', 'authorized', 'captured', 'failed',
    'refunded', 'partially_refunded', 'webhook_received',
    'intent_created', 'retry',
    -- COD lifecycle events (added by migration 00021)
    'cod_collection_confirmed', 'cod_payment_cancelled',
    -- generic / future-proof
    'updated', 'voided'
  ));
