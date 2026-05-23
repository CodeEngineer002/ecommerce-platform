-- ============================================================================
-- Migration 00053: Phase 2.1 — State machine + RPCs for refusal/RTO
-- ============================================================================
-- Companion to 00052 (which added the enum values). Postgres requires enum
-- additions to be committed in a separate transaction before they can be
-- referenced.
-- ============================================================================

-- ── 1. Extend the state machine in update_order_status ──────────────────────
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
  SELECT status INTO v_current_status
    FROM public.orders
   WHERE id = p_order_id
     FOR UPDATE;

  IF v_current_status IS NULL THEN
    RAISE EXCEPTION 'Order % not found', p_order_id USING ERRCODE = 'P0005';
  END IF;

  IF v_current_status = p_new_status THEN
    RETURN;
  END IF;

  -- State machine — appended refusal/RTO transitions (Phase 2.1).
  IF NOT (
    (v_current_status = 'draft'              AND p_new_status IN ('pending', 'pending_payment', 'cancelled')) OR
    (v_current_status = 'pending'            AND p_new_status IN ('confirmed', 'pending_payment', 'cancelled')) OR
    (v_current_status = 'pending_payment'    AND p_new_status IN ('confirmed', 'cancelled', 'failed')) OR
    (v_current_status = 'confirmed'          AND p_new_status IN ('processing', 'cancelled')) OR
    (v_current_status = 'processing'         AND p_new_status IN ('packed', 'shipped', 'cancelled')) OR
    (v_current_status = 'packed'             AND p_new_status IN ('shipped', 'cancelled')) OR
    -- shipped/OFD can be refused (NEW in Phase 2.1)
    (v_current_status = 'shipped'            AND p_new_status IN ('out_for_delivery', 'delivered', 'cancelled', 'delivery_refused')) OR
    (v_current_status = 'out_for_delivery'   AND p_new_status IN ('delivered', 'delivery_refused')) OR
    -- delivery_refused → RTO tracking OR direct cancel
    (v_current_status = 'delivery_refused'   AND p_new_status IN ('return_to_origin', 'cancelled')) OR
    (v_current_status = 'return_to_origin'   AND p_new_status = 'cancelled') OR
    -- Post-delivery
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

  -- Phase 1.3 guard: delivered requires a real outbound shipment.
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

  UPDATE public.orders
     SET status     = p_new_status,
         updated_at = now()
   WHERE id = p_order_id;

  INSERT INTO public.order_status_history (order_id, from_status, to_status, changed_by, reason)
  VALUES (p_order_id, v_current_status, p_new_status, p_changed_by::uuid, p_reason);

  -- Inventory hooks (preserved from 00044 + 00051 idempotency).
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

-- ── 2. RPC: mark_delivery_refused ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mark_delivery_refused(
  p_order_id uuid,
  p_actor_id uuid,
  p_reason   text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current public.order_status;
  v_order_type text;
BEGIN
  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'Refusal reason is required'
      USING ERRCODE = 'P0023';
  END IF;

  SELECT status, COALESCE(order_type, 'purchase') INTO v_current, v_order_type
    FROM public.orders WHERE id = p_order_id;

  IF v_current IS NULL THEN
    RAISE EXCEPTION 'Order % not found', p_order_id USING ERRCODE = 'P0005';
  END IF;

  -- Idempotent: if already refused, no-op.
  IF v_current = 'delivery_refused' THEN
    RETURN;
  END IF;

  IF v_current NOT IN ('shipped','out_for_delivery') THEN
    RAISE EXCEPTION
      'Cannot mark refusal from status %; allowed only from shipped or out_for_delivery',
      v_current
      USING ERRCODE = 'P0006';
  END IF;

  PERFORM public.update_order_status(
    p_order_id := p_order_id,
    p_new_status := 'delivery_refused'::public.order_status,
    p_changed_by := p_actor_id::text,
    p_reason     := 'Delivery refused: ' || p_reason,
    p_source     := 'admin_override'
  );

  INSERT INTO public.order_events (
    order_id, event_type, actor_id, actor_type, description, metadata, source
  ) VALUES (
    p_order_id, 'delivery_refused', p_actor_id, 'admin',
    'Customer refused delivery',
    jsonb_build_object('reason', p_reason, 'order_type', v_order_type),
    'admin_override'
  );
END;
$$;

-- ── 3. RPC: mark_rto_in_transit ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mark_rto_in_transit(
  p_order_id uuid,
  p_actor_id uuid,
  p_note     text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current public.order_status;
BEGIN
  SELECT status INTO v_current FROM public.orders WHERE id = p_order_id;

  IF v_current IS NULL THEN
    RAISE EXCEPTION 'Order % not found', p_order_id USING ERRCODE = 'P0005';
  END IF;

  IF v_current = 'return_to_origin' THEN
    RETURN;
  END IF;

  IF v_current <> 'delivery_refused' THEN
    RAISE EXCEPTION
      'Cannot mark RTO in-transit from status %; allowed only from delivery_refused',
      v_current
      USING ERRCODE = 'P0006';
  END IF;

  PERFORM public.update_order_status(
    p_order_id := p_order_id,
    p_new_status := 'return_to_origin'::public.order_status,
    p_changed_by := p_actor_id::text,
    p_reason     := COALESCE(p_note, 'Package in return-to-origin transit'),
    p_source     := 'admin_override'
  );

  INSERT INTO public.order_events (
    order_id, event_type, actor_id, actor_type, description, metadata, source
  ) VALUES (
    p_order_id, 'rto_in_transit', p_actor_id, 'admin',
    'Refused package in return-to-origin transit',
    jsonb_build_object('note', p_note),
    'admin_override'
  );
END;
$$;

-- ── 4. RPC: complete_rto — terminal cancel with inventory release ──────────
CREATE OR REPLACE FUNCTION public.complete_rto(
  p_order_id uuid,
  p_actor_id uuid,
  p_notes    text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current public.order_status;
BEGIN
  SELECT status INTO v_current FROM public.orders WHERE id = p_order_id;

  IF v_current IS NULL THEN
    RAISE EXCEPTION 'Order % not found', p_order_id USING ERRCODE = 'P0005';
  END IF;

  IF v_current = 'cancelled' THEN
    RETURN;
  END IF;

  IF v_current NOT IN ('delivery_refused','return_to_origin') THEN
    RAISE EXCEPTION
      'Cannot complete RTO from status %; allowed only from delivery_refused or return_to_origin',
      v_current
      USING ERRCODE = 'P0006';
  END IF;

  -- The cancel transition triggers release_inventory_reservation via the
  -- update_order_status inventory hook (00044). No restock movement is
  -- needed because commit_inventory_for_order was never called (the order
  -- never delivered).
  PERFORM public.update_order_status(
    p_order_id := p_order_id,
    p_new_status := 'cancelled'::public.order_status,
    p_changed_by := p_actor_id::text,
    p_reason     := COALESCE(p_notes, 'RTO completed: package returned to warehouse'),
    p_source     := 'admin_override'
  );

  -- Cancel any pending COD payment alongside (no cash was ever collected).
  BEGIN
    PERFORM public.cancel_cod_payment(
      p_order_id := p_order_id,
      p_actor_id := p_actor_id,
      p_reason   := COALESCE(p_notes, 'RTO completed — COD never collected')
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'complete_rto: cancel_cod_payment failed for order %: %', p_order_id, SQLERRM;
  END;

  INSERT INTO public.order_events (
    order_id, event_type, actor_id, actor_type, description, metadata, source
  ) VALUES (
    p_order_id, 'rto_completed', p_actor_id, 'admin',
    'RTO completed — order cancelled, inventory released',
    jsonb_build_object('notes', p_notes),
    'admin_override'
  );
END;
$$;

-- ── 5. Grants — service_role only (admin API uses service client) ──────────
REVOKE ALL ON FUNCTION public.mark_delivery_refused(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_rto_in_transit(uuid, uuid, text)    FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_rto(uuid, uuid, text)            FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_delivery_refused(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_rto_in_transit(uuid, uuid, text)    TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_rto(uuid, uuid, text)            TO service_role;
