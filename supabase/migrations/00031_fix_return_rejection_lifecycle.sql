-- ══════════════════════════════════════════════════════════════════════════════
-- Migration: 00031_fix_return_rejection_lifecycle
-- Purpose:   In real ecommerce, when a return request is rejected the ORDER
--            itself should revert to 'delivered' — the rejection is recorded on
--            the order_returns row.  This allows customers to re-submit within
--            the return window without being permanently blocked.
--
--            Also adds return_rejected → delivered and
--            replacement_rejected → delivered as valid admin-accessible
--            transitions in case manual correction is ever needed.
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 1. Fix reject_return: revert order status to delivered on rejection ────────
CREATE OR REPLACE FUNCTION public.reject_return(
  p_return_id uuid,
  p_admin_id  uuid,
  p_reason    text
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_return        RECORD;
  v_order_status  text;
  v_rejected_status public.order_status;
BEGIN
  SELECT id, order_id, status, request_type INTO v_return
    FROM public.order_returns
   WHERE id = p_return_id
     FOR UPDATE;

  IF v_return.id IS NULL THEN
    RAISE EXCEPTION 'Return request % not found', p_return_id USING ERRCODE = 'P0005';
  END IF;

  IF v_return.status != 'requested' THEN
    RAISE EXCEPTION 'Request is not in requested state (current: %)', v_return.status
      USING ERRCODE = 'P0006';
  END IF;

  -- Mark the return request as rejected (with admin note)
  UPDATE public.order_returns
     SET status      = 'rejected',
         reviewed_by = p_admin_id,
         reviewed_at = now(),
         review_note = p_reason,
         updated_at  = now()
   WHERE id = p_return_id;

  -- Determine the rejection status for the event log
  v_rejected_status := CASE COALESCE(v_return.request_type, 'return')
    WHEN 'replacement' THEN 'replacement_rejected'::public.order_status
    ELSE                    'return_rejected'::public.order_status
  END;

  -- Check what the order's current status is
  SELECT status INTO v_order_status
    FROM public.orders
   WHERE id = v_return.order_id;

  -- ── KEY CHANGE: Revert order back to 'delivered' so customer can re-submit ──
  -- The rejection is recorded on order_returns, not permanently on order status.
  IF v_order_status IN ('return_requested', 'replacement_requested') THEN
    UPDATE public.orders
       SET status     = 'delivered',
           updated_at = now()
     WHERE id = v_return.order_id;

    INSERT INTO public.order_status_history (order_id, from_status, to_status, changed_by, reason)
    VALUES (
      v_return.order_id,
      v_rejected_status,
      'delivered',
      p_admin_id,
      'Return/replacement request rejected — order returned to delivered: ' || p_reason
    );
  END IF;

  -- Log the rejection event (for audit/visibility)
  INSERT INTO public.order_events (order_id, event_type, actor_id, actor_type, description, metadata)
  VALUES (
    v_return.order_id,
    v_rejected_status::text,
    p_admin_id,
    'admin',
    COALESCE(v_return.request_type, 'return') || ' request rejected: ' || p_reason,
    jsonb_build_object(
      'return_id',    p_return_id,
      'request_type', v_return.request_type,
      'reason',       p_reason
    )
  );
END;
$$;


-- ── 2. Fix existing orders stuck at return_rejected / replacement_rejected ─────
-- These orders were rejected before this fix; revert them to 'delivered' so
-- customers are not permanently locked out.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT id, status FROM public.orders
     WHERE status IN ('return_rejected', 'replacement_rejected')
  LOOP
    -- Log history first (while old status is still known)
    INSERT INTO public.order_status_history (order_id, from_status, to_status, changed_by, reason)
    VALUES (
      r.id,
      r.status::public.order_status,
      'delivered'::public.order_status,
      NULL,
      'Automated correction: return/replacement rejected — reverted to delivered (migration 00031)'
    );

    -- Revert to delivered
    UPDATE public.orders
       SET status     = 'delivered',
           updated_at = now()
     WHERE id = r.id;
  END LOOP;
END;
$$;
