-- ============================================================
-- ENTERPRISE DOMAIN EXPANSION
-- ============================================================
-- Extends the ecommerce domain with enterprise-grade features:
-- fulfillment tracking, returns/refunds, payment events,
-- shipment tracking, and a richer inventory movement ledger.
-- ============================================================

-- ── Extend order_status with enterprise states ────────────────────────────────
-- draft          : checkout started, payment not yet initiated
-- pending_payment: order created, awaiting payment confirmation
-- partially_returned: some items returned, order otherwise complete
-- partially_refunded: partial refund issued
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'draft'               BEFORE 'pending';
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'pending_payment'      AFTER 'pending';
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'partially_returned'   AFTER 'delivered';
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'partially_refunded'   AFTER 'refunded';

-- ── Fulfillment lifecycle (separate from order status) ────────────────────────
CREATE TYPE public.fulfillment_status AS ENUM (
  'unfulfilled',
  'processing',
  'partially_fulfilled',
  'fulfilled',
  'shipped',
  'delivered',
  'failed'
);

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS fulfillment_status public.fulfillment_status
    NOT NULL DEFAULT 'unfulfilled';

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS shipping_method text;

-- ── Inventory movement ledger enhancement ────────────────────────────────────
-- Adds full audit fields: previous/new quantities, source tracking.
-- These columns are nullable so existing rows are not invalidated.
ALTER TABLE public.inventory_movements
  ADD COLUMN IF NOT EXISTS previous_quantity integer,
  ADD COLUMN IF NOT EXISTS new_quantity      integer,
  ADD COLUMN IF NOT EXISTS source_type       text
    CHECK (source_type IN ('order', 'return', 'adjustment', 'purchase', 'transfer', 'admin')),
  ADD COLUMN IF NOT EXISTS source_id         uuid;

CREATE INDEX IF NOT EXISTS idx_inventory_movements_source_id
  ON public.inventory_movements(source_id)
  WHERE source_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_inventory_movements_created_at
  ON public.inventory_movements(created_at DESC);

-- ── Return requests ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.return_requests (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id                uuid NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  user_id                 uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status                  text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'completed', 'cancelled')),
  reason                  text NOT NULL,
  notes                   text,
  admin_notes             text,
  reviewed_by             uuid REFERENCES auth.users(id),
  reviewed_at             timestamptz,
  return_window_expires_at timestamptz,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_return_requests_order_id  ON public.return_requests(order_id);
CREATE INDEX idx_return_requests_user_id   ON public.return_requests(user_id);
CREATE INDEX idx_return_requests_status    ON public.return_requests(status);

CREATE TRIGGER trg_return_requests_updated_at
  BEFORE UPDATE ON public.return_requests
  FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();

ALTER TABLE public.return_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own return requests"
  ON public.return_requests FOR ALL
  USING (user_id = auth.uid());

CREATE POLICY "Admins manage all return requests"
  ON public.return_requests FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
    )
  );

-- ── Return items ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.return_items (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_request_id uuid NOT NULL REFERENCES public.return_requests(id) ON DELETE CASCADE,
  order_item_id     uuid NOT NULL REFERENCES public.order_items(id) ON DELETE RESTRICT,
  quantity          integer NOT NULL CHECK (quantity > 0),
  reason            text,
  condition         text CHECK (condition IN ('new', 'good', 'damaged', 'defective')),
  restock           boolean NOT NULL DEFAULT true,
  refund_amount     numeric(12, 2),
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_return_items_return_request_id ON public.return_items(return_request_id);
CREATE INDEX idx_return_items_order_item_id     ON public.return_items(order_item_id);

ALTER TABLE public.return_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own return items via return request"
  ON public.return_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.return_requests r
      WHERE r.id = return_request_id AND r.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins manage all return items"
  ON public.return_items FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
    )
  );

-- ── Payment events (full payment audit log) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payment_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id  uuid NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  order_id    uuid NOT NULL REFERENCES public.orders(id),
  event_type  text NOT NULL
    CHECK (event_type IN (
      'created', 'authorized', 'captured', 'failed',
      'refunded', 'partially_refunded', 'webhook_received',
      'intent_created', 'retry'
    )),
  provider    text NOT NULL,
  amount      numeric(12, 2),
  payload     jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_payment_events_payment_id ON public.payment_events(payment_id);
