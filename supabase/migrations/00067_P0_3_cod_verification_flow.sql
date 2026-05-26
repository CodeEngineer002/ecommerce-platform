-- ============================================================================
-- Migration 00067: P0-3 — COD verification call flow
-- ============================================================================
--
-- PROBLEM:
--   India COD has ~8-15% fake/joke orders. Standard ops practice: call the
--   customer to verify intent BEFORE shipping. Today's auto_queue cron moves
--   `confirmed` → `processing` in 5 min with zero filter, so risky orders
--   ship out unchecked.
--
-- DESIGN:
--   Three new columns on orders:
--     cod_verification_required  — set true at order placement for high-value
--                                  COD orders (above an auto-verify floor).
--     cod_verified_at            — set when admin marks "Verified" (the call).
--     cod_verified_by            — actor uuid (audit).
--
--   Auto-verify threshold: anything ≤ ₹2,000 (IN) skips verification entirely
--   to avoid friction on small orders. Configurable per-country via the TS
--   region-config; this migration uses a sane default.
--
--   auto_queue_confirmed_orders is updated to SKIP COD orders where
--   verification is required but not yet done.
--
--   Admin gets two new actions:
--     - mark_cod_verified(order_id, admin_id, note)  → sets verified_at
--     - mark_cod_verification_failed(order_id, admin_id, reason)
--       → cancels the order (release inventory, no refund needed since no
--          cash collected). Logs the failed-verification reason.
--
-- IDEMPOTENCY:
--   ADD COLUMN IF NOT EXISTS. RPCs are CREATE OR REPLACE.
-- ============================================================================

-- ── 1. Schema columns ───────────────────────────────────────────────────────
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS cod_verification_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cod_verified_at           timestamptz,
  ADD COLUMN IF NOT EXISTS cod_verified_by           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cod_verification_note     text;

-- Index for the admin "Pending Verification" queue
CREATE INDEX IF NOT EXISTS idx_orders_cod_pending_verification
  ON public.orders (created_at)
  WHERE cod_verification_required = true
    AND cod_verified_at IS NULL
    AND status IN ('confirmed', 'pending');

-- ── 2. Backfill existing rows: nothing required (all current orders auto-passed) ──
-- (Skipping — all existing orders predate this feature.)

-- ── 3. Gate auto_queue_confirmed_orders behind verification ─────────────────
-- We only need to UPDATE the SELECT clause inside that function. Pull the
-- existing function body, then rewrite it with the extra AND clause.
-- Body comes from migration 00023 — copy + extend.
CREATE OR REPLACE FUNCTION public.auto_queue_confirmed_orders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_order  RECORD;
  v_count  integer := 0;
  v_track  text;
  v_eta    timestamptz;
BEGIN
  FOR v_order IN
    SELECT id, order_number
      FROM public.orders
     WHERE status = 'confirmed'
       AND updated_at < (now() - INTERVAL '2 minutes')
       -- P0-3 gate: don't auto-queue COD orders that need verification
       AND NOT (
         cod_verification_required = true
         AND cod_verified_at IS NULL
       )
       AND NOT EXISTS (
         SELECT 1 FROM public.order_fulfillments f
          WHERE f.order_id = orders.id
            AND f.status <> 'failed'
       )
     ORDER BY created_at
     LIMIT 100
  LOOP
    BEGIN
      PERFORM public.update_order_status(
        v_order.id, 'processing'::public.order_status,
        NULL, 'Auto-queued for fulfillment by scheduled job', 'scheduled_job'
      );
      v_track := 'TRK-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substring(gen_random_uuid()::text, 1, 6));
      v_eta   := now() + INTERVAL '3 days';

      INSERT INTO public.order_fulfillments (
        order_id, status, shipment_type, tracking_number,
        estimated_delivery, created_at
      ) VALUES (
        v_order.id, 'processing', 'outbound_original',
        v_track, v_eta, now()
      );

      INSERT INTO public.order_events (order_id, event_type, actor_type, description, source, metadata)
      VALUES (v_order.id, 'order_processing', 'system',
              'Order automatically queued for fulfillment',
              'scheduled_job',
              jsonb_build_object('tracking_number', v_track, 'estimated_delivery', v_eta));

      v_count := v_count + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'auto_queue_confirmed_orders: skipped order % — %', v_order.id, SQLERRM;
    END;
  END LOOP;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.auto_queue_confirmed_orders() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auto_queue_confirmed_orders() TO service_role;

-- ── 4. RPCs: admin mark COD verified / failed ───────────────────────────────
CREATE OR REPLACE FUNCTION public.mark_cod_verified(
  p_order_id uuid,
  p_admin_id uuid,
  p_note     text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_required boolean;
  v_already  timestamptz;
BEGIN
  SELECT cod_verification_required, cod_verified_at
    INTO v_required, v_already
    FROM public.orders WHERE id = p_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % not found', p_order_id USING ERRCODE = 'P0005';
  END IF;

  -- Idempotent — if already verified, no-op.
  IF v_already IS NOT NULL THEN
    RETURN;
  END IF;

  UPDATE public.orders
     SET cod_verified_at       = now(),
         cod_verified_by       = p_admin_id,
         cod_verification_note = p_note,
         updated_at            = now()
   WHERE id = p_order_id;

  INSERT INTO public.order_events (
    order_id, event_type, actor_id, actor_type, description, metadata, source
  ) VALUES (
    p_order_id, 'cod_verified', p_admin_id, 'admin',
    'COD order verified by admin (customer confirmed intent)',
    jsonb_build_object('was_required', v_required, 'note', p_note),
    'admin_override'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_cod_verification_failed(
  p_order_id uuid,
  p_admin_id uuid,
  p_reason   text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status public.order_status;
BEGIN
  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'Failure reason is required' USING ERRCODE = 'P0023';
  END IF;

  SELECT status INTO v_status FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % not found', p_order_id USING ERRCODE = 'P0005';
  END IF;

  -- Cancel the order via the standard path so inventory release + COD
  -- payment cancellation happen in one swoop. update_order_status enforces
  -- transition validity (confirmed → cancelled is allowed).
  PERFORM public.update_order_status(
    p_order_id, 'cancelled'::public.order_status,
    p_admin_id::text,
    'COD verification failed: ' || p_reason,
    'admin_override'
  );

  -- Belt-and-braces: cancel any pending COD payment (no-op if already done).
  BEGIN
    PERFORM public.cancel_cod_payment(
      p_order_id := p_order_id,
      p_actor_id := p_admin_id,
      p_reason   := 'COD verification failed: ' || p_reason
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'cancel_cod_payment failed in verification-failed path for %: %', p_order_id, SQLERRM;
  END;

  INSERT INTO public.order_events (
    order_id, event_type, actor_id, actor_type, description, metadata, source
  ) VALUES (
    p_order_id, 'cod_verification_failed', p_admin_id, 'admin',
    'COD verification failed — order cancelled',
    jsonb_build_object('reason', p_reason, 'prev_status', v_status::text),
    'admin_override'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.mark_cod_verified(uuid, uuid, text)             FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_cod_verification_failed(uuid, uuid, text)   FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_cod_verified(uuid, uuid, text)           TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_cod_verification_failed(uuid, uuid, text) TO service_role;
