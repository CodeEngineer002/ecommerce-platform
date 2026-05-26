-- ============================================================================
-- Migration 00068: P0-4 — COD refund payout tracking
-- ============================================================================
--
-- PROBLEM:
--   When a COD order is refunded, customer needs the money back. Today the
--   refund row just records `status='succeeded'` immediately — but there's
--   no field for HOW the cash was paid out (UPI? bank transfer? cash in
--   person? store credit?) and no audit trail of when ops actually moved
--   the money.
--
-- DESIGN:
--   Three new columns on refunds:
--     payout_method        text   CHECK ∈ {upi, bank_transfer, cash, store_credit, gateway, pending}
--     payout_reference     text   — UPI txn id, bank ref, cash voucher #
--     payout_completed_at  timestamptz — when payout actually moved
--
--   Behavioural change in record_refund():
--     - For COD provider, the refund row is inserted with status='pending'
--       and payout_method='pending'. The customer still SEES the refund
--       initiated (order goes to refunded/partially_refunded).
--     - Admin completes payout via mark_cod_refund_paid() which sets the
--       three new columns and (only then) leaves status='succeeded'.
--
--   For non-COD (Stripe/Razorpay), behaviour unchanged — gateway succeeds
--   first, record_refund inserts with status='succeeded' and
--   payout_method='gateway'.
--
-- IDEMPOTENCY:
--   ADD COLUMN IF NOT EXISTS. RPCs use CREATE OR REPLACE.
-- ============================================================================

-- ── 1. Schema ────────────────────────────────────────────────────────────────
ALTER TABLE public.refunds
  ADD COLUMN IF NOT EXISTS payout_method       text,
  ADD COLUMN IF NOT EXISTS payout_reference    text,
  ADD COLUMN IF NOT EXISTS payout_completed_at timestamptz;

-- Drop the constraint if it exists (idempotent re-runs), then re-add
ALTER TABLE public.refunds
  DROP CONSTRAINT IF EXISTS chk_refund_payout_method;
ALTER TABLE public.refunds
  ADD CONSTRAINT chk_refund_payout_method
  CHECK (payout_method IS NULL OR payout_method IN
    ('upi', 'bank_transfer', 'cash', 'store_credit', 'gateway', 'pending'));

-- Backfill any existing refund rows: assume gateway (the system before this
-- change only created succeeded refunds via the gateway path).
UPDATE public.refunds
   SET payout_method        = COALESCE(payout_method, 'gateway'),
       payout_completed_at  = COALESCE(payout_completed_at, processed_at, created_at)
 WHERE payout_method IS NULL;

