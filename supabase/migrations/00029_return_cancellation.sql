-- ══════════════════════════════════════════════════════════════════════════════
-- Migration: 00029_return_cancellation
-- Purpose:   Add 'cancelled' as a valid return request status, and implement
--            the cancel_return DB function (customer-owned, pre-approval only).
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 1. Widen the order_returns.status CHECK to include 'cancelled' ────────────
ALTER TABLE public.order_returns
  DROP CONSTRAINT IF EXISTS order_returns_status_check;

ALTER TABLE public.order_returns
  ADD CONSTRAINT order_returns_status_check
    CHECK (status IN (
      'requested',
      'approved',
      'rejected',
      'cancelled',
      'pickup_scheduled',
      'in_transit',
      'received',
      'inspected',
      'accepted',
      'rejected_after_inspection',
      'refunded',
      'replaced',
      'closed'
    ));

-- ── 2. cancel_return function (customer-callable) ─────────────────────────────
CREATE OR REPLACE FUNCTION public.cancel_return(
  p_return_id uuid,
  p_user_id   uuid,
  p_reason    text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_return RECORD;
BEGIN
  SELECT id, order_id, user_id, status INTO v_return
    FROM public.order_returns
   WHERE id = p_return_id
     FOR UPDATE;

  IF v_return.id IS NULL THEN
    RAISE EXCEPTION 'Return request % not found', p_return_id USING ERRCODE = 'P0005';
  END IF;

  -- Only the request owner can cancel
  IF v_return.user_id != p_user_id THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = 'P0007';
  END IF;

  -- Only cancellable from 'requested' (before admin has acted)
  IF v_return.status != 'requested' THEN
    RAISE EXCEPTION 'Return request cannot be cancelled in state: %', v_return.status
      USING ERRCODE = 'P0012';
  END IF;

  -- Mark the return request as cancelled
  UPDATE public.order_returns
     SET status     = 'cancelled',
         updated_at = now()
   WHERE id = p_return_id;

  -- Revert order status to 'delivered' (it was bumped to return_requested or replacement_requested)
  UPDATE public.orders
     SET status     = 'delivered',
         updated_at = now()
   WHERE id   = v_return.order_id
     AND status IN ('return_requested', 'replacement_requested');

  -- Record in status history only if we actually reverted the order
  IF FOUND THEN
    INSERT INTO public.order_status_history (order_id, from_status, to_status, changed_by, reason)
    VALUES (
      v_return.order_id,
      (SELECT to_status FROM public.order_status_history
        WHERE order_id = v_return.order_id
        ORDER BY created_at DESC LIMIT 1),
      'delivered',
      p_user_id,
      COALESCE(p_reason, 'Return/replacement request cancelled by customer')
    );
  END IF;

  -- Log the cancellation event
  INSERT INTO public.order_events (order_id, event_type, actor_id, actor_type, description, metadata)
  VALUES (
    v_return.order_id,
    'return_cancelled',
    p_user_id,
    'customer',
    COALESCE(p_reason, 'Return/replacement request cancelled by customer'),
    jsonb_build_object('return_id', p_return_id, 'reason', p_reason)
  );
END;
$$;
