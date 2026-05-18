-- ============================================================
-- MIGRATION 00041 — FIX cancel_order DUAL INVENTORY BUG
-- The cancel_order function in 00011 still referenced the
-- legacy `inventory` table. Post-00017, inventory_levels is
-- the canonical stock truth. This migration rewrites cancel_order
-- to release reserved stock from inventory_levels only and
-- records an inventory_movement for audit trail.
-- ============================================================

CREATE OR REPLACE FUNCTION public.cancel_order(
  p_order_id   uuid,
  p_user_id    uuid,
  p_reason     text    DEFAULT NULL,
  p_actor_type text    DEFAULT 'customer'
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_order RECORD;
  v_item  RECORD;
BEGIN
  SELECT id, status, user_id INTO v_order
    FROM public.orders
   WHERE id = p_order_id
     FOR UPDATE;

  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'Order % not found', p_order_id USING ERRCODE = 'P0005';
  END IF;

  IF p_actor_type = 'customer' AND v_order.user_id != p_user_id THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = 'P0007';
  END IF;

  IF v_order.status NOT IN (
    'draft', 'pending', 'pending_payment', 'confirmed', 'processing', 'packed', 'shipped'
  ) THEN
    RAISE EXCEPTION 'Order cannot be cancelled from status: %', v_order.status
      USING ERRCODE = 'P0006';
  END IF;

  -- Release reserved inventory from inventory_levels (canonical post-00017 table)
  -- and record inventory_movements for full audit trail.
  FOR v_item IN
    SELECT oi.variant_id, oi.quantity, il.warehouse_id
      FROM public.order_items oi
      JOIN public.inventory_levels il ON il.variant_id = oi.variant_id
     WHERE oi.order_id = p_order_id
       AND oi.variant_id IS NOT NULL
  LOOP
    UPDATE public.inventory_levels
       SET reserved   = GREATEST(0, reserved - v_item.quantity),
           updated_at = now()
     WHERE variant_id   = v_item.variant_id
       AND warehouse_id  = v_item.warehouse_id;

    INSERT INTO public.inventory_movements (
      variant_id, warehouse_id, movement_type, quantity, reason, reference_id, reference_type
    ) VALUES (
      v_item.variant_id,
      v_item.warehouse_id,
      'unreserve',
      v_item.quantity,
      'order_cancelled',
      p_order_id,
      'order'
    );
  END LOOP;

  UPDATE public.orders
     SET status = 'cancelled', updated_at = now()
   WHERE id = p_order_id;

  INSERT INTO public.order_status_history (order_id, from_status, to_status, changed_by, reason)
  VALUES (p_order_id, v_order.status, 'cancelled', p_user_id, p_reason);

  INSERT INTO public.order_events (order_id, event_type, actor_id, actor_type, description, metadata)
  VALUES (p_order_id, 'order_cancelled', p_user_id, p_actor_type,
          COALESCE(p_reason, 'Order cancelled'),
          jsonb_build_object('previous_status', v_order.status::text));
END;
$$;
