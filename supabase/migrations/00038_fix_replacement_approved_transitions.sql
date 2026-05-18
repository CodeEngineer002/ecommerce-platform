-- ══════════════════════════════════════════════════════════════════════════════
-- Migration: 00038_fix_replacement_approved_transitions
--
-- Purpose:  With the new replacement order architecture (migration 00036),
--           the parent order should stay at 'replacement_approved' once a
--           replacement order is auto-created.  The replacement ORDER itself
--           manages its own shipping lifecycle (confirmed → shipped → delivered).
--
--           Previously, update_order_status() allowed:
--             replacement_approved → replacement_shipped   (WRONG for new flow)
--
--           Now:
--             replacement_approved → delivered             (system auto-close only)
--             replacement_shipped  → replacement_delivered (kept for legacy data)
--
--           The 'replacement_shipped' and 'replacement_delivered' statuses on
--           the PARENT order are deprecated for new orders but remain valid for
--           any existing data created before migration 00036.
-- ══════════════════════════════════════════════════════════════════════════════

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
    -- Payment / creation flow
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
    -- Replacement flow (new architecture: migration 00036+)
    -- Parent order: replacement_requested → replacement_approved → delivered (auto-close)
    -- The parent order no longer manually moves to replacement_shipped.
    -- The replacement ORDER entity (order_type='replacement') manages its own shipping.
    (v_current_status = 'replacement_requested' AND p_new_status IN ('replacement_approved', 'replacement_rejected')) OR
    (v_current_status = 'replacement_approved'  AND p_new_status = 'delivered') OR
    -- Legacy path kept for any parent orders created before migration 00036
    (v_current_status = 'replacement_shipped'   AND p_new_status = 'replacement_delivered') OR
    -- Rejection reverts to delivered (both return and replacement)
    (v_current_status = 'return_rejected'        AND p_new_status = 'delivered') OR
    (v_current_status = 'replacement_rejected'   AND p_new_status = 'delivered') OR
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

  -- ── Apply transition ───────────────────────────────────────────────────────
  UPDATE public.orders
     SET status     = p_new_status,
         updated_at = now()
   WHERE id = p_order_id;

  -- ── Record in status history ───────────────────────────────────────────────
  INSERT INTO public.order_status_history (order_id, from_status, to_status, changed_by, reason)
  VALUES (p_order_id, v_current_status, p_new_status, p_changed_by::uuid, p_reason);
END;
$$;
