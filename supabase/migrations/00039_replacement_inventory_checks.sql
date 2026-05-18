-- ══════════════════════════════════════════════════════════════════════════════
-- Migration: 00039_replacement_inventory_checks
--
-- Purpose:  Complete the replacement inventory lifecycle:
--
--   1. check_replacement_inventory(return_id)
--        Read-only function — returns per-item stock availability as JSON.
--        Used by admin UI before approving and by customer form when selecting items.
--
--   2. create_replacement_order() — HARD inventory block by default.
--        Replaces the previous RAISE WARNING-only checks.
--        Adds p_force_create boolean (default false):
--          - false → raises P0012 if any variant is OOS.
--          - true  → admin override; proceeds even if OOS (recorded in metadata).
--
--   3. restock_returned_items(return_id, warehouse_id)
--        Adds returned quantities back to inventory_levels.quantity and inserts
--        an inventory_movements row with reason='return_restocked'.
--        Called manually by admin when the returned package is physically received.
--
--   4. approve_return() — propagates p_force_create to create_replacement_order.
--        Adds p_force_create boolean param (default false).
-- ══════════════════════════════════════════════════════════════════════════════


-- ── 1. check_replacement_inventory ───────────────────────────────────────────
--
-- Returns:
--   {
--     "all_available": true | false,
--     "items": [
--       {
--         "variant_id":    "uuid",
--         "product_name":  "...",
--         "variant_name":  "...",
--         "requested_qty": 1,
--         "available_qty": 3,   -- null if no inventory record exists
--         "is_available":  true
--       }, ...
--     ]
--   }

