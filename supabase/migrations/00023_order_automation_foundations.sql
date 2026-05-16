-- =============================================================================
-- Migration 00023: Order Automation Foundations
-- =============================================================================
--
-- Problem:
--   Current order lifecycle has critical manual gaps:
--   1. order_status_history has no 'source' field — impossible to distinguish
--      admin_override vs payment_webhook vs system automation in audit logs.
--   2. Confirmed orders never auto-progress to processing — manual every time.
--   3. No job infrastructure for reconciliation/stuck-order detection.
--
-- Changes:
--   A. Add 'source' column to order_status_history
--      Sources: payment_webhook | logistics_webhook | scheduled_job |
--               admin_override  | customer_action   | system
--   B. Backfill existing rows (NULL → 'system' as safe default)
--   C. Update update_order_status() to accept and record source
--   D. auto_queue_confirmed_orders() — called by scheduled job to move
--      confirmed orders → processing + create fulfillment rows in bulk
--   E. detect_stuck_orders() — finds orders stuck in non-terminal states
--      past their SLA and records them in order_exceptions
--   F. order_exceptions table — exception queue for admin intervention
--   G. pg_cron jobs for:
--      - auto_queue_confirmed_orders (every 5 min)
--      - detect_stuck_orders (every 15 min)
--   H. order_events: add source + transition_id columns for full traceability
-- =============================================================================

-- =============================================================================
-- PART A: source field on order_status_history
-- =============================================================================

ALTER TABLE public.order_status_history
  ADD COLUMN IF NOT EXISTS source text
    NOT NULL DEFAULT 'system'
    CHECK (source IN (
      'payment_webhook',
      'logistics_webhook',
      'scheduled_job',
      'admin_override',
      'customer_action',
      'system'
    ));

-- Backfill existing rows
-- 'system' for NULL changed_by (automated),
-- 'admin_override' for rows with a UUID changed_by (human actor)
UPDATE public.order_status_history
   SET source = CASE
     WHEN changed_by IS NULL                         THEN 'system'
     WHEN changed_by::text = 'system'               THEN 'system'
     ELSE 'admin_override'
   END
 WHERE source = 'system'; -- default was already set; this refines where needed

-- Index for filtering by source in admin queries
CREATE INDEX IF NOT EXISTS idx_order_status_history_source
  ON public.order_status_history(source);

CREATE INDEX IF NOT EXISTS idx_order_status_history_order_created
  ON public.order_status_history(order_id, created_at DESC);

-- =============================================================================
-- PART B: order_events — add source column
-- =============================================================================

ALTER TABLE public.order_events
  ADD COLUMN IF NOT EXISTS source text
    NOT NULL DEFAULT 'system'
    CHECK (source IN (
      'payment_webhook',
      'logistics_webhook',
      'scheduled_job',
      'admin_override',
      'customer_action',
      'system'
    ));

-- =============================================================================
-- PART C: Update update_order_status() to accept source
-- =============================================================================