CREATE INDEX idx_payment_events_order_id   ON public.payment_events(order_id);
CREATE INDEX idx_payment_events_created_at ON public.payment_events(created_at DESC);

ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view all payment events"
  ON public.payment_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
    )
  );

-- ── Shipment tracking ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.shipment_tracking (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id             uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  carrier              text,
  tracking_number      text,
  tracking_url         text,
  status               text NOT NULL DEFAULT 'pending'
    CHECK (status IN (
      'pending', 'picked_up', 'in_transit',
      'out_for_delivery', 'delivered', 'failed', 'returned'
    )),
  estimated_delivery   timestamptz,
  delivered_at         timestamptz,
  events               jsonb NOT NULL DEFAULT '[]',
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_shipment_tracking_order_id        ON public.shipment_tracking(order_id);
CREATE INDEX idx_shipment_tracking_tracking_number ON public.shipment_tracking(tracking_number)
  WHERE tracking_number IS NOT NULL;

CREATE TRIGGER trg_shipment_tracking_updated_at
  BEFORE UPDATE ON public.shipment_tracking
  FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();

ALTER TABLE public.shipment_tracking ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own shipment tracking"
  ON public.shipment_tracking FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.orders
      WHERE id = order_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Admins manage shipment tracking"
  ON public.shipment_tracking FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
    )
  );

