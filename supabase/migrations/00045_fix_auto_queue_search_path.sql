-- ============================================================================
-- Migration 00045: Fix auto_queue_confirmed_orders silent failure
-- ============================================================================
--
-- BUG (Phase 0 audit 2026-05-23):
--   `auto_queue_confirmed_orders()` was returning 0 every cron run for ~5 days,
--   leaving real customer orders frozen in `confirmed` state. Three orders were
--   stuck for 96–151 hours despite the pg_cron job firing every 5 minutes and
--   reporting "succeeded".
--
-- ROOT CAUSE:
--   The function calls `gen_random_bytes(4)` to mint a tracking number. This
--   function lives in the `pgcrypto` extension which Supabase installs in the
--   `extensions` schema. The function declares `SET search_path = public`,
--   which excludes `extensions`, so the call resolves to nothing and raises
--   `ERROR 42883: function gen_random_bytes(integer) does not exist`. The
--   inner `EXCEPTION WHEN OTHERS` block swallowed the error per-order and
--   the loop continued, so the function looked like a no-op success.
--
-- FIX:
--   Fully qualify the call as `extensions.gen_random_bytes(4)`. Widening
--   search_path would also work but introduces a search-path-injection
--   surface; explicit qualification is the safer choice.
--
-- VERIFICATION (Phase 0):
--   With this fix, `auto_queue_confirmed_orders()` correctly transitions
--   `confirmed` orders to `processing`, creates the fulfillment row with a
--   real tracking number, and writes an `order_events` audit row.
--
-- BLAST RADIUS:
--   - Single function replacement; no schema/data changes.
--   - No backfill needed: re-running the job picks up any orders that were
--     stuck during the bug window.
--   - The orders already stuck in `confirmed` for days will be auto-queued
--     on the next cron run after this migration applies.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.auto_queue_confirmed_orders()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order        RECORD;
  v_count        int := 0;
  v_tracking_num text;
  v_est_delivery timestamptz;
BEGIN
  FOR v_order IN
    SELECT o.id, o.user_id, o.created_at
      FROM public.orders o
     WHERE o.status = 'confirmed'
       -- debounce: don't auto-process orders confirmed in the last 2 minutes
       AND o.updated_at < now() - interval '2 minutes'
       -- no fulfillment exists yet (or all failed)
       AND NOT EXISTS (
         SELECT 1 FROM public.order_fulfillments f
          WHERE f.order_id = o.id
            AND f.status NOT IN ('failed')
       )
     ORDER BY o.created_at
     FOR UPDATE OF o SKIP LOCKED
     LIMIT 100
  LOOP
    BEGIN
      -- Move to processing
      PERFORM public.update_order_status(
        p_order_id   := v_order.id,
        p_new_status := 'processing',
        p_changed_by := NULL,
        p_reason     := 'Auto-queued for fulfillment by scheduled job',
        p_source     := 'scheduled_job'
      );

      -- Generate tracking number: TRK-YYYYMMDD-XXXXXX
      -- FIX (00045): qualify gen_random_bytes — lives in extensions schema,
      -- not in our SET search_path = public above.
      v_tracking_num := 'TRK-'
        || to_char(now(), 'YYYYMMDD')
        || '-'
        || upper(substring(encode(extensions.gen_random_bytes(4), 'hex'), 1, 6));

      -- Default estimated delivery: 3 business days from now
      v_est_delivery := now() + interval '3 days';

      -- Create fulfillment row
      INSERT INTO public.order_fulfillments
        (order_id, status, tracking_number, estimated_delivery, created_by)
      VALUES
        (v_order.id, 'processing', v_tracking_num, v_est_delivery, NULL)
      ON CONFLICT DO NOTHING;

      -- Write order_events entry
      INSERT INTO public.order_events
        (order_id, event_type, actor_id, actor_type, description, metadata, source)
      VALUES (
        v_order.id,
        'order_processing',
        NULL,
        'system',
        'Order automatically queued for fulfillment',
        jsonb_build_object(
          'tracking_number', v_tracking_num,
          'estimated_delivery', v_est_delivery,
          'job', 'auto_queue_confirmed_orders'
        ),
        'scheduled_job'
      );

      v_count := v_count + 1;

    EXCEPTION WHEN OTHERS THEN
      -- One failed order should not abort the batch
      RAISE WARNING '[auto_queue_confirmed_orders] Order % failed: %', v_order.id, SQLERRM;
    END;
  END LOOP;

  RETURN v_count;
END;
$$;
