-- ============================================================
-- Migration: 00021_cod_payment_lifecycle
-- Purpose  : Correct COD payment lifecycle
--
-- Problem  : COD payment was incorrectly marked "succeeded" at
--            order creation. Cash has not been collected yet.
--
-- Fix      :
--   1. Add `cod_pending_collection` to payment_status enum
--      (safe — PostgreSQL allows adding enum values)
--   2. Create payment_events table for auditable payment trail
--   3. Function: confirm_cod_cash_collected()
--      - Only callable by service role / admin
--      - Idempotent (safe to retry)
--      - Creates payment_event on success
-- ============================================================

-- ── 1. Extend payment_status enum ────────────────────────────────────────────
-- NOTE: In PostgreSQL you can only ADD values to an enum, never remove them.
-- The new value sits between 'pending' and 'processing' semantically.
ALTER TYPE public.payment_status ADD VALUE IF NOT EXISTS 'cod_pending_collection';

-- ── 2. payment_events table ──────────────────────────────────────────────────
-- Immutable append-only audit log of all payment state transitions.
CREATE TABLE IF NOT EXISTS public.payment_events (
  id             uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id     uuid          NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  order_id       uuid          NOT NULL REFERENCES public.orders(id)   ON DELETE CASCADE,
  event_type     text          NOT NULL,  -- e.g. 'cod_collection_confirmed', 'payment_succeeded', 'payment_cancelled'
  amount         numeric(12,2),           -- amount involved in this event (NULL for non-monetary events)
  actor_id       uuid          REFERENCES auth.users(id),  -- who performed the action
  actor_role     text,                    -- 'admin', 'super_admin', 'system', 'delivery'
  notes          text,
  metadata       jsonb         NOT NULL DEFAULT '{}',
  created_at     timestamptz   NOT NULL DEFAULT now()
);

ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;

-- Admins can view all payment events; customers cannot
CREATE POLICY "Admins view payment events"
  ON public.payment_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
    )
  );

-- Only service role can insert (all inserts go through server-side functions)
CREATE POLICY "Service role manages payment events"
  ON public.payment_events FOR ALL
  USING (auth.role() = 'service_role');