-- ============================================================
-- HELPER FUNCTION: Record Inventory Movement
-- ============================================================
CREATE OR REPLACE FUNCTION public.record_inventory_movement(
  p_variant_id      uuid,
  p_type            public.inventory_movement_type,
  p_quantity        integer,
  p_previous_qty    integer,
  p_new_qty         integer,
  p_source_type     text,
  p_source_id       uuid,
  p_note            text,
  p_actor_id        uuid
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.inventory_movements (
    variant_id, type, quantity,
    previous_quantity, new_quantity,
    source_type, source_id,
    reference_id, note, created_by
  ) VALUES (
    p_variant_id, p_type, p_quantity,
    p_previous_qty, p_new_qty,
    p_source_type, p_source_id,
    p_source_id, p_note, p_actor_id
  );
END;
$$;

-- ============================================================
-- RELEASE INVENTORY FOR ORDER (on cancellation)
-- ============================================================
-- Releases all reserved stock for an order and records movements.
CREATE OR REPLACE FUNCTION public.release_inventory_for_order(
  p_order_id  uuid,
  p_actor_id  uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_item        RECORD;
  v_prev_reserved integer;
  v_current_qty   integer;
BEGIN
  FOR v_item IN
    SELECT oi.variant_id, oi.quantity
      FROM public.order_items oi
     WHERE oi.order_id = p_order_id
       AND oi.variant_id IS NOT NULL
  LOOP
    SELECT quantity, reserved
      INTO v_current_qty, v_prev_reserved
      FROM public.inventory
     WHERE variant_id = v_item.variant_id
       FOR UPDATE;

    IF FOUND THEN
      UPDATE public.inventory
         SET reserved = GREATEST(0, reserved - v_item.quantity)
       WHERE variant_id = v_item.variant_id;

      PERFORM public.record_inventory_movement(
        v_item.variant_id,
        'adjustment'::public.inventory_movement_type,
        v_item.quantity,
        v_prev_reserved,
        GREATEST(0, v_prev_reserved - v_item.quantity),
        'order',
        p_order_id,
        'Inventory reservation released on order cancellation',
        p_actor_id
      );
    END IF;
  END LOOP;
END;
$$;

-- ============================================================
-- COMMIT INVENTORY FOR ORDER (on delivery)
-- ============================================================
-- Deducts actual stock and releases reservation when order is delivered.
CREATE OR REPLACE FUNCTION public.commit_inventory_for_order(
  p_order_id  uuid,
  p_actor_id  uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_item      RECORD;
  v_prev_qty  integer;
  v_prev_res  integer;
BEGIN
  FOR v_item IN
    SELECT oi.variant_id, oi.quantity
      FROM public.order_items oi
     WHERE oi.order_id = p_order_id
       AND oi.variant_id IS NOT NULL
  LOOP
    SELECT quantity, reserved
      INTO v_prev_qty, v_prev_res
      FROM public.inventory
     WHERE variant_id = v_item.variant_id
       FOR UPDATE;

    IF FOUND THEN
      UPDATE public.inventory
         SET quantity = GREATEST(0, quantity - v_item.quantity),
             reserved = GREATEST(0, reserved - v_item.quantity)
       WHERE variant_id = v_item.variant_id;

      PERFORM public.record_inventory_movement(
        v_item.variant_id,
        'sale'::public.inventory_movement_type,
        v_item.quantity,
        v_prev_qty,
        GREATEST(0, v_prev_qty - v_item.quantity),
        'order',
        p_order_id,
        'Stock deducted on order delivery',
        p_actor_id
      );
    END IF;
  END LOOP;
END;
$$;

-- ============================================================
-- REPLACE update_order_status WITH LIFECYCLE-AWARE VERSION
-- ============================================================
-- Now triggers inventory side-effects on key transitions:
--   cancelled  → releases inventory reservation
--   delivered  → commits inventory (deducts actual stock)
CREATE OR REPLACE FUNCTION public.update_order_status(
  p_order_id   uuid,
  p_new_status public.order_status,
  p_changed_by uuid,
  p_reason     text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_current_status public.order_status;
BEGIN
  SELECT status INTO v_current_status
    FROM public.orders
   WHERE id = p_order_id
     FOR UPDATE;

  IF v_current_status IS NULL THEN
    RAISE EXCEPTION 'Order % not found', p_order_id
      USING ERRCODE = 'P0005';
  END IF;

  -- State machine validation
  IF NOT (
    (v_current_status = 'draft'            AND p_new_status IN ('pending', 'pending_payment', 'cancelled')) OR
    (v_current_status = 'pending'          AND p_new_status IN ('confirmed', 'pending_payment', 'cancelled')) OR
    (v_current_status = 'pending_payment'  AND p_new_status IN ('confirmed', 'cancelled')) OR
    (v_current_status = 'confirmed'        AND p_new_status IN ('processing', 'cancelled')) OR
    (v_current_status = 'processing'       AND p_new_status IN ('shipped', 'cancelled')) OR
    (v_current_status = 'shipped'          AND p_new_status IN ('delivered', 'cancelled')) OR
    (v_current_status = 'delivered'        AND p_new_status IN ('refunded', 'partially_refunded', 'partially_returned')) OR
    (v_current_status = 'partially_returned' AND p_new_status IN ('refunded', 'partially_refunded')) OR
    (v_current_status = 'partially_refunded' AND p_new_status = 'refunded') OR
    (v_current_status = 'cancelled'        AND p_new_status = 'refunded')
  ) THEN
    RAISE EXCEPTION 'Invalid status transition: % -> %', v_current_status, p_new_status
      USING ERRCODE = 'P0006';
  END IF;

  UPDATE public.orders
     SET status = p_new_status, updated_at = now()
   WHERE id = p_order_id;

  INSERT INTO public.order_status_history (order_id, from_status, to_status, changed_by, reason)
  VALUES (p_order_id, v_current_status, p_new_status, p_changed_by, p_reason);

  -- ── Lifecycle side-effects ────────────────────────────────────────────────
  IF p_new_status = 'cancelled' THEN
    PERFORM public.release_inventory_for_order(p_order_id, p_changed_by);
  END IF;

  IF p_new_status = 'delivered' THEN
    PERFORM public.commit_inventory_for_order(p_order_id, p_changed_by);

    -- Advance fulfillment status
    UPDATE public.orders
       SET fulfillment_status = 'delivered'
     WHERE id = p_order_id;
  END IF;

  IF p_new_status IN ('shipped', 'processing') THEN
    UPDATE public.orders
       SET fulfillment_status = p_new_status::text::public.fulfillment_status
     WHERE id = p_order_id;
  END IF;
END;
$$;

-- ============================================================
-- REPLACE create_order_atomic WITH MOVEMENT-RECORDING VERSION
-- ============================================================
-- Adds inventory movement records for each reservation.
CREATE OR REPLACE FUNCTION public.create_order_atomic(
  p_user_id          uuid,
  p_cart_items       jsonb,
  p_subtotal         numeric,
  p_tax              numeric,
  p_shipping         numeric,
  p_discount         numeric,
  p_total            numeric,
  p_coupon_id        uuid,
  p_coupon_code      text,
  p_shipping_address jsonb,
  p_billing_address  jsonb,
  p_notes            text
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_item         jsonb;
  v_variant_id   uuid;
  v_quantity     integer;
  v_available    integer;
  v_prev_qty     integer;
  v_prev_res     integer;
  v_order_id     uuid;
  v_order_number text;
BEGIN
  -- ── Step 1 & 2: Lock inventory rows and validate stock ────────────────────
  FOR v_item IN
    SELECT value FROM jsonb_array_elements(p_cart_items)
    ORDER BY value->>'variant_id'
  LOOP
    v_variant_id := (v_item->>'variant_id')::uuid;
    v_quantity   := (v_item->>'quantity')::integer;

    SELECT (quantity - reserved)
      INTO v_available
      FROM public.inventory
     WHERE variant_id = v_variant_id
       FOR UPDATE;

    IF v_available IS NULL THEN
      RAISE EXCEPTION 'Inventory record not found for variant %', v_variant_id
        USING ERRCODE = 'P0002';
    END IF;

    IF v_available < v_quantity THEN
      RAISE EXCEPTION 'Insufficient stock: % available, % requested for variant %',
        v_available, v_quantity, v_variant_id
        USING ERRCODE = 'P0001';
    END IF;
  END LOOP;

  -- ── Step 3: Re-validate coupon under lock ─────────────────────────────────
  IF p_coupon_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.coupons
       WHERE id = p_coupon_id
         AND usage_limit IS NOT NULL
         AND used_count >= usage_limit
    ) THEN
      RAISE EXCEPTION 'Coupon usage limit exceeded' USING ERRCODE = 'P0003';
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.coupon_usage
       WHERE coupon_id = p_coupon_id AND user_id = p_user_id
    ) THEN
      RAISE EXCEPTION 'Coupon already used by this user' USING ERRCODE = 'P0004';
    END IF;
  END IF;

  -- ── Step 4: Generate order number ─────────────────────────────────────────
  SELECT public.generate_order_number() INTO v_order_number;

  -- ── Step 5: Insert order ──────────────────────────────────────────────────
  INSERT INTO public.orders (
    order_number, user_id, status,
    subtotal, tax, shipping, discount, total,
    coupon_id, coupon_code,
    shipping_address, billing_address, notes
  ) VALUES (
    v_order_number, p_user_id, 'pending_payment',
    p_subtotal, p_tax, p_shipping, p_discount, p_total,
    p_coupon_id, p_coupon_code,
    p_shipping_address, p_billing_address, p_notes
  )
  RETURNING id INTO v_order_id;

  -- ── Step 6: Insert order items (bulk) ─────────────────────────────────────
  INSERT INTO public.order_items (
    order_id, variant_id, product_name, sku,
    quantity, unit_price, total, snapshot
  )
  SELECT
    v_order_id,
    (item->>'variant_id')::uuid,
    item->>'product_name',
    item->>'sku',
    (item->>'quantity')::integer,
    (item->>'unit_price')::numeric,
    (item->>'unit_price')::numeric * (item->>'quantity')::integer,
    item->'snapshot'
  FROM jsonb_array_elements(p_cart_items) AS item;

  -- ── Step 7: Reserve inventory + record movements ──────────────────────────
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_cart_items) LOOP
    v_variant_id := (v_item->>'variant_id')::uuid;
    v_quantity   := (v_item->>'quantity')::integer;

    SELECT quantity, reserved INTO v_prev_qty, v_prev_res
      FROM public.inventory WHERE variant_id = v_variant_id;

    UPDATE public.inventory
       SET reserved = reserved + v_quantity
     WHERE variant_id = v_variant_id;

    PERFORM public.record_inventory_movement(
      v_variant_id,
      'sale'::public.inventory_movement_type,
      v_quantity,
      v_prev_res,
      v_prev_res + v_quantity,
      'order',
      v_order_id,
      'Stock reserved for new order',
      p_user_id
    );
  END LOOP;

  -- ── Step 8: Consume coupon ────────────────────────────────────────────────
  IF p_coupon_id IS NOT NULL THEN
    UPDATE public.coupons SET used_count = used_count + 1 WHERE id = p_coupon_id;
    INSERT INTO public.coupon_usage (coupon_id, user_id, order_id)
    VALUES (p_coupon_id, p_user_id, v_order_id);
  END IF;

  -- ── Step 9: Initial status history ───────────────────────────────────────
  INSERT INTO public.order_status_history (order_id, from_status, to_status, changed_by)
  VALUES (v_order_id, NULL, 'pending_payment', p_user_id);

  RETURN v_order_id;
END;
$$;
