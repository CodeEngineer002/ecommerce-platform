-- ============================================================
-- MIGRATION 00043 — FIX cancel_order P0 BUGS
-- ============================================================
--
-- Two bugs fixed:
--
-- P0-1 (runtime crash): 00041 wrote inventory_movements using
--   columns that do NOT exist: movement_type, reason,
--   warehouse_id, reference_type; and enum value 'unreserve'
--   which is not in inventory_movement_type.
--   PostgreSQL PL/pgSQL compiles functions without validating
--   column names — the error only surfaces at call time,
--   causing the entire cancel_order transaction to roll back.
--   Result: order stays active, inventory never released.
--
-- P0-2 (inventory corruption): The inventory release loop
--   joined order_items to ALL inventory_levels rows for a
--   variant (no warehouse filter). For a variant stocked in N
--   warehouses the UPDATE ran N times, over-releasing reserved
--   by up to N×. This can drive reserved below zero (clamped
--   to 0), making stock appear more available than it is →
--   oversell on subsequent orders.
--
-- Fix strategy (no schema changes):
--   - Resolve the default warehouse at the start of the
--     function (same warehouse create_order_atomic reserves
--     from) and use it explicitly — eliminates the cross-join.
--   - Use the canonical inventory_movements column names:
--       type       → 'adjustment'::inventory_movement_type
--       note       → cancellation reason
--       source_type, source_id → 'order', order UUID
--       created_by → actor UUID
--   This matches the shape written by 00006's
--   record_inventory_movement() helper.
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
  v_order             RECORD;
  v_item              RECORD;
  v_default_warehouse uuid;
BEGIN
  -- Lock the order row to prevent concurrent cancellations
  SELECT id, status, user_id INTO v_order
    FROM public.orders
   WHERE id = p_order_id
     FOR UPDATE;

  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'Order % not found', p_order_id USING ERRCODE = 'P0005';
  END IF;

  -- Customers can only cancel their own orders
  IF p_actor_type = 'customer' AND v_order.user_id != p_user_id THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = 'P0007';
  END IF;

  -- Only pre-fulfilment statuses are cancellable
  IF v_order.status NOT IN (
    'draft', 'pending', 'pending_payment', 'confirmed', 'processing', 'packed', 'shipped'
  ) THEN
    RAISE EXCEPTION 'Order cannot be cancelled from status: %', v_order.status
      USING ERRCODE = 'P0006';
  END IF;

  -- ── P0-2 fix: resolve default warehouse once ───────────────
  -- create_order_atomic reserves stock from the default
  -- warehouse only, so we must release from the same warehouse.
  -- If no default warehouse is found we still cancel the order
  -- (graceful degradation) but skip the inventory release.
  SELECT id INTO v_default_warehouse
    FROM public.warehouses
   WHERE is_default = true
     AND is_active  = true
   LIMIT 1;

  -- ── Release reserved inventory ────────────────────────────
  -- Loop over order_items only (no join to inventory_levels)
  -- to avoid N-warehouse fan-out.
  FOR v_item IN
    SELECT oi.variant_id, oi.quantity
      FROM public.order_items oi
     WHERE oi.order_id        = p_order_id
       AND oi.variant_id IS NOT NULL
  LOOP
    IF v_default_warehouse IS NOT NULL THEN
      -- Decrement reservation for the default warehouse
      UPDATE public.inventory_levels
         SET reserved   = GREATEST(0, reserved - v_item.quantity),
             updated_at = now()
       WHERE variant_id   = v_item.variant_id
         AND warehouse_id = v_default_warehouse;

      -- ── P0-1 fix: use canonical inventory_movements columns ──
      -- Correct column names (from 00001 + 00006):
      --   type        (inventory_movement_type enum)
      --   note        (text — human-readable reason)
      --   source_type (text — category of source)
      --   source_id   (uuid — the causing entity)
      --   reference_id (uuid — additional reference)
      --   created_by  (uuid — actor)
      INSERT INTO public.inventory_movements (
        variant_id,
        type,
        quantity,
        source_type,
        source_id,
        reference_id,
        note,
        created_by
      ) VALUES (
        v_item.variant_id,
        'adjustment'::public.inventory_movement_type,
        v_item.quantity,
        'order',
        p_order_id,
        p_order_id,
        COALESCE(p_reason, 'Inventory reservation released on order cancellation'),
        p_user_id
      );
    END IF;
  END LOOP;

  -- ── Update order status ────────────────────────────────────
  UPDATE public.orders
     SET status     = 'cancelled',
         updated_at = now()
   WHERE id = p_order_id;

  -- ── Write status history ───────────────────────────────────
  INSERT INTO public.order_status_history (
    order_id, from_status, to_status, changed_by, reason
  ) VALUES (
    p_order_id, v_order.status, 'cancelled', p_user_id, p_reason
  );

  -- ── Write order event ──────────────────────────────────────
  INSERT INTO public.order_events (
    order_id, event_type, actor_id, actor_type, description, metadata
  ) VALUES (
    p_order_id,
    'order_cancelled',
    p_user_id,
    p_actor_type,
    COALESCE(p_reason, 'Order cancelled'),
    jsonb_build_object('previous_status', v_order.status::text)
  );
END;
$$;

-- Verify the function signature is unchanged so existing callers are unaffected
COMMENT ON FUNCTION public.cancel_order(uuid, uuid, text, text) IS
  '00043: Fixed P0-1 (inventory_movements schema mismatch) and
   P0-2 (multi-warehouse over-release). Uses default warehouse
   for reservation release — matches create_order_atomic.';