CREATE OR REPLACE FUNCTION public.check_replacement_inventory(
  p_return_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_default_warehouse_id uuid;
  v_items                jsonb := '[]'::jsonb;
  v_all_available        boolean := true;
  v_item                 RECORD;
  v_available            integer;
BEGIN
  SELECT id INTO v_default_warehouse_id
    FROM public.warehouses
   WHERE is_default = true AND is_active = true
   LIMIT 1;

  FOR v_item IN
    SELECT
      oi.variant_id,
      oi.product_name,
      oi.variant_name,
      ri.quantity AS requested_qty
    FROM public.order_return_items ri
    JOIN public.order_items        oi ON oi.id = ri.order_item_id
   WHERE ri.return_id = p_return_id
   ORDER BY oi.product_name
  LOOP
    v_available := NULL;

    IF v_item.variant_id IS NOT NULL AND v_default_warehouse_id IS NOT NULL THEN
      SELECT (il.quantity - il.reserved)
        INTO v_available
        FROM public.inventory_levels il
       WHERE il.variant_id   = v_item.variant_id
         AND il.warehouse_id = v_default_warehouse_id;
    END IF;

    IF v_available IS NULL OR v_available < v_item.requested_qty THEN
      v_all_available := false;
    END IF;

    v_items := v_items || jsonb_build_object(
      'variant_id',    v_item.variant_id,
      'product_name',  v_item.product_name,
      'variant_name',  v_item.variant_name,
      'requested_qty', v_item.requested_qty,
      'available_qty', v_available,
      'is_available',  COALESCE(v_available >= v_item.requested_qty, false)
    );
  END LOOP;

  RETURN jsonb_build_object(
    'all_available', v_all_available,
    'items',         v_items
  );
END;
$$;


-- ── 2. create_replacement_order() with hard OOS block ────────────────────────
--
-- Adds p_force_create boolean (default false).
-- OOS items now raise P0012 unless p_force_create = true.

CREATE OR REPLACE FUNCTION public.create_replacement_order(
  p_return_id    uuid,
  p_admin_id     uuid,
  p_force_create boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_return               RECORD;
  v_item                 RECORD;
  v_replacement_order_id uuid;
  v_default_warehouse_id uuid;
  v_available            integer;
  v_oos_items            text[] := ARRAY[]::text[];
BEGIN
  -- Fetch return request + parent order
  SELECT
    r.id            AS return_id,
    r.order_id      AS parent_order_id,
    r.user_id,
    r.request_type,
    o.shipping_address,
    o.billing_address,
    o.shipping_method,
    o.order_number  AS parent_order_number
  INTO v_return
    FROM public.order_returns r
    JOIN public.orders        o ON o.id = r.order_id
   WHERE r.id = p_return_id;

  IF v_return.return_id IS NULL THEN
    RAISE EXCEPTION 'Return request % not found', p_return_id USING ERRCODE = 'P0005';
  END IF;

  IF v_return.request_type != 'replacement' THEN
    RAISE EXCEPTION 'create_replacement_order called for non-replacement request (type: %)',
      v_return.request_type USING ERRCODE = 'P0010';
  END IF;

  SELECT id INTO v_default_warehouse_id
    FROM public.warehouses
   WHERE is_default = true AND is_active = true
   LIMIT 1;

  IF v_default_warehouse_id IS NULL THEN
    RAISE EXCEPTION 'No default warehouse configured. Cannot create replacement order.'
      USING ERRCODE = 'P0011';
  END IF;

  -- ── Inventory check (lock rows in variant_id order to prevent deadlocks) ──
  FOR v_item IN
    SELECT
      ri.quantity,
      oi.variant_id,
      oi.product_name,
      oi.variant_name,
      oi.sku,
      oi.unit_price
    FROM public.order_return_items ri
    JOIN public.order_items        oi ON oi.id = ri.order_item_id
   WHERE ri.return_id = p_return_id
   ORDER BY oi.variant_id
  LOOP
    IF v_item.variant_id IS NOT NULL THEN
      SELECT (il.quantity - il.reserved)
        INTO v_available
        FROM public.inventory_levels il
       WHERE il.variant_id   = v_item.variant_id
         AND il.warehouse_id = v_default_warehouse_id
         FOR UPDATE;

      IF v_available IS NULL THEN
        -- No inventory record at all
        v_oos_items := v_oos_items || (
          COALESCE(v_item.product_name, 'Unknown') ||
          COALESCE(' (' || v_item.variant_name || ')', '') ||
          ' — no stock record'
        );
      ELSIF v_available < v_item.quantity THEN
        v_oos_items := v_oos_items || (
          COALESCE(v_item.product_name, 'Unknown') ||
          COALESCE(' (' || v_item.variant_name || ')', '') ||
          ' — only ' || v_available || ' available, ' || v_item.quantity || ' requested'
        );
      END IF;
    END IF;
  END LOOP;

  -- Hard block when OOS (unless admin explicitly forces creation)
  IF array_length(v_oos_items, 1) > 0 AND NOT p_force_create THEN
    RAISE EXCEPTION 'Replacement cannot be created: out of stock — %',
      array_to_string(v_oos_items, '; ')
      USING ERRCODE = 'P0012';
  END IF;

  -- ── Create the replacement order row ──────────────────────────────────────
  INSERT INTO public.orders (
    order_number,
    user_id,
    status,
    order_type,
    parent_order_id,
    replacement_request_id,
    subtotal, tax, shipping, discount, total,
    shipping_address,
    billing_address,
    shipping_method,
    notes
  )
  SELECT
    public.generate_order_number(),
    v_return.user_id,
    'confirmed'::public.order_status,
    'replacement',
    v_return.parent_order_id,
    p_return_id,
    0, 0, 0, 0, 0,
    v_return.shipping_address,
    v_return.billing_address,
    v_return.shipping_method,
    'System-generated replacement for order ' || v_return.parent_order_number ||
      CASE WHEN array_length(v_oos_items, 1) > 0
           THEN ' [FORCED by admin — some items were OOS at approval time]'
           ELSE '' END
  RETURNING id INTO v_replacement_order_id;

  -- Copy items from return request → replacement order
  INSERT INTO public.order_items (
    order_id, variant_id, product_name, variant_name, sku,
    quantity, unit_price, total, snapshot
  )
  SELECT
    v_replacement_order_id,
    oi.variant_id,
    oi.product_name,
    oi.variant_name,
    oi.sku,
    ri.quantity,
    oi.unit_price,
    oi.unit_price * ri.quantity,
    oi.snapshot
  FROM public.order_return_items ri
  JOIN public.order_items        oi ON oi.id = ri.order_item_id
  WHERE ri.return_id = p_return_id;

  -- Reserve inventory (best-effort; forced orders may over-reserve)
  FOR v_item IN
    SELECT oi.variant_id, ri.quantity
    FROM public.order_return_items ri
    JOIN public.order_items        oi ON oi.id = ri.order_item_id
   WHERE ri.return_id = p_return_id
     AND oi.variant_id IS NOT NULL
  LOOP
    UPDATE public.inventory_levels
       SET reserved   = reserved + v_item.quantity,
           updated_at = now()
     WHERE variant_id   = v_item.variant_id
       AND warehouse_id = v_default_warehouse_id;
  END LOOP;

  -- Status history
  INSERT INTO public.order_status_history (order_id, from_status, to_status, changed_by, reason)
  VALUES (
    v_replacement_order_id,
    NULL,
    'confirmed'::public.order_status,
    p_admin_id,
    'Replacement order auto-generated from return request ' || p_return_id::text ||
      CASE WHEN array_length(v_oos_items, 1) > 0
           THEN ' (forced — some items OOS)'
           ELSE '' END
  );

  -- Event on parent order
  INSERT INTO public.order_events (order_id, event_type, actor_id, actor_type, description, metadata)
  VALUES (
    v_return.parent_order_id,
    'replacement_order_created',
    p_admin_id,
    'admin',
    'Replacement order created: ' || (
      SELECT order_number FROM public.orders WHERE id = v_replacement_order_id
    ),
    jsonb_build_object(
      'replacement_order_id', v_replacement_order_id,
      'return_id',            p_return_id,
      'forced',               array_length(v_oos_items, 1) > 0,
      'oos_items',            to_jsonb(v_oos_items)
    )
  );

  RETURN v_replacement_order_id;
END;
$$;


-- ── 3. restock_returned_items ─────────────────────────────────────────────────
--
-- Adds returned quantities back to inventory and records movements.
-- Called manually when the returned package is physically received.

CREATE OR REPLACE FUNCTION public.restock_returned_items(
  p_return_id    uuid,
  p_warehouse_id uuid DEFAULT NULL,
  p_admin_id     uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_warehouse_id uuid;
  v_item         RECORD;
  v_return       RECORD;
BEGIN
  -- Resolve warehouse
  IF p_warehouse_id IS NOT NULL THEN
    v_warehouse_id := p_warehouse_id;
  ELSE
    SELECT id INTO v_warehouse_id
      FROM public.warehouses
     WHERE is_default = true AND is_active = true
     LIMIT 1;
  END IF;

  IF v_warehouse_id IS NULL THEN
    RAISE EXCEPTION 'No warehouse configured for restock' USING ERRCODE = 'P0011';
  END IF;

  -- Validate return exists and is in a restockable state
  SELECT id, status, order_id INTO v_return
    FROM public.order_returns
   WHERE id = p_return_id;

  IF v_return.id IS NULL THEN
    RAISE EXCEPTION 'Return request % not found', p_return_id USING ERRCODE = 'P0005';
  END IF;

  IF v_return.status NOT IN ('approved', 'return_in_transit', 'returned', 'replacement_shipped', 'replacement_delivered') THEN
    RAISE EXCEPTION 'Return % is not in a restockable state (current: %)',
      p_return_id, v_return.status USING ERRCODE = 'P0013';
  END IF;

  -- Add quantities back and log movements
  FOR v_item IN
    SELECT
      oi.variant_id,
      ri.quantity,
      oi.product_name,
      oi.variant_name,
      oi.sku
    FROM public.order_return_items ri
    JOIN public.order_items        oi ON oi.id = ri.order_item_id
   WHERE ri.return_id = p_return_id
     AND oi.variant_id IS NOT NULL
  LOOP
    -- Increase available quantity
    INSERT INTO public.inventory_levels (variant_id, warehouse_id, quantity, reserved)
    VALUES (v_item.variant_id, v_warehouse_id, v_item.quantity, 0)
    ON CONFLICT (variant_id, warehouse_id) DO UPDATE
      SET quantity   = inventory_levels.quantity + EXCLUDED.quantity,
          updated_at = now();

    -- Also release any reservation that was created when the replacement order
    -- was approved (the outbound reservation for the replacement shipment).
    -- This is a no-op for plain returns that never had a reservation.
    UPDATE public.inventory_levels
       SET reserved   = GREATEST(0, reserved - v_item.quantity),
           updated_at = now()
     WHERE variant_id   = v_item.variant_id
       AND warehouse_id = v_warehouse_id;

    -- Record movement
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema = 'public' AND table_name = 'inventory_movements') THEN
      INSERT INTO public.inventory_movements (
        variant_id, warehouse_id, quantity, reason, reference_id, performed_by
      )
      VALUES (
        v_item.variant_id,
        v_warehouse_id,
        v_item.quantity,
        'return_restocked',
        p_return_id,
        p_admin_id
      )
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;
END;
$$;


-- ── 4. approve_return() — pass p_force_create through ────────────────────────
--
-- Adds p_force_create boolean (default false) so the caller can override the
-- OOS hard block added in create_replacement_order (step 2 above).

CREATE OR REPLACE FUNCTION public.approve_return(
  p_return_id    uuid,
  p_admin_id     uuid,
  p_note         text    DEFAULT NULL,
  p_force_create boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_return               RECORD;
  v_target_status        public.order_status;
  v_replacement_order_id uuid;
BEGIN
  SELECT id, order_id, status, request_type
    INTO v_return
    FROM public.order_returns
   WHERE id = p_return_id;

  IF v_return.id IS NULL THEN
    RAISE EXCEPTION 'Return request % not found', p_return_id USING ERRCODE = 'P0005';
  END IF;

  IF v_return.status != 'requested' THEN
    RAISE EXCEPTION 'Return request % is not in requested state (current: %)',
      p_return_id, v_return.status USING ERRCODE = 'P0006';
  END IF;

  -- Determine parent order target status based on request type
  IF v_return.request_type = 'replacement' THEN
    v_target_status := 'replacement_approved'::public.order_status;
  ELSE
    v_target_status := 'return_approved'::public.order_status;
  END IF;

  -- Update the return request to approved
  UPDATE public.order_returns
     SET status     = 'approved',
         admin_note = p_note,
         updated_at = now()
   WHERE id = p_return_id;

  -- Update parent order status
  PERFORM public.update_order_status(
    v_return.order_id,
    v_target_status,
    p_admin_id::text,
    COALESCE(p_note, 'Approved by admin')
  );

  -- For replacement: create the replacement order
  -- p_force_create allows admin to override OOS block
  IF v_return.request_type = 'replacement' THEN
    v_replacement_order_id := public.create_replacement_order(
      p_return_id,
      p_admin_id,
      p_force_create
    );

    -- Store replacement order id in event metadata (already done inside
    -- create_replacement_order, but record here too for traceability)
    INSERT INTO public.order_events (order_id, event_type, actor_id, actor_type, description, metadata)
    VALUES (
      v_return.order_id,
      'replacement_approved',
      p_admin_id,
      'admin',
      'Replacement request approved. Replacement order created.',
      jsonb_build_object(
        'return_id',            p_return_id,
        'replacement_order_id', v_replacement_order_id,
        'note',                 p_note,
        'forced',               p_force_create
      )
    );
  ELSE
    INSERT INTO public.order_events (order_id, event_type, actor_id, actor_type, description, metadata)
    VALUES (
      v_return.order_id,
      'return_approved',
      p_admin_id,
      'admin',
      'Return request approved.',
      jsonb_build_object('return_id', p_return_id, 'note', p_note)
    );
  END IF;
END;
$$;
