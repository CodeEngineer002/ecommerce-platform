-- ══════════════════════════════════════════════════════════════════════════════
-- Migration: 00028_returns_replacements_v2
-- Purpose:   Add explicit request_type (return | replacement) to order_returns,
--            add shipment_type + request_id to order_fulfillments, and update
--            the request_return / approve_return / reject_return / create_fulfillment
--            DB functions to handle both flows correctly.
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 1. Add request_type to order_returns ─────────────────────────────────────
ALTER TABLE public.order_returns
  ADD COLUMN IF NOT EXISTS request_type text NOT NULL DEFAULT 'return'
    CHECK (request_type IN ('return', 'replacement'));

-- ── 2. Add shipment_type + request_id to order_fulfillments ──────────────────
ALTER TABLE public.order_fulfillments
  ADD COLUMN IF NOT EXISTS shipment_type text NOT NULL DEFAULT 'outbound_original'
    CHECK (shipment_type IN (
      'outbound_original',
      'return_pickup',
      'replacement_outbound',
      'exchange_pickup',
      'return_to_origin'
    )),
  ADD COLUMN IF NOT EXISTS request_id uuid REFERENCES public.order_returns(id);

-- ── 3. Indexes ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_order_returns_request_type
  ON public.order_returns(order_id, request_type);

CREATE INDEX IF NOT EXISTS idx_fulfillments_shipment_type
  ON public.order_fulfillments(order_id, shipment_type);

CREATE INDEX IF NOT EXISTS idx_fulfillments_request_id
  ON public.order_fulfillments(request_id);


