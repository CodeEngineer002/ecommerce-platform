-- ============================================================
-- MIGRATION 00018 — SCHEDULED CLEANUP JOBS
-- ============================================================
-- This migration does three things, in order:
--
--   1. HOTFIX: Restore the complete update_order_status state machine.
--      Migration 00017 accidentally replaced the 20-transition machine
--      from 00011 with only 6 transitions, breaking pending_payment →
--      cancelled (used by Stripe webhooks and this cron job).
--      The fix keeps the inventory-release logic from 00017.
--
--   2. Create cancel_unpaid_orders() — cancels orders that have been
--      waiting for payment for too long:
--        - 'pending_payment' orders older than 30 minutes
--        - 'pending' orders older than 24 hours (user never initiated payment)
--      Uses FOR UPDATE SKIP LOCKED so concurrent invocations are safe.
--      Each order is processed in its own sub-transaction; one failure
--      never aborts the entire batch.
--
--   3. Schedule both cleanup jobs via pg_cron (idempotent — safe to re-run).
--      Guarded by an existence check so the migration does not fail in
--      environments where pg_cron is not yet enabled.
--
-- Run order dependency: 00017 must have been applied first.
-- ============================================================

-- ── PART 1: Restore full update_order_status state machine ───────────────────
-- Complete transition table from 00011 + inventory-release logic from 00017.
-- All 20+ valid transitions are preserved.