-- ── 2. Override record_refund — COD refunds start pending ───────────────────
CREATE OR REPLACE FUNCTION public.record_refund(
  p_order_id           uuid,
  p_payment_id         uuid,
  p_amount             numeric,
  p_refund_type        text,
  p_admin_id           uuid,
  p_reason             text        DEFAULT NULL,
  p_return_id          uuid        DEFAULT NULL,
  p_provider_refund_id text        DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_order      RECORD;
  v_payment    RECORD;
  v_refunded   numeric;
  v_refund_id  uuid;
  v_new_status public.order_status;
  v_is_cod     boolean;
  v_initial_status text;
  v_payout_method  text;
  v_payout_done    timestamptz;
BEGIN
  SELECT id, status, total INTO v_order
    FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'Order % not found', p_order_id USING ERRCODE = 'P0005';
  END IF;

  SELECT provider INTO v_payment FROM public.payments WHERE id = p_payment_id;
  v_is_cod := v_payment.provider = 'cod';

  SELECT COALESCE(SUM(amount), 0) INTO v_refunded
    FROM public.refunds
   WHERE order_id = p_order_id AND status IN ('succeeded', 'pending');

  IF v_refunded + p_amount > v_order.total THEN
    RAISE EXCEPTION 'Refund amount % exceeds remaining refundable amount %',
      p_amount, (v_order.total - v_refunded)
      USING ERRCODE = 'P0010';
  END IF;

  -- COD refunds start pending — admin must record the payout separately.
  -- Non-COD refunds (Stripe/Razorpay) already cleared the gateway so they
  -- mark succeeded immediately.
  IF v_is_cod THEN
    v_initial_status := 'pending';
    v_payout_method  := 'pending';
    v_payout_done    := NULL;
  ELSE
    v_initial_status := 'succeeded';
    v_payout_method  := 'gateway';
    v_payout_done    := now();
  END IF;

  INSERT INTO public.refunds (
    order_id, return_id, payment_id, amount, refund_type,
    status, reason, provider_refund_id, processed_by, processed_at,
    payout_method, payout_reference, payout_completed_at
  ) VALUES (
    p_order_id, p_return_id, p_payment_id, p_amount, p_refund_type,
    v_initial_status, p_reason, p_provider_refund_id, p_admin_id, now(),
    v_payout_method, NULL, v_payout_done
  ) RETURNING id INTO v_refund_id;

  -- Order status transitions: even for pending COD refunds, the order moves
  -- to refunded/partially_refunded so the customer sees their refund as
  -- initiated. The actual cash hand-off is tracked on the refund row.
  IF (v_refunded + p_amount) >= v_order.total THEN
    v_new_status := 'refunded';
  ELSE
    v_new_status := 'partially_refunded';
  END IF;

  UPDATE public.orders
     SET status     = v_new_status,
         updated_at = now()
   WHERE id = p_order_id;

  INSERT INTO public.order_status_history (order_id, from_status, to_status, changed_by, reason)
  VALUES (p_order_id, v_order.status, v_new_status, p_admin_id,
          COALESCE(p_reason, 'Refund issued'));

  INSERT INTO public.order_events (
    order_id, event_type, actor_id, actor_type, description, metadata, source
  ) VALUES (
    p_order_id, 'refund_issued', p_admin_id, 'admin',
    CASE WHEN v_is_cod
         THEN 'COD refund initiated — awaiting payout'
         ELSE 'Refund processed via gateway' END,
    jsonb_build_object('refund_id', v_refund_id, 'amount', p_amount,
                       'provider', v_payment.provider, 'is_cod', v_is_cod),
    'admin'
  );

  RETURN v_refund_id;
END;
$$;

-- ── 3. New RPC: mark_cod_refund_paid ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mark_cod_refund_paid(
  p_refund_id    uuid,
  p_admin_id     uuid,
  p_payout_method text,
  p_reference    text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_refund RECORD;
BEGIN
  IF p_payout_method NOT IN ('upi', 'bank_transfer', 'cash', 'store_credit') THEN
    RAISE EXCEPTION 'Invalid payout_method %; must be upi|bank_transfer|cash|store_credit',
      p_payout_method USING ERRCODE = 'P0040';
  END IF;

  SELECT id, status, order_id, amount, payout_method INTO v_refund
    FROM public.refunds WHERE id = p_refund_id FOR UPDATE;

  IF v_refund.id IS NULL THEN
    RAISE EXCEPTION 'Refund % not found', p_refund_id USING ERRCODE = 'P0005';
  END IF;

  -- Idempotency: already paid
  IF v_refund.status = 'succeeded' AND v_refund.payout_method <> 'pending' THEN
    RETURN;
  END IF;

  IF v_refund.status NOT IN ('pending', 'processing') THEN
    RAISE EXCEPTION 'Refund % cannot be marked paid from status %', p_refund_id, v_refund.status
      USING ERRCODE = 'P0006';
  END IF;

  UPDATE public.refunds
     SET status              = 'succeeded',
         payout_method       = p_payout_method,
         payout_reference    = p_reference,
         payout_completed_at = now(),
         updated_at          = now()
   WHERE id = p_refund_id;

  INSERT INTO public.order_events (
    order_id, event_type, actor_id, actor_type, description, metadata, source
  ) VALUES (
    v_refund.order_id, 'refund_payout_completed', p_admin_id, 'admin',
    'COD refund payout completed via ' || p_payout_method,
    jsonb_build_object(
      'refund_id', p_refund_id,
      'amount', v_refund.amount,
      'payout_method', p_payout_method,
      'reference', p_reference
    ),
    'admin'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.mark_cod_refund_paid(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_cod_refund_paid(uuid, uuid, text, text) TO service_role;
