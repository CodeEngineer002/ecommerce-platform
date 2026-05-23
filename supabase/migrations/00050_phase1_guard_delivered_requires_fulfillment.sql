-- ============================================================================
-- Migration 00050: Phase 1.3 — Guard 'delivered' transition with fulfillment check
-- ============================================================================
--
-- WHY:
--   Today an admin could click 'Mark Delivered' even on an order that was
--   never shipped (no fulfillment, no tracking, no record). The transition
--   would succeed, commit_inventory_for_order would still decrement stock,
--   and the customer would see "delivered" with empty tracking — silently
--   corrupting the audit trail forever.
--
--   Phase 0 found zero historical incidents of this, but the state machine
--   currently has no protection. This migration adds it.
--
-- GUARD:
--   When p_new_status = 'delivered', require at least one
--   order_fulfillments row for this order with:
--     shipment_type = 'outbound_original'
--     status IN ('shipped','out_for_delivery','delivered')
--
--   Applies to BOTH purchase orders and replacement orders (replacement
--   orders also create outbound_original fulfillments — see migration 00037).
--
--   The legacy parent-order transition replacement_shipped →
--   replacement_delivered is NOT affected (different target status).
--
-- ERROR CODE: P0020 (new — "delivery requires shipment").
--
-- IDEMPOTENCY:
--   CREATE OR REPLACE FUNCTION — safe to re-run. All other logic of
--   update_order_status (state machine + inventory hooks from 00044) is
--   preserved verbatim.
-- ============================================================================

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

  -- ── State machine transition validation (unchanged from 00044) ───────────
  IF NOT (
    (v_current_status = 'draft'              AND p_new_status IN ('pending', 'pending_payment', 'cancelled')) OR
    (v_current_status = 'pending'            AND p_new_status IN ('confirmed', 'pending_payment', 'cancelled')) OR
    (v_current_status = 'pending_payment'    AND p_new_status IN ('confirmed', 'cancelled', 'failed')) OR
    (v_current_status = 'confirmed'          AND p_new_status IN ('processing', 'cancelled')) OR
    (v_current_status = 'processing'         AND p_new_status IN ('packed', 'shipped', 'cancelled')) OR
    (v_current_status = 'packed'             AND p_new_status IN ('shipped', 'cancelled')) OR
    (v_current_status = 'shipped'            AND p_new_status IN ('out_for_delivery', 'delivered', 'cancelled')) OR
    (v_current_status = 'out_for_delivery'   AND p_new_status = 'delivered') OR
    (v_current_status = 'delivered'          AND p_new_status IN (
        'return_requested', 'replacement_requested', 'refund_requested',
        'partially_returned', 'partially_refunded', 'refunded')) OR
    (v_current_status = 'return_requested'   AND p_new_status IN ('return_approved', 'return_rejected')) OR
    (v_current_status = 'return_approved'    AND p_new_status = 'return_in_transit') OR
    (v_current_status = 'return_in_transit'  AND p_new_status = 'returned') OR
    (v_current_status = 'returned'           AND p_new_status IN ('refunded', 'replacement_shipped')) OR
    (v_current_status = 'replacement_requested' AND p_new_status IN ('replacement_approved', 'replacement_rejected')) OR
    (v_current_status = 'replacement_approved'  AND p_new_status = 'delivered') OR
    (v_current_status = 'replacement_shipped'   AND p_new_status = 'replacement_delivered') OR
    (v_current_status = 'return_rejected'        AND p_new_status = 'delivered') OR
    (v_current_status = 'replacement_rejected'   AND p_new_status = 'delivered') OR
    (v_current_status = 'refund_requested'   AND p_new_status = 'refund_processing') OR
    (v_current_status = 'refund_processing'  AND p_new_status IN ('refunded', 'partially_refunded')) OR
    (v_current_status = 'partially_returned' AND p_new_status IN (
        'return_requested', 'replacement_requested', 'refund_requested',
        'refunded', 'partially_refunded')) OR
    (v_current_status = 'partially_refunded' AND p_new_status = 'refunded') OR
    (v_current_status = 'cancelled'          AND p_new_status = 'refunded') OR
    (v_current_status = 'failed'             AND p_new_status = 'pending_payment')
  ) THEN
    RAISE EXCEPTION 'Invalid status transition: % -> %', v_current_status, p_new_status
      USING ERRCODE = 'P0006';
  END IF;

  -- ── NEW (Phase 1.3): require a real shipment before marking delivered ────
  -- This prevents "skip to delivered" admin clicks that corrupt the audit
  -- trail. Applies to both purchase and replacement orders.
  --
  -- Exception: replacement_rejected/return_rejected → delivered are reverts
  -- (an existing delivered order moves back from rejection); the shipment
  -- already exists from the original delivery, so the check still passes.
  IF p_new_status = 'delivered' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.order_fulfillments f
       WHERE f.order_id = p_order_id
         AND f.shipment_type = 'outbound_original'
         AND f.status IN ('shipped', 'out_for_delivery', 'delivered')
    ) THEN
      RAISE EXCEPTION
        'Cannot mark order % as delivered: no outbound shipment found. '
        'Create a fulfillment with a tracking number first.', p_order_id
        USING ERRCODE = 'P0020';
    END IF;
  END IF;

  -- ── Apply transition ─────────────────────────────────────────────────────
  UPDATE public.orders
     SET status     = p_new_status,
         updated_at = now()
   WHERE id = p_order_id;

  -- ── Record in status history ─────────────────────────────────────────────
  INSERT INTO public.order_status_history (order_id, from_status, to_status, changed_by, reason)
  VALUES (p_order_id, v_current_status, p_new_status, p_changed_by::uuid, p_reason);

  -- ── Inventory side-effects (preserved from 00044) ────────────────────────
  IF p_new_status = 'delivered' THEN
    PERFORM public.commit_inventory_for_order(
      p_order_id,
      NULLIF(p_changed_by, '')::uuid
    );
  ELSIF p_new_status IN ('cancelled', 'failed') THEN
    BEGIN
      PERFORM public.release_inventory_reservation(p_order_id);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING
        'update_order_status: inventory release skipped for order % (status → %): %',
        p_order_id, p_new_status, SQLERRM;
    END;
  END IF;
END;
$$;
