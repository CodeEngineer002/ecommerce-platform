-- ══════════════════════════════════════════════════════════════════════════════
-- Migration: 00040_return_pickup_lifecycle
--
-- Purpose:  Implement the return-pickup lifecycle for return and replacement
--           requests.  When a customer sends an item back, the flow is:
--
--   approved ──► pickup_scheduled ──► in_transit ──► received
--                                                       │
--                                              restock_returned_items()
--
-- Three new functions:
--   1. mark_return_pickup_scheduled  — admin schedules pickup
--   2. mark_return_collected         — delivery boy (or admin for testing)
--                                      marks item collected from customer
--   3. mark_return_received          — warehouse marks item received;
--                                      auto-calls restock_returned_items()
-- ══════════════════════════════════════════════════════════════════════════════


-- ── 1. mark_return_pickup_scheduled ──────────────────────────────────────────
--
-- Transitions: approved → pickup_scheduled
-- Called when admin books a pickup with courier/logistics partner.

CREATE OR REPLACE FUNCTION public.mark_return_pickup_scheduled(
  p_return_id  uuid,
  p_actor_id   uuid DEFAULT NULL,
  p_note       text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_return RECORD;
BEGIN
  SELECT id, order_id, status, request_type
    INTO v_return
    FROM public.order_returns
   WHERE id = p_return_id
     FOR UPDATE;

  IF v_return.id IS NULL THEN
    RAISE EXCEPTION 'Return request % not found', p_return_id USING ERRCODE = 'P0005';
  END IF;

  IF v_return.status != 'approved' THEN
    RAISE EXCEPTION 'Pickup can only be scheduled when return is approved (current: %)',
      v_return.status USING ERRCODE = 'P0006';
  END IF;

  UPDATE public.order_returns
     SET status     = 'pickup_scheduled',
         updated_at = now()
   WHERE id = p_return_id;

  INSERT INTO public.order_events (
    order_id, event_type, actor_id, actor_type, description, metadata
  ) VALUES (
    v_return.order_id,
    'return_pickup_scheduled',
    p_actor_id,
    'admin',
    'Return pickup scheduled for ' || v_return.request_type || ' request.',
    jsonb_build_object(
      'return_id',    p_return_id,
      'note',         p_note
    )
  );
END;
$$;


-- ── 2. mark_return_collected ──────────────────────────────────────────────────
--
-- Transitions: pickup_scheduled → in_transit
-- Called by delivery boy (or admin) when item is picked up from the customer.
-- actor_type can be 'admin' or 'delivery_agent'.

CREATE OR REPLACE FUNCTION public.mark_return_collected(
  p_return_id   uuid,
  p_actor_id    uuid   DEFAULT NULL,
  p_actor_type  text   DEFAULT 'admin',
  p_note        text   DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_return RECORD;
BEGIN
  SELECT id, order_id, status, request_type
    INTO v_return
    FROM public.order_returns
   WHERE id = p_return_id
     FOR UPDATE;

  IF v_return.id IS NULL THEN
    RAISE EXCEPTION 'Return request % not found', p_return_id USING ERRCODE = 'P0005';
  END IF;

  -- Allow both pickup_scheduled and approved (in case pickup wasn't explicitly scheduled)
  IF v_return.status NOT IN ('approved', 'pickup_scheduled') THEN
    RAISE EXCEPTION 'Item can only be marked collected when return is approved or pickup_scheduled (current: %)',
      v_return.status USING ERRCODE = 'P0006';
  END IF;

  UPDATE public.order_returns
     SET status     = 'in_transit',
         updated_at = now()
   WHERE id = p_return_id;

  INSERT INTO public.order_events (
    order_id, event_type, actor_id, actor_type, description, metadata
  ) VALUES (
    v_return.order_id,
    'return_item_collected',
    p_actor_id,
    p_actor_type,
    'Return item collected from customer — now in transit to warehouse.',
    jsonb_build_object(
      'return_id',    p_return_id,
      'request_type', v_return.request_type,
      'actor_type',   p_actor_type,
      'note',         p_note
    )
  );
END;
$$;


-- ── 3. mark_return_received ───────────────────────────────────────────────────
--
-- Transitions: in_transit → received
-- Called by warehouse when item physically arrives.
-- Automatically calls restock_returned_items() to add quantities back.

CREATE OR REPLACE FUNCTION public.mark_return_received(
  p_return_id    uuid,
  p_actor_id     uuid   DEFAULT NULL,
  p_warehouse_id uuid   DEFAULT NULL,
  p_note         text   DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_return RECORD;
BEGIN
  SELECT id, order_id, status, request_type
    INTO v_return
    FROM public.order_returns
   WHERE id = p_return_id
     FOR UPDATE;

  IF v_return.id IS NULL THEN
    RAISE EXCEPTION 'Return request % not found', p_return_id USING ERRCODE = 'P0005';
  END IF;

  IF v_return.status NOT IN ('in_transit', 'pickup_scheduled', 'approved') THEN
    RAISE EXCEPTION 'Item can only be marked received when in transit (current: %)',
      v_return.status USING ERRCODE = 'P0006';
  END IF;

  UPDATE public.order_returns
     SET status     = 'received',
         updated_at = now()
   WHERE id = p_return_id;

  -- Automatically restock inventory
  PERFORM public.restock_returned_items(
    p_return_id,
    p_warehouse_id,
    p_actor_id
  );

  INSERT INTO public.order_events (
    order_id, event_type, actor_id, actor_type, description, metadata
  ) VALUES (
    v_return.order_id,
    'return_item_received',
    p_actor_id,
    'admin',
    'Return item received at warehouse. Inventory restocked.',
    jsonb_build_object(
      'return_id',     p_return_id,
      'request_type',  v_return.request_type,
      'note',          p_note,
      'auto_restocked', true
    )
  );
END;
$$;


-- ── Extend restock_returned_items to accept more return statuses ──────────────
-- (Original in 00039 only allowed 'approved', 'return_in_transit', 'returned', etc.
--  We now accept 'in_transit' and 'received' which are the actual order_returns values)

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

  SELECT id, status, order_id INTO v_return
    FROM public.order_returns
   WHERE id = p_return_id;

  IF v_return.id IS NULL THEN
    RAISE EXCEPTION 'Return request % not found', p_return_id USING ERRCODE = 'P0005';
  END IF;

  -- Accept any post-approval status (in_transit, received, or legacy values)
  IF v_return.status NOT IN (
    'approved', 'pickup_scheduled', 'in_transit', 'received',
    'inspected', 'accepted',
    -- Legacy order-level status values kept for backward compat
    'return_in_transit', 'returned', 'replacement_shipped', 'replacement_delivered'
  ) THEN
    RAISE EXCEPTION 'Return % is not in a restockable state (current: %)',
      p_return_id, v_return.status USING ERRCODE = 'P0013';
  END IF;

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
    INSERT INTO public.inventory_levels (variant_id, warehouse_id, quantity, reserved)
    VALUES (v_item.variant_id, v_warehouse_id, v_item.quantity, 0)
    ON CONFLICT (variant_id, warehouse_id) DO UPDATE
      SET quantity   = inventory_levels.quantity + EXCLUDED.quantity,
          updated_at = now();

    -- Release the outbound reservation that was placed when replacement order was approved
    UPDATE public.inventory_levels
       SET reserved   = GREATEST(0, reserved - v_item.quantity),
           updated_at = now()
     WHERE variant_id   = v_item.variant_id
       AND warehouse_id = v_warehouse_id;

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
