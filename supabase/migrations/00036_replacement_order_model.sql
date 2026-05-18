-- ══════════════════════════════════════════════════════════════════════════════
-- Migration: 00036_replacement_order_model
--
-- Purpose:  Introduce a system-generated replacement order entity so that
--           replacement logistics are cleanly separated from the original order.
--
-- Changes:
--   1. Extend public.orders with order_type / parent_order_id /
--      replacement_request_id columns.
--   2. Create public.create_replacement_order() — inserts a new orders row
--      (order_type='replacement'), copies items from the return request, and
--      reserves inventory — called automatically on replacement approval.
--   3. Replace public.approve_return() so that when request_type='replacement'
--      it calls create_replacement_order and stores the new order id in the
--      event metadata.  Return-request approval is unchanged.
--
-- Backward compatibility:
--   - All existing purchase orders keep order_type = 'purchase' (DEFAULT).
--   - replacement_outbound shipment type is kept in create_fulfillment for any
--     legacy rows; new flow uses outbound_original on the replacement order.
--   - replacement_shipped / replacement_delivered statuses on the parent order
--     remain valid in the state machine for any pre-migration data.
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 1. Extend orders table ────────────────────────────────────────────────────

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS order_type             text NOT NULL DEFAULT 'purchase'
    CHECK (order_type IN ('purchase', 'replacement')),
  ADD COLUMN IF NOT EXISTS parent_order_id        uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS replacement_request_id uuid REFERENCES public.order_returns(id) ON DELETE SET NULL;

-- Sparse partial indexes — only non-default rows are indexed
CREATE INDEX IF NOT EXISTS idx_orders_order_type
  ON public.orders(order_type)
  WHERE order_type != 'purchase';

CREATE INDEX IF NOT EXISTS idx_orders_parent_order_id
  ON public.orders(parent_order_id)
  WHERE parent_order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_replacement_request_id
  ON public.orders(replacement_request_id)
  WHERE replacement_request_id IS NOT NULL;


-- ── 2. create_replacement_order() ─────────────────────────────────────────────
--
-- Called from approve_return when request_type = 'replacement'.
--
-- Creates a new orders row (order_type='replacement', total=0, status='confirmed'),
-- copies order_items from the return request items, and reserves inventory
-- using the same default-warehouse pattern as create_order_atomic.
--
-- Returns: replacement_order_id uuid

CREATE OR REPLACE FUNCTION public.create_replacement_order(
  p_return_id  uuid,
  p_admin_id   uuid
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_return               RECORD;
  v_parent_order         RECORD;
  v_item                 RECORD;
  v_replacement_order_id uuid;
  v_default_warehouse_id uuid;
  v_available            integer;
BEGIN
  -- Fetch return request + parent order in one join
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

  -- Resolve default warehouse (same pattern as create_order_atomic)
  SELECT id INTO v_default_warehouse_id
    FROM public.warehouses
   WHERE is_default = true AND is_active = true
   LIMIT 1;

  IF v_default_warehouse_id IS NULL THEN
    RAISE EXCEPTION 'No default warehouse configured. Cannot create replacement order.'
      USING ERRCODE = 'P0011';
  END IF;

  -- Validate inventory availability for each return item
  -- (lock in variant_id order to prevent deadlocks)
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

      -- If no inventory record exists, warn but don't block
      -- (replacement is a goodwill gesture; ops can handle manually)
      IF v_available IS NULL THEN
        RAISE WARNING 'No inventory record for variant %. Replacement order will proceed without reservation.',
          v_item.variant_id;
      ELSIF v_available < v_item.quantity THEN
        RAISE WARNING 'Low stock: % available, % requested for variant % (replacement order will proceed).',
          v_available, v_item.quantity, v_item.variant_id;
      END IF;
    END IF;
  END LOOP;

  -- Create the replacement order row
  INSERT INTO public.orders (
    order_number,
    user_id,
    status,
    order_type,
    parent_order_id,
    replacement_request_id,
    subtotal,
    tax,
    shipping,
    discount,
    total,
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
    -- Total is 0 (no charge for replacement; differential pricing is a future feature)
    0,
    0,
    0,
    0,
    0,
    v_return.shipping_address,
    v_return.billing_address,
    v_return.shipping_method,
    'System-generated replacement for order ' || v_return.parent_order_number
  RETURNING id INTO v_replacement_order_id;

  -- Copy items from return request → replacement order's order_items
  INSERT INTO public.order_items (
    order_id,
    variant_id,
    product_name,
    variant_name,
    sku,
    quantity,
    unit_price,
    total,
    snapshot
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

  -- Reserve inventory for each replacement item (best-effort)
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

  -- Status history for the new replacement order
  INSERT INTO public.order_status_history (order_id, from_status, to_status, changed_by, reason)
  VALUES (
    v_replacement_order_id,
    NULL,
    'confirmed'::public.order_status,
    p_admin_id,
    'Replacement order auto-generated from return request ' || p_return_id::text
  );

  -- Order event on the PARENT order so admin can trace the link
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
      'return_id',            p_return_id
    )
  );

  -- Order event on the replacement order itself
  INSERT INTO public.order_events (order_id, event_type, actor_id, actor_type, description, metadata)
  VALUES (
    v_replacement_order_id,
    'replacement_order_created',
    p_admin_id,
    'admin',
    'Replacement order generated for return request ' || p_return_id::text,
    jsonb_build_object(
      'parent_order_id', v_return.parent_order_id,
      'return_id',       p_return_id
    )
  );

  RETURN v_replacement_order_id;
END;
$$;


-- ── 3. Update approve_return ───────────────────────────────────────────────────
--
-- When request_type = 'replacement':
--   • Updates order_returns + parent order status (same as before)
--   • ALSO calls create_replacement_order → stores replacement_order_id in metadata
--
-- When request_type = 'return': unchanged behaviour.

CREATE OR REPLACE FUNCTION public.approve_return(
  p_return_id uuid,
  p_admin_id  uuid,
  p_note      text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_return               RECORD;
  v_target_status        public.order_status;
  v_replacement_order_id uuid;
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
    WHEN 'replacement' THEN 'replacement_approved'::public.order_status
    ELSE                    'return_approved'::public.order_status
  END;

  -- Update the return request row
  UPDATE public.order_returns
     SET status      = 'approved',
         reviewed_by = p_admin_id,
         reviewed_at = now(),
         review_note = p_note,
         updated_at  = now()
   WHERE id = p_return_id;

  -- Advance the parent order status
  PERFORM public.update_order_status(v_return.order_id, v_target_status, p_admin_id, p_note);

  -- ── Replacement-specific: auto-generate the replacement order ────────────────
  IF v_return.request_type = 'replacement' THEN
    v_replacement_order_id := public.create_replacement_order(p_return_id, p_admin_id);
  END IF;

  -- Audit event on the parent order (includes replacement_order_id when applicable)
  INSERT INTO public.order_events (order_id, event_type, actor_id, actor_type, description, metadata)
  VALUES (
    v_return.order_id,
    v_target_status::text,
    p_admin_id,
    'admin',
    COALESCE(p_note, v_return.request_type || ' request approved'),
    jsonb_build_object(
      'return_id',            p_return_id,
      'request_type',         v_return.request_type,
      'replacement_order_id', v_replacement_order_id  -- NULL for return approvals
    )
  );
END;
$$;