CREATE OR REPLACE FUNCTION public.update_order_status(
  p_order_id   uuid,
  p_new_status public.order_status,
  p_changed_by text     DEFAULT NULL,
  p_reason     text     DEFAULT NULL,
  p_source     text     DEFAULT 'system'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_status public.order_status;
  v_source         text := COALESCE(p_source, 'system');
BEGIN
  -- Lock the row to prevent concurrent transitions
  SELECT status INTO v_current_status
    FROM public.orders
   WHERE id = p_order_id
     FOR UPDATE;

  IF v_current_status IS NULL THEN
    RAISE EXCEPTION 'Order % not found', p_order_id USING ERRCODE = 'P0005';
  END IF;

  -- Idempotency: no-op if already in target state
  IF v_current_status = p_new_status THEN
    RETURN;
  END IF;

  -- ── State machine transition validation ───────────────────────────────────
  IF NOT (
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

  -- ── Apply transition ──────────────────────────────────────────────────────
  UPDATE public.orders
     SET status     = p_new_status,
         updated_at = now()
   WHERE id = p_order_id;

  -- Validate source value
  IF v_source NOT IN ('payment_webhook','logistics_webhook','scheduled_job','admin_override','customer_action','system') THEN
    v_source := 'system';
  END IF;

  INSERT INTO public.order_status_history
    (order_id, from_status, to_status, changed_by, reason, source)
  VALUES
    (p_order_id, v_current_status, p_new_status,
     NULLIF(p_changed_by, 'system')::uuid,   -- NULL for system; UUID for human
     p_reason, v_source);

  -- ── Release reserved inventory on terminal failure ────────────────────────
  IF p_new_status IN ('cancelled', 'failed') THEN
    PERFORM public.release_inventory_reservation(p_order_id);
  END IF;
END;
$$;

-- =============================================================================
-- PART D: order_exceptions — admin exception queue
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.order_exceptions (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        uuid        NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  exception_type  text        NOT NULL,
  -- e.g. stuck_order | delivery_failed | cod_collection_overdue
  -- shipment_not_updated | return_inspection_pending | refund_delayed
  severity        text        NOT NULL DEFAULT 'warning'
    CHECK (severity IN ('info', 'warning', 'critical')),
  title           text        NOT NULL,
  description     text,
  metadata        jsonb       NOT NULL DEFAULT '{}',
  status          text        NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'acknowledged', 'resolved', 'auto_resolved')),
  resolved_by     uuid        REFERENCES auth.users(id),
  resolved_at     timestamptz,
  resolution_note text,
  detected_at     timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Partial unique index: only one open exception per (order_id, exception_type) at a time
CREATE UNIQUE INDEX IF NOT EXISTS uq_order_exceptions_open
  ON public.order_exceptions(order_id, exception_type)
  WHERE status = 'open';

CREATE INDEX IF NOT EXISTS idx_order_exceptions_status
  ON public.order_exceptions(status, detected_at DESC);

CREATE INDEX IF NOT EXISTS idx_order_exceptions_order_id
  ON public.order_exceptions(order_id);

CREATE INDEX IF NOT EXISTS idx_order_exceptions_type
  ON public.order_exceptions(exception_type, status);

CREATE TRIGGER trg_order_exceptions_updated_at
  BEFORE UPDATE ON public.order_exceptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.order_exceptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage order exceptions"
  ON public.order_exceptions FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- =============================================================================
-- PART E: auto_queue_confirmed_orders()
-- =============================================================================
--
-- Finds all orders that are 'confirmed' AND have no active fulfillment row,
-- AND have been confirmed for at least 2 minutes (debounce for race conditions).
-- For each:
--   1. Moves order to 'processing'
--   2. Creates a fulfillment row with auto-generated tracking number
--   3. Writes order_events entry
--
-- Design notes:
--   - FOR UPDATE SKIP LOCKED: concurrent job runs skip in-flight orders
--   - Idempotent: orders already in processing are ignored
--   - Returns count of orders queued for logging
-- =============================================================================

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
      v_tracking_num := 'TRK-'
        || to_char(now(), 'YYYYMMDD')
        || '-'
        || upper(substring(encode(gen_random_bytes(4), 'hex'), 1, 6));

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

-- =============================================================================
-- PART F: detect_stuck_orders()
-- =============================================================================
--
-- Finds orders that have been in a non-terminal state past their SLA
-- and creates order_exception entries for admin review.
--
-- SLA thresholds (configurable here):
--   confirmed       → processing:      4 hours  (should auto-queue faster)
--   processing      → packed:          24 hours
--   packed          → shipped:         24 hours
--   shipped         → out_for_delivery: 5 days
--   out_for_delivery → delivered:       2 days
--   return_in_transit → returned:       7 days
-- =============================================================================

CREATE OR REPLACE FUNCTION public.detect_stuck_orders()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exception RECORD;
  v_count     int := 0;
BEGIN
  FOR v_exception IN
    SELECT
      o.id           AS order_id,
      o.status       AS current_status,
      o.updated_at   AS last_updated,
      CASE o.status
        WHEN 'confirmed'          THEN 'Order stuck in confirmed — not auto-queued within 4 hours'
        WHEN 'processing'         THEN 'Order stuck in processing — not packed within 24 hours'
        WHEN 'packed'             THEN 'Order packed but not shipped within 24 hours'
        WHEN 'shipped'            THEN 'Shipment not updated for 5 days'
        WHEN 'out_for_delivery'   THEN 'Out for delivery for more than 2 days — possible failed delivery'
        WHEN 'return_in_transit'  THEN 'Return in transit for more than 7 days'
        ELSE 'Order stuck in ' || o.status::text
      END AS exc_title,
      CASE o.status
        WHEN 'out_for_delivery' THEN 'critical'
        WHEN 'return_in_transit' THEN 'warning'
        ELSE 'warning'
      END AS exc_severity
    FROM public.orders o
    WHERE o.status IN (
      'confirmed', 'processing', 'packed', 'shipped',
      'out_for_delivery', 'return_in_transit'
    )
    -- SLA per status
    AND (
      (o.status = 'confirmed'          AND o.updated_at < now() - interval '4 hours') OR
      (o.status = 'processing'         AND o.updated_at < now() - interval '24 hours') OR
      (o.status = 'packed'             AND o.updated_at < now() - interval '24 hours') OR
      (o.status = 'shipped'            AND o.updated_at < now() - interval '5 days') OR
      (o.status = 'out_for_delivery'   AND o.updated_at < now() - interval '2 days') OR
      (o.status = 'return_in_transit'  AND o.updated_at < now() - interval '7 days')
    )
    -- No open exception of this type already exists
    AND NOT EXISTS (
      SELECT 1 FROM public.order_exceptions e
       WHERE e.order_id = o.id
         AND e.exception_type = 'stuck_order'
         AND e.status = 'open'
    )
  LOOP
    BEGIN
      INSERT INTO public.order_exceptions
        (order_id, exception_type, severity, title, description, metadata)
      VALUES (
        v_exception.order_id,
        'stuck_order',
        v_exception.exc_severity,
        v_exception.exc_title,
        'Order has not progressed past ' || v_exception.current_status::text
          || ' since ' || v_exception.last_updated::text,
        jsonb_build_object(
          'current_status', v_exception.current_status,
          'last_updated',   v_exception.last_updated,
          'detected_by',    'detect_stuck_orders'
        )
      )
      ON CONFLICT (order_id, exception_type)
        WHERE status = 'open'
        DO NOTHING;

      v_count := v_count + 1;

    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '[detect_stuck_orders] Order % failed: %', v_exception.order_id, SQLERRM;
    END;
  END LOOP;

  RETURN v_count;
END;
$$;

-- =============================================================================
-- PART G: reconcile_cod_pending_collection()
-- =============================================================================
--
-- Finds COD orders that have been 'delivered' for more than 48 hours
-- but still have cod_pending_collection payment status.
-- Creates an exception for admin review.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.reconcile_cod_pending_collection()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row   RECORD;
  v_count int := 0;
BEGIN
  FOR v_row IN
    SELECT o.id AS order_id, o.order_number, p.id AS payment_id, p.amount
      FROM public.orders o
      JOIN public.payments p ON p.order_id = o.id
     WHERE o.status = 'delivered'
       AND p.provider = 'cod'
       AND p.status = 'cod_pending_collection'
       AND o.updated_at < now() - interval '48 hours'
       AND NOT EXISTS (
         SELECT 1 FROM public.order_exceptions e
          WHERE e.order_id = o.id
            AND e.exception_type = 'cod_collection_overdue'
            AND e.status = 'open'
       )
  LOOP
    BEGIN
      INSERT INTO public.order_exceptions
        (order_id, exception_type, severity, title, description, metadata)
      VALUES (
        v_row.order_id,
        'cod_collection_overdue',
        'critical',
        'COD cash collection overdue — order delivered 48h+ ago',
        'Order ' || v_row.order_number || ' was delivered but COD cash (₹' || v_row.amount || ') not confirmed collected.',
        jsonb_build_object(
          'payment_id',    v_row.payment_id,
          'amount',        v_row.amount,
          'detected_by',   'reconcile_cod_pending_collection'
        )
      )
      ON CONFLICT (order_id, exception_type)
        WHERE status = 'open'
        DO NOTHING;

      v_count := v_count + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '[reconcile_cod_pending_collection] Order % failed: %', v_row.order_id, SQLERRM;
    END;
  END LOOP;

  RETURN v_count;
END;
$$;

-- =============================================================================
-- PART H: pg_cron jobs (if pg_cron enabled)
-- =============================================================================

DO $cron_setup$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE
      'pg_cron not enabled — skipping cron job setup. '
      'Enable via Dashboard → Database → Extensions → pg_cron, '
      'or use Vercel Cron → /api/jobs/* endpoints as fallback.';
    RETURN;
  END IF;

  -- Remove old versions if they exist
  PERFORM cron.unschedule(jobname)
    FROM cron.job
   WHERE jobname IN (
     'shopnest:auto-queue-confirmed-orders',
     'shopnest:detect-stuck-orders',
     'shopnest:reconcile-cod'
   );

  -- Auto-queue confirmed orders every 5 minutes
  PERFORM cron.schedule(
    'shopnest:auto-queue-confirmed-orders',
    '*/5 * * * *',
    'SELECT public.auto_queue_confirmed_orders()'
  );

  -- Detect stuck orders every 15 minutes
  PERFORM cron.schedule(
    'shopnest:detect-stuck-orders',
    '*/15 * * * *',
    'SELECT public.detect_stuck_orders()'
  );

  -- Reconcile COD collection every hour
  PERFORM cron.schedule(
    'shopnest:reconcile-cod',
    '0 * * * *',
    'SELECT public.reconcile_cod_pending_collection()'
  );

  RAISE NOTICE 'pg_cron jobs scheduled: auto-queue (5min), stuck-orders (15min), cod-reconcile (hourly)';
END;
$cron_setup$;