CREATE OR REPLACE FUNCTION public.update_order_status(
  p_order_id   uuid,
  p_new_status public.order_status,
  p_changed_by uuid,
  p_reason     text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_current_status public.order_status;
BEGIN
  SELECT status INTO v_current_status
    FROM public.orders
   WHERE id = p_order_id
     FOR UPDATE;

  IF v_current_status IS NULL THEN
    RAISE EXCEPTION 'Order % not found', p_order_id
      USING ERRCODE = 'P0005';
  END IF;

  IF NOT (
    -- Payment / pending flows
    (v_current_status = 'draft'              AND p_new_status IN ('pending', 'pending_payment', 'cancelled')) OR
    (v_current_status = 'pending'            AND p_new_status IN ('confirmed', 'pending_payment', 'cancelled')) OR
    (v_current_status = 'pending_payment'    AND p_new_status IN ('confirmed', 'cancelled', 'failed')) OR
    -- Fulfilment flow
    (v_current_status = 'confirmed'          AND p_new_status IN ('processing', 'cancelled')) OR
    (v_current_status = 'processing'         AND p_new_status IN ('packed', 'shipped', 'cancelled')) OR
    (v_current_status = 'packed'             AND p_new_status IN ('shipped', 'cancelled')) OR
    (v_current_status = 'shipped'            AND p_new_status IN ('out_for_delivery', 'delivered', 'cancelled')) OR
    (v_current_status = 'out_for_delivery'   AND p_new_status = 'delivered') OR
    -- Post-delivery
    (v_current_status = 'delivered'          AND p_new_status IN (
        'return_requested', 'replacement_requested', 'refund_requested',
        'partially_returned', 'partially_refunded', 'refunded')) OR
    -- Return flow
    (v_current_status = 'return_requested'   AND p_new_status IN ('return_approved', 'return_rejected')) OR
    (v_current_status = 'return_approved'    AND p_new_status = 'return_in_transit') OR
    (v_current_status = 'return_in_transit'  AND p_new_status = 'returned') OR
    (v_current_status = 'returned'           AND p_new_status IN ('refunded', 'replacement_shipped')) OR
    -- Replacement flow
    (v_current_status = 'replacement_requested' AND p_new_status IN ('replacement_approved', 'replacement_rejected')) OR
    (v_current_status = 'replacement_approved'  AND p_new_status = 'replacement_shipped') OR
    (v_current_status = 'replacement_shipped'   AND p_new_status = 'replacement_delivered') OR
    -- Refund flow
    (v_current_status = 'refund_requested'   AND p_new_status = 'refund_processing') OR
    (v_current_status = 'refund_processing'  AND p_new_status IN ('refunded', 'partially_refunded')) OR
    -- Partial states
    (v_current_status = 'partially_returned' AND p_new_status IN (
        'return_requested', 'replacement_requested', 'refund_requested',
        'refunded', 'partially_refunded')) OR
    (v_current_status = 'partially_refunded' AND p_new_status = 'refunded') OR
    -- Terminal transitions
    (v_current_status = 'cancelled'          AND p_new_status = 'refunded') OR
    (v_current_status = 'failed'             AND p_new_status = 'pending_payment')
  ) THEN
    RAISE EXCEPTION 'Invalid status transition: % -> %', v_current_status, p_new_status
      USING ERRCODE = 'P0006';
  END IF;

  UPDATE public.orders
     SET status = p_new_status, updated_at = now()
   WHERE id = p_order_id;

  INSERT INTO public.order_status_history (order_id, from_status, to_status, changed_by, reason)
  VALUES (p_order_id, v_current_status, p_new_status, p_changed_by, p_reason);

  -- Release reserved inventory when order moves to a terminal failure state
  IF p_new_status IN ('cancelled', 'failed') THEN
    PERFORM public.release_inventory_reservation(p_order_id);
  END IF;
END;
$$;


-- ── PART 2: cancel_unpaid_orders() ───────────────────────────────────────────
-- Scans for orders that have been waiting too long for payment and cancels them.
--
-- Targets:
--   - 'pending_payment': 30 minutes   (Stripe PaymentIntent window)
--   - 'pending':         24 hours     (order created, user never reached payment)
--
-- Design notes:
--   FOR UPDATE SKIP LOCKED — if a concurrent job run (or admin action) is
--   already processing an order, we skip it rather than wait or fail.
--
--   Each order is wrapped in its own BEGIN/EXCEPTION subtransaction.
--   A failure on one order (e.g. an unexpected status) logs a WARNING
--   and moves on — the rest of the batch still runs.
--
--   Inventory reservation is released via release_inventory_reservation()
--   which already handles the GREATEST(0, reserved - qty) guard.
--
--   changed_by is NULL to indicate a system-generated action, matching
--   the convention used by automated processes throughout the codebase.
--
-- Returns: number of orders cancelled in this run (useful for cron logs).

CREATE OR REPLACE FUNCTION public.cancel_unpaid_orders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order   RECORD;
  v_count   integer := 0;
BEGIN
  FOR v_order IN
    SELECT id, status
      FROM public.orders
     WHERE (
             (status = 'pending_payment' AND created_at < now() - interval '30 minutes') OR
             (status = 'pending'         AND created_at < now() - interval '24 hours')
           )
     ORDER BY created_at   -- oldest first; predictable processing order
     FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      UPDATE public.orders
         SET status = 'cancelled', updated_at = now()
       WHERE id = v_order.id;

      INSERT INTO public.order_status_history
        (order_id, from_status, to_status, changed_by, reason)
      VALUES
        (v_order.id, v_order.status, 'cancelled', NULL,
         CASE v_order.status
           WHEN 'pending_payment' THEN 'System: payment not received within 30 minutes'
           ELSE                        'System: order abandoned — payment never initiated'
         END);

      PERFORM public.release_inventory_reservation(v_order.id);

      v_count := v_count + 1;

    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'cancel_unpaid_orders: skipped order % (status: %): %',
        v_order.id, v_order.status, SQLERRM;
    END;
  END LOOP;

  RETURN v_count;
END;
$$;

-- Grant execute to postgres role (cron runs as postgres in Supabase)
GRANT EXECUTE ON FUNCTION public.cancel_unpaid_orders() TO postgres;
GRANT EXECUTE ON FUNCTION public.expire_abandoned_carts() TO postgres;


-- ── PART 3: Schedule cron jobs ────────────────────────────────────────────────
-- Guarded by a pg_cron existence check — migration will not fail if the
-- extension is not yet enabled in this environment.
--
-- To enable pg_cron in Supabase: Dashboard → Database → Extensions → pg_cron
--
-- Jobs are removed-then-re-added (idempotent). Running this migration twice
-- does not create duplicate jobs.
--
-- Schedules:
--   expire_abandoned_carts  — every hour at :00       (low urgency)
--   cancel_unpaid_orders    — every 10 minutes        (time-sensitive)

DO $cron_setup$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE
      '% pg_cron is not enabled. Skipping cron job setup. '
      'Enable it in Dashboard → Database → Extensions → pg_cron, '
      'then re-run this migration or manually schedule the jobs.',
      clock_timestamp();
    RETURN;
  END IF;

  -- Remove existing jobs first (idempotent re-runs)
  PERFORM cron.unschedule(jobname)
    FROM cron.job
   WHERE jobname IN ('shopnest:expire-abandoned-carts', 'shopnest:cancel-unpaid-orders');

  -- Expire abandoned carts — hourly
  PERFORM cron.schedule(
    'shopnest:expire-abandoned-carts',
    '0 * * * *',
    'SELECT public.expire_abandoned_carts()'
  );

  -- Cancel unpaid orders — every 10 minutes
  PERFORM cron.schedule(
    'shopnest:cancel-unpaid-orders',
    '*/10 * * * *',
    'SELECT public.cancel_unpaid_orders()'
  );

  RAISE NOTICE 'pg_cron jobs scheduled: shopnest:expire-abandoned-carts (hourly), shopnest:cancel-unpaid-orders (every 10 min)';
END;
$cron_setup$;
