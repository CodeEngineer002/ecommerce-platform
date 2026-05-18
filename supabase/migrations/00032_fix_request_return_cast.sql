-- ══════════════════════════════════════════════════════════════════════════════
-- Migration: 00032_fix_request_return_cast
-- Fix: request_return used v_target_status as TEXT when assigning to the
--      orders.status column which is of type public.order_status (enum).
--      This caused: "column 'status' is of type order_status but expression
--      is of type text". Solution: declare v_target_status as public.order_status
--      and cast string literals explicitly.
-- ══════════════════════════════════════════════════════════════════════════════

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
  v_target_status public.order_status;   -- ← was text; now correct enum type
BEGIN
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

  -- Determine order status transition (cast to enum explicitly)
  v_target_status := CASE p_request_type
    WHEN 'replacement' THEN 'replacement_requested'::public.order_status
    ELSE                    'return_requested'::public.order_status
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
    v_target_status::text,
    p_user_id,
    'customer',
    p_request_type || ' request submitted: ' || p_reason,
    jsonb_build_object('return_id', v_return_id, 'request_type', p_request_type)
  );

  RETURN v_return_id;
END;
$$;
