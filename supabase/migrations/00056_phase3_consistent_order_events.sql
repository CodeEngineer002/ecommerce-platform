-- ============================================================================
-- Migration 00056: Phase 3.3 — Consistent order_events emission
-- ============================================================================
--
-- WHY:
--   Today update_order_status writes one row to order_status_history per
--   transition but ONLY writes to order_events selectively (Phase 2 RPCs do,
--   most legacy transitions don't). That leaves the customer-facing /
--   admin-facing timeline with holes — admin sees "this was confirmed at X,
--   then suddenly shipped at Y" with no events in between.
--
--   This migration makes update_order_status ALWAYS emit one order_events row
--   per state transition, with a stable event_type taxonomy
--   (order_<status>).
--
-- TAXONOMY:
--   order_draft, order_pending, order_pending_payment, order_confirmed,
--   order_processing, order_packed, order_shipped, order_out_for_delivery,
--   order_delivered, order_delivery_refused, order_return_to_origin,
--   order_cancelled, order_failed, order_return_*, order_replacement_*,
--   order_refund_*, order_returned, order_refunded, order_partially_*
--
--   In short: `'order_' || p_new_status::text`.
--
-- DEDUP:
--   Phase 2 RPCs (mark_delivery_refused, mark_rto_in_transit, complete_rto)
--   already insert their OWN richer event rows. To avoid duplicates we add
--   a `source` column scoping rule: if a row already exists for this
--   transition recently via the same actor, the auto-insert from
--   update_order_status is a no-op.
--
-- IDEMPOTENCY:
--   CREATE OR REPLACE FUNCTION. Schema additions guarded with IF NOT EXISTS.
-- ============================================================================

-- 1) Ensure order_events has the columns we rely on (most already exist).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='order_events' AND column_name='source'
  ) THEN
    ALTER TABLE public.order_events ADD COLUMN source text;
  END IF;
END $$;

-- 2) Rewrite update_order_status to always emit an order_events row.
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
  v_actor_uuid     uuid := NULLIF(p_changed_by, '')::uuid;
  v_event_type     text;
  v_recent_dup     boolean;
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

  -- State machine (Phase 2.1 set; unchanged here).
  IF NOT (
    (v_current_status = 'draft'              AND p_new_status IN ('pending', 'pending_payment', 'cancelled')) OR
    (v_current_status = 'pending'            AND p_new_status IN ('confirmed', 'pending_payment', 'cancelled')) OR
    (v_current_status = 'pending_payment'    AND p_new_status IN ('confirmed', 'cancelled', 'failed')) OR
    (v_current_status = 'confirmed'          AND p_new_status IN ('processing', 'cancelled')) OR
    (v_current_status = 'processing'         AND p_new_status IN ('packed', 'shipped', 'cancelled')) OR
    (v_current_status = 'packed'             AND p_new_status IN ('shipped', 'cancelled')) OR
    (v_current_status = 'shipped'            AND p_new_status IN ('out_for_delivery', 'delivered', 'cancelled', 'delivery_refused')) OR
    (v_current_status = 'out_for_delivery'   AND p_new_status IN ('delivered', 'delivery_refused')) OR
    (v_current_status = 'delivery_refused'   AND p_new_status IN ('return_to_origin', 'cancelled')) OR
    (v_current_status = 'return_to_origin'   AND p_new_status = 'cancelled') OR
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
  VALUES (p_order_id, v_current_status, p_new_status, v_actor_uuid, p_reason);

  -- ────────────────────────────────────────────────────────────────────
  -- Phase 3.3: ALWAYS emit one order_events row per transition.
  --
  -- Dedup rule: if a caller (e.g. mark_delivery_refused) already inserted
  -- an event of the same type for this order within the last 5 seconds,
  -- skip the auto-insert. That keeps richer caller-side metadata intact
  -- without producing visible duplicates on the timeline.
  -- ────────────────────────────────────────────────────────────────────
  v_event_type := 'order_' || p_new_status::text;

  SELECT EXISTS (
    SELECT 1 FROM public.order_events
     WHERE order_id   = p_order_id
       AND event_type = v_event_type
       AND created_at > now() - INTERVAL '5 seconds'
  ) INTO v_recent_dup;

  IF NOT v_recent_dup THEN
    INSERT INTO public.order_events (
      order_id, event_type, actor_id, actor_type, description, metadata, source
    ) VALUES (
      p_order_id,
      v_event_type,
      v_actor_uuid,
      CASE
        WHEN v_source IN ('admin_override','admin') THEN 'admin'
        WHEN v_source = 'customer_action'           THEN 'customer'
        ELSE 'system'
      END,
      'Order ' || p_new_status::text,
      jsonb_build_object(
        'from_status', v_current_status::text,
        'to_status',   p_new_status::text,
        'reason',      p_reason
      ),
      v_source
    );
  END IF;

  -- Inventory hooks (preserved from 00044 / 00051 idempotency).
  IF p_new_status = 'delivered' THEN
    PERFORM public.commit_inventory_for_order(p_order_id, v_actor_uuid);
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