-- Indexes for efficient lookup
CREATE INDEX IF NOT EXISTS idx_payment_events_payment_id ON public.payment_events(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_events_order_id   ON public.payment_events(order_id);
CREATE INDEX IF NOT EXISTS idx_payment_events_created_at ON public.payment_events(created_at DESC);

-- ── 3. confirm_cod_cash_collected() ──────────────────────────────────────────
-- Server-side function: atomically confirms COD cash collection.
--
-- Parameters:
--   p_order_id      — UUID of the order
--   p_amount        — Amount collected (must equal order.total unless partial COD supported)
--   p_actor_id      — Admin/ops user who confirmed the collection
--   p_actor_role    — Role of the actor
--   p_notes         — Optional notes (e.g. "Collected by rider Ravi")
--
-- Returns: payment_id (UUID) on success
-- Raises:
--   P0010 — Order not found
--   P0011 — Order is not a COD order
--   P0012 — COD payment already collected (idempotent — returns existing payment_id)
--   P0013 — Order is not in a deliverable/delivered state
--   P0014 — Amount mismatch
--   P0015 — Payment record not found

CREATE OR REPLACE FUNCTION public.confirm_cod_cash_collected(
  p_order_id   uuid,
  p_amount     numeric,
  p_actor_id   uuid,
  p_actor_role text    DEFAULT 'admin',
  p_notes      text    DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order           record;
  v_payment         record;
  v_payment_event   uuid;
  v_allowed_statuses text[] := ARRAY[
    'out_for_delivery', 'delivered'
  ];
BEGIN
  -- Fetch order
  SELECT id, status, total, user_id
  INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found' USING ERRCODE = 'P0010';
  END IF;

  -- Fetch payment record for this order
  SELECT id, provider, status, amount
  INTO v_payment
  FROM public.payments
  WHERE order_id = p_order_id
    AND provider = 'cod'
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No COD payment record found for this order' USING ERRCODE = 'P0015';
  END IF;

  -- Check it IS a COD order
  IF v_payment.provider != 'cod' THEN
    RAISE EXCEPTION 'Order is not a COD order (provider: %)', v_payment.provider
      USING ERRCODE = 'P0011';
  END IF;

  -- Idempotency: already collected
  IF v_payment.status = 'succeeded' THEN
    RETURN v_payment.id;
  END IF;

  -- Order must be out_for_delivery or delivered
  IF NOT (v_order.status = ANY(v_allowed_statuses)) THEN
    RAISE EXCEPTION 'COD collection not allowed for order in status: %. Order must be out_for_delivery or delivered.',
      v_order.status
      USING ERRCODE = 'P0013';
  END IF;

  -- Amount must match (no partial COD supported)
  IF round(p_amount::numeric, 2) != round(v_order.total::numeric, 2) THEN
    RAISE EXCEPTION 'Amount mismatch: expected %, got %', v_order.total, p_amount
      USING ERRCODE = 'P0014';
  END IF;

  -- Mark payment as succeeded
  UPDATE public.payments
  SET status     = 'succeeded',
      metadata   = metadata || jsonb_build_object(
                     'cod_collected_at',   now(),
                     'cod_collected_by',   p_actor_id,
                     'cod_collected_role', p_actor_role,
                     'cod_amount',         p_amount,
                     'cod_notes',          p_notes
                   ),
      updated_at = now()
  WHERE id = v_payment.id;

  -- Record payment event
  INSERT INTO public.payment_events (
    payment_id, order_id, event_type, amount, actor_id, actor_role, notes, metadata
  ) VALUES (
    v_payment.id,
    p_order_id,
    'cod_collection_confirmed',
    p_amount,
    p_actor_id,
    p_actor_role,
    p_notes,
    jsonb_build_object(
      'previous_status', v_payment.status,
      'new_status',      'succeeded',
      'order_status',    v_order.status
    )
  )
  RETURNING id INTO v_payment_event;

  -- Record in order_status_history for timeline visibility
  INSERT INTO public.order_status_history (
    order_id, changed_by, old_status, new_status, reason
  )
  SELECT
    p_order_id,
    p_actor_id,
    v_order.status,
    v_order.status,  -- order status unchanged, but we want a timeline event
    COALESCE(p_notes, 'COD cash collected — payment confirmed')
  WHERE EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name   = 'order_status_history'
  );

  RETURN v_payment.id;
END;
$$;

-- ── 4. cancel_cod_payment() ──────────────────────────────────────────────────
-- Called when a COD order is cancelled before delivery.
-- Sets payment to 'cancelled' (no cash was collected, no refund needed).

CREATE OR REPLACE FUNCTION public.cancel_cod_payment(
  p_order_id uuid,
  p_actor_id uuid,
  p_reason   text DEFAULT 'Order cancelled before COD collection'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment record;
BEGIN
  SELECT id, provider, status
  INTO v_payment
  FROM public.payments
  WHERE order_id = p_order_id
    AND provider = 'cod'
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  -- Nothing to do if no COD payment or already in terminal state
  IF NOT FOUND THEN RETURN; END IF;
  IF v_payment.status IN ('cancelled', 'refunded', 'succeeded') THEN RETURN; END IF;

  UPDATE public.payments
  SET status     = 'cancelled',
      metadata   = metadata || jsonb_build_object(
                     'cancelled_at',     now(),
                     'cancelled_by',     p_actor_id,
                     'cancel_reason',    p_reason
                   ),
      updated_at = now()
  WHERE id = v_payment.id;

  INSERT INTO public.payment_events (
    payment_id, order_id, event_type, amount, actor_id, actor_role, notes, metadata
  ) VALUES (
    v_payment.id,
    p_order_id,
    'cod_payment_cancelled',
    NULL,
    p_actor_id,
    'admin',
    p_reason,
    jsonb_build_object('previous_status', v_payment.status)
  );
END;
$$;

-- ── 5. Revoke public execute (SECURITY DEFINER functions must not be public) ─
REVOKE EXECUTE ON FUNCTION public.confirm_cod_cash_collected FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cancel_cod_payment FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.confirm_cod_cash_collected TO service_role;
GRANT  EXECUTE ON FUNCTION public.cancel_cod_payment TO service_role;

-- ── 6. Comment ────────────────────────────────────────────────────────────────
COMMENT ON TABLE public.payment_events IS
  'Immutable audit log of payment state transitions. Append-only. Never delete rows.';
COMMENT ON FUNCTION public.confirm_cod_cash_collected IS
  'Atomically confirms COD cash collection. Idempotent. Only callable by service_role.';
COMMENT ON FUNCTION public.cancel_cod_payment IS
  'Cancels a pending COD payment when the order is cancelled before delivery. No refund required.';
