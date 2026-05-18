-- ══════════════════════════════════════════════════════════════════════════════
-- Migration: 00033_fix_cod_cash_collection_cast
-- Fix: confirm_cod_cash_collected declared v_allowed_statuses as text[] but
--      orders.status is public.order_status (enum).
--      PostgreSQL cannot compare order_status = text without an explicit cast.
--      Solution: change v_allowed_statuses to public.order_status[] and cast
--      the literal strings to the enum type.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.confirm_cod_cash_collected(
  p_order_id   uuid,
  p_amount     numeric,
  p_actor_id   uuid,
  p_actor_role text    DEFAULT 'admin',
  p_notes      text    DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order           record;
  v_payment         record;
  v_payment_event   uuid;
  v_allowed_statuses public.order_status[] := ARRAY[   -- ← was text[]; now correct enum array
    'out_for_delivery'::public.order_status,
    'delivered'::public.order_status
  ];
BEGIN
  SELECT id, status, total, user_id
  INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found' USING ERRCODE = 'P0010';
  END IF;

  SELECT id, provider, status, amount
  INTO v_payment
  FROM public.payments
  WHERE order_id = p_order_id
    AND provider = 'cod'
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No COD payment record found for this order' USING ERRCODE = 'P0015';
  END IF;

  IF v_payment.provider != 'cod' THEN
    RAISE EXCEPTION 'Order is not a COD order (provider: %)', v_payment.provider
      USING ERRCODE = 'P0011';
  END IF;

  -- Idempotency: already collected
  IF v_payment.status = 'succeeded' THEN
    RETURN v_payment.id;
  END IF;

  -- Order must be out_for_delivery or delivered
  IF NOT (v_order.status = ANY(v_allowed_statuses)) THEN
    RAISE EXCEPTION 'COD collection not allowed for order in status: %. Order must be out_for_delivery or delivered.',
      v_order.status
      USING ERRCODE = 'P0013';
  END IF;

  -- Amount must match (no partial COD supported)
  IF round(p_amount::numeric, 2) != round(v_order.total::numeric, 2) THEN
    RAISE EXCEPTION 'Amount mismatch: expected %, got %', v_order.total, p_amount
      USING ERRCODE = 'P0014';
  END IF;

  -- Mark payment as succeeded
  UPDATE public.payments
  SET status     = 'succeeded',
      metadata   = metadata || jsonb_build_object(
                     'cod_collected_at',   now(),
                     'cod_collected_by',   p_actor_id,
                     'cod_collected_role', p_actor_role,
                     'cod_amount',         p_amount,
                     'cod_notes',          p_notes
                   ),
      updated_at = now()
  WHERE id = v_payment.id;

  -- Record payment event
  INSERT INTO public.payment_events (
    payment_id, order_id, event_type, amount, actor_id, actor_role, notes, metadata
  ) VALUES (
    v_payment.id,
    p_order_id,
    'cod_collection_confirmed',
    p_amount,
    p_actor_id,
    p_actor_role,
    p_notes,
    jsonb_build_object(
      'previous_status', v_payment.status,
      'new_status',      'succeeded',
      'order_status',    v_order.status::text
    )
  )
  RETURNING id INTO v_payment_event;

  -- Record in order_status_history for timeline visibility
  INSERT INTO public.order_status_history (
    order_id, changed_by, from_status, to_status, reason
  )
  SELECT
    p_order_id,
    p_actor_id,
    v_order.status,
    v_order.status,
    COALESCE(p_notes, 'COD cash collected — payment confirmed')
  WHERE EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name   = 'order_status_history'
  );

  RETURN v_payment.id;
END;
$$;

-- Re-apply the same GRANT/REVOKE from migration 00021
REVOKE EXECUTE ON FUNCTION public.confirm_cod_cash_collected FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.confirm_cod_cash_collected TO service_role;