-- ── 4. Update request_return: add p_request_type, branch on it ───────────────
CREATE OR REPLACE FUNCTION public.request_return(
  p_order_id     uuid,
  p_user_id      uuid,
  p_reason       text,
  p_items        jsonb,
  p_request_type text DEFAULT 'return'
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_order         RECORD;
  v_return_id     uuid;
  v_item          jsonb;
  v_delivered_at  timestamptz;
  v_window_days   int  := 30;
  v_target_status text;
BEGIN
  -- Validate request_type
  IF p_request_type NOT IN ('return', 'replacement') THEN
    RAISE EXCEPTION 'Invalid request_type: %. Must be ''return'' or ''replacement''', p_request_type
      USING ERRCODE = 'P0010';
  END IF;

  SELECT id, status, user_id INTO v_order
    FROM public.orders
   WHERE id = p_order_id
     FOR UPDATE;

  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'Order % not found', p_order_id USING ERRCODE = 'P0005';
  END IF;

  IF v_order.user_id != p_user_id THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = 'P0007';
  END IF;

  IF v_order.status NOT IN ('delivered', 'partially_returned') THEN
    RAISE EXCEPTION 'Order must be delivered to submit a request (current: %)', v_order.status
      USING ERRCODE = 'P0008';
  END IF;

  -- Check return window
  SELECT created_at INTO v_delivered_at
    FROM public.order_status_history
   WHERE order_id  = p_order_id
     AND to_status = 'delivered'
   ORDER BY created_at DESC
   LIMIT 1;

  IF v_delivered_at IS NULL THEN
    SELECT updated_at INTO v_delivered_at FROM public.orders WHERE id = p_order_id;
  END IF;

  IF now() > (v_delivered_at + (v_window_days || ' days')::interval) THEN
    RAISE EXCEPTION 'Return window of % days has expired', v_window_days
      USING ERRCODE = 'P0009';
  END IF;

  -- Determine order status transition
  v_target_status := CASE p_request_type
    WHEN 'replacement' THEN 'replacement_requested'
    ELSE                    'return_requested'
  END;

  -- Create request record
  INSERT INTO public.order_returns (order_id, user_id, reason, request_type)
  VALUES (p_order_id, p_user_id, p_reason, p_request_type)
  RETURNING id INTO v_return_id;

  -- Insert return items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    INSERT INTO public.order_return_items (return_id, order_item_id, quantity, reason, condition)
    VALUES (
      v_return_id,
      (v_item->>'order_item_id')::uuid,
      (v_item->>'quantity')::int,
      v_item->>'reason',
      v_item->>'condition'
    );
  END LOOP;

  -- Transition order status
  UPDATE public.orders
     SET status = v_target_status, updated_at = now()
   WHERE id = p_order_id;

  INSERT INTO public.order_status_history (order_id, from_status, to_status, changed_by, reason)
  VALUES (p_order_id, v_order.status, v_target_status, p_user_id, p_reason);

  INSERT INTO public.order_events (order_id, event_type, actor_id, actor_type, description, metadata)
  VALUES (
    p_order_id,
    v_target_status,
    p_user_id,
    'customer',
    p_request_type || ' request submitted: ' || p_reason,
    jsonb_build_object('return_id', v_return_id, 'request_type', p_request_type)
  );

  RETURN v_return_id;
END;
$$;


-- ── 5. Update approve_return: branch on request_type ─────────────────────────
CREATE OR REPLACE FUNCTION public.approve_return(
  p_return_id uuid,
  p_admin_id  uuid,
  p_note      text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_return        RECORD;
  v_target_status text;
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

  -- Branch: replacement → replacement_approved, return → return_approved
  v_target_status := CASE COALESCE(v_return.request_type, 'return')
    WHEN 'replacement' THEN 'replacement_approved'
    ELSE                    'return_approved'
  END;

  UPDATE public.order_returns
     SET status      = 'approved',
         reviewed_by = p_admin_id,
         reviewed_at = now(),
         review_note = p_note,
         updated_at  = now()
   WHERE id = p_return_id;

  PERFORM public.update_order_status(v_return.order_id, v_target_status, p_admin_id, p_note);

  INSERT INTO public.order_events (order_id, event_type, actor_id, actor_type, description, metadata)
  VALUES (
    v_return.order_id,
    v_target_status,
    p_admin_id,
    'admin',
    COALESCE(p_note, v_return.request_type || ' request approved'),
    jsonb_build_object('return_id', p_return_id, 'request_type', v_return.request_type)
  );
END;
$$;


-- ── 6. Update reject_return: branch on request_type ──────────────────────────
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
  v_target_status text;
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

  -- Branch: replacement → replacement_rejected, return → return_rejected
  v_target_status := CASE COALESCE(v_return.request_type, 'return')
    WHEN 'replacement' THEN 'replacement_rejected'
    ELSE                    'return_rejected'
  END;

  UPDATE public.order_returns
     SET status      = 'rejected',
         reviewed_by = p_admin_id,
         reviewed_at = now(),
         review_note = p_reason,
         updated_at  = now()
   WHERE id = p_return_id;

  PERFORM public.update_order_status(v_return.order_id, v_target_status, p_admin_id, p_reason);

  INSERT INTO public.order_events (order_id, event_type, actor_id, actor_type, description, metadata)
  VALUES (
    v_return.order_id,
    v_target_status,
    p_admin_id,
    'admin',
    v_return.request_type || ' request rejected: ' || p_reason,
    jsonb_build_object('return_id', p_return_id, 'request_type', v_return.request_type)
  );
END;
$$;


-- ── 7. Update create_fulfillment: accept shipment_type + request_id ───────────
-- This replaces the original function while preserving all outbound_original
-- behaviour exactly. Return/replacement shipments skip order status advances
-- and fulfillment_items to avoid polluting the original order.
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

  SELECT id, status INTO v_order
    FROM public.orders
   WHERE id = p_order_id
     FOR UPDATE;

  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'Order % not found', p_order_id USING ERRCODE = 'P0005';
  END IF;

  -- State guard: outbound_original requires confirmed / processing / packed
  IF p_shipment_type = 'outbound_original' THEN
    IF v_order.status NOT IN ('confirmed', 'processing', 'packed') THEN
      RAISE EXCEPTION 'Order must be confirmed/processing/packed to create fulfillment (current: %)', v_order.status
        USING ERRCODE = 'P0006';
    END IF;
  END IF;

  -- State guard: return_pickup / exchange_pickup require return_approved or replacement_approved
  IF p_shipment_type IN ('return_pickup', 'exchange_pickup') THEN
    IF v_order.status NOT IN ('return_approved', 'replacement_approved', 'return_in_transit') THEN
      RAISE EXCEPTION 'Order status % does not allow return pickup creation', v_order.status
        USING ERRCODE = 'P0006';
    END IF;
  END IF;

  -- State guard: replacement_outbound requires replacement_approved or returned
  IF p_shipment_type = 'replacement_outbound' THEN
    IF v_order.status NOT IN ('replacement_approved', 'returned') THEN
      RAISE EXCEPTION 'Order status % does not allow replacement outbound creation', v_order.status
        USING ERRCODE = 'P0006';
    END IF;
  END IF;

  -- Insert fulfillment row
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

  -- ── Outbound original: advance order + copy items (original behaviour) ──────
  IF p_shipment_type = 'outbound_original' THEN
    v_new_status := CASE WHEN p_tracking_number IS NOT NULL THEN 'shipped' ELSE 'processing' END;

    INSERT INTO public.fulfillment_items (fulfillment_id, order_item_id, quantity)
    SELECT v_fulfillment_id, id, quantity
      FROM public.order_items
     WHERE order_id = p_order_id;

    IF v_order.status != v_new_status THEN
      UPDATE public.orders
         SET status = v_new_status, updated_at = now()
       WHERE id = p_order_id;

      INSERT INTO public.order_status_history (order_id, from_status, to_status, changed_by, reason)
      VALUES (p_order_id, v_order.status, v_new_status, p_admin_id,
              COALESCE(p_notes, 'Fulfillment created'));
    END IF;
  END IF;

  -- ── Return pickup: advance order to return_in_transit ────────────────────────
  IF p_shipment_type IN ('return_pickup', 'exchange_pickup') AND p_tracking_number IS NOT NULL THEN
    v_new_status := 'return_in_transit';
    IF v_order.status != v_new_status THEN
      UPDATE public.orders
         SET status = v_new_status, updated_at = now()
       WHERE id = p_order_id;

      INSERT INTO public.order_status_history (order_id, from_status, to_status, changed_by, reason)
      VALUES (p_order_id, v_order.status, v_new_status, p_admin_id,
              COALESCE(p_notes, 'Return pickup shipment created'));
    END IF;
  END IF;

  -- ── Replacement outbound: advance order to replacement_shipped ───────────────
  IF p_shipment_type = 'replacement_outbound' AND p_tracking_number IS NOT NULL THEN
    v_new_status := 'replacement_shipped';
    IF v_order.status != v_new_status THEN
      UPDATE public.orders
         SET status = v_new_status, updated_at = now()
       WHERE id = p_order_id;

      INSERT INTO public.order_status_history (order_id, from_status, to_status, changed_by, reason)
      VALUES (p_order_id, v_order.status, v_new_status, p_admin_id,
              COALESCE(p_notes, 'Replacement shipment created'));
    END IF;
  END IF;

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
      'carrier',         p_carrier,
      'tracking_number', p_tracking_number,
      'request_id',      p_request_id
    )
  );

  RETURN v_fulfillment_id;
END;
$$;
