-- ══════════════════════════════════════════════════════════════════════════════
-- Migration: 00037_replacement_fulfillment_fix
--
-- Purpose:  Update create_fulfillment so that when it is called on a
--           replacement order (order_type = 'replacement') with
--           shipment_type = 'outbound_original', it behaves like a normal
--           outbound shipment — copying items, updating status — without
--           the legacy state-guard that previously blocked non-
--           confirmed/processing/packed orders.
--
--           Previously, replacement outbound shipping was done by calling
--           create_fulfillment with shipment_type='replacement_outbound' on
--           the PARENT order.  The new model calls create_fulfillment with
--           shipment_type='outbound_original' on the REPLACEMENT ORDER itself.
--
-- Changes:
--   - Detects order_type from the orders row.
--   - For replacement orders the 'outbound_original' state guard allows
--     'confirmed' | 'processing' | 'packed' (replacement orders start at
--     'confirmed' and follow the same status progression).
--   - Inventory reservation is released on delivered for replacement orders
--     via update_order_status (same trigger as purchase orders on cancellation).
--   - The legacy 'replacement_outbound' shipment type path is kept intact for
--     any pre-migration data but is no longer used by the new flow.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.create_fulfillment(
  p_order_id            uuid,
  p_admin_id            uuid,
  p_carrier             text        DEFAULT NULL,
  p_tracking_number     text        DEFAULT NULL,
  p_tracking_url        text        DEFAULT NULL,
  p_estimated_delivery  timestamptz DEFAULT NULL,
  p_notes               text        DEFAULT NULL,
  p_shipment_type       text        DEFAULT 'outbound_original',
  p_request_id          uuid        DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_order          RECORD;
  v_fulfillment_id uuid;
  v_new_status     text;
BEGIN
  IF p_shipment_type NOT IN (
    'outbound_original', 'return_pickup', 'replacement_outbound',
    'exchange_pickup', 'return_to_origin'
  ) THEN
    RAISE EXCEPTION 'Invalid shipment_type: %', p_shipment_type USING ERRCODE = 'P0011';
  END IF;

  SELECT id, status, order_type INTO v_order
    FROM public.orders
   WHERE id = p_order_id
     FOR UPDATE;

  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'Order % not found', p_order_id USING ERRCODE = 'P0005';
  END IF;

  -- ── State guards ──────────────────────────────────────────────────────────

  -- outbound_original: purchase orders need confirmed/processing/packed;
  -- replacement orders also start at 'confirmed' → same guard applies
  IF p_shipment_type = 'outbound_original' THEN
    IF v_order.status NOT IN ('confirmed', 'processing', 'packed') THEN
      RAISE EXCEPTION 'Order must be confirmed/processing/packed to create fulfillment (current: %)', v_order.status
        USING ERRCODE = 'P0006';
    END IF;
  END IF;

  -- return_pickup / exchange_pickup require return_approved or replacement_approved
  IF p_shipment_type IN ('return_pickup', 'exchange_pickup') THEN
    IF v_order.status NOT IN ('return_approved', 'replacement_approved', 'return_in_transit') THEN
      RAISE EXCEPTION 'Order status % does not allow return pickup creation', v_order.status
        USING ERRCODE = 'P0006';
    END IF;
  END IF;

  -- replacement_outbound (legacy path) requires replacement_approved or returned
  IF p_shipment_type = 'replacement_outbound' THEN
    IF v_order.status NOT IN ('replacement_approved', 'returned') THEN
      RAISE EXCEPTION 'Order status % does not allow replacement outbound creation', v_order.status
        USING ERRCODE = 'P0006';
    END IF;
  END IF;

  -- ── Insert fulfillment row ────────────────────────────────────────────────

  INSERT INTO public.order_fulfillments (
    order_id, status, carrier, tracking_number, tracking_url,
    estimated_delivery, notes, shipped_at, created_by,
    shipment_type, request_id
  ) VALUES (
    p_order_id,
    CASE WHEN p_tracking_number IS NOT NULL THEN 'shipped' ELSE 'processing' END,
    p_carrier, p_tracking_number, p_tracking_url,
    p_estimated_delivery, p_notes,
    CASE WHEN p_tracking_number IS NOT NULL THEN now() ELSE NULL END,
    p_admin_id,
    p_shipment_type,
    p_request_id
  ) RETURNING id INTO v_fulfillment_id;

  -- ── outbound_original: copy items + advance order status ─────────────────
  -- Applies to both purchase orders AND replacement orders
  IF p_shipment_type = 'outbound_original' THEN
    v_new_status := CASE WHEN p_tracking_number IS NOT NULL THEN 'shipped' ELSE 'processing' END;

    INSERT INTO public.fulfillment_items (fulfillment_id, order_item_id, quantity)
    SELECT v_fulfillment_id, id, quantity
      FROM public.order_items
     WHERE order_id = p_order_id;

    IF v_order.status::text != v_new_status THEN
      UPDATE public.orders
         SET status = v_new_status, updated_at = now()
       WHERE id = p_order_id;

      INSERT INTO public.order_status_history (order_id, from_status, to_status, changed_by, reason)
      VALUES (p_order_id, v_order.status, v_new_status::public.order_status, p_admin_id,
              COALESCE(p_notes, 'Fulfillment created'));
    END IF;
  END IF;

  -- ── return_pickup: advance parent order to return_in_transit ─────────────
  IF p_shipment_type IN ('return_pickup', 'exchange_pickup') AND p_tracking_number IS NOT NULL THEN
    v_new_status := 'return_in_transit';
    IF v_order.status::text != v_new_status THEN
      UPDATE public.orders
         SET status = v_new_status, updated_at = now()
       WHERE id = p_order_id;

      INSERT INTO public.order_status_history (order_id, from_status, to_status, changed_by, reason)
      VALUES (p_order_id, v_order.status, v_new_status::public.order_status, p_admin_id,
              COALESCE(p_notes, 'Return pickup shipment created'));
    END IF;
  END IF;

  -- ── replacement_outbound (legacy): advance parent order to replacement_shipped
  IF p_shipment_type = 'replacement_outbound' AND p_tracking_number IS NOT NULL THEN
    v_new_status := 'replacement_shipped';
    IF v_order.status::text != v_new_status THEN
      UPDATE public.orders
         SET status = v_new_status, updated_at = now()
       WHERE id = p_order_id;

      INSERT INTO public.order_status_history (order_id, from_status, to_status, changed_by, reason)
      VALUES (p_order_id, v_order.status, v_new_status::public.order_status, p_admin_id,
              COALESCE(p_notes, 'Replacement shipment created'));
    END IF;
  END IF;

  -- ── Audit event ───────────────────────────────────────────────────────────
  INSERT INTO public.order_events (order_id, event_type, actor_id, actor_type, description, metadata)
  VALUES (
    p_order_id,
    'fulfillment_created',
    p_admin_id,
    'admin',
    'Fulfillment created (' || p_shipment_type || ')' ||
      CASE WHEN p_carrier IS NOT NULL THEN ' via ' || p_carrier ELSE '' END,
    jsonb_build_object(
      'fulfillment_id',  v_fulfillment_id,
      'shipment_type',   p_shipment_type,
      'order_type',      v_order.order_type,
      'carrier',         p_carrier,
      'tracking_number', p_tracking_number,
      'request_id',      p_request_id
    )
  );

  RETURN v_fulfillment_id;
END;
$$;
