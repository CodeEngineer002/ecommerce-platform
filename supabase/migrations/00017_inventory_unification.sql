-- ============================================================
-- MIGRATION 00017 — INVENTORY UNIFICATION
-- ============================================================
-- Problem: Two parallel inventory tables existed:
--   - inventory (variant_id, quantity, reserved) — used by create_order_atomic
--   - inventory_levels (warehouse_id, variant_id, quantity, reserved) — used by admin UI
-- This caused stockout calculations to diverge silently.
--
-- Fix: inventory_levels is now the single source of truth.
--   1. Migrate existing inventory rows into inventory_levels (default warehouse)
--   2. Rewrite create_order_atomic to use inventory_levels
--   3. Rewrite available_inventory() to aggregate from inventory_levels
--   4. Add release_inventory_reservation() for order cancellations
-- ============================================================

-- ── Step 1: Migrate existing inventory data to inventory_levels ───────────────
-- Copies all rows from the legacy inventory table into inventory_levels
-- scoped to the default warehouse. ON CONFLICT: takes the higher quantity
-- to avoid overwriting legitimate multi-warehouse stock already seeded.
DO $migration$
DECLARE
  v_default_wh_id uuid;
BEGIN
  SELECT id INTO v_default_wh_id
    FROM public.warehouses
   WHERE is_default = true AND is_active = true
   LIMIT 1;

  IF v_default_wh_id IS NULL THEN
    RAISE EXCEPTION 'No active default warehouse found. Create one before running this migration.';
  END IF;

  INSERT INTO public.inventory_levels (warehouse_id, variant_id, quantity, reserved)
  SELECT v_default_wh_id, variant_id, quantity, reserved
    FROM public.inventory
   ON CONFLICT (warehouse_id, variant_id)
   DO UPDATE SET
     quantity = GREATEST(EXCLUDED.quantity, public.inventory_levels.quantity),
     reserved = GREATEST(EXCLUDED.reserved, public.inventory_levels.reserved);
END;
$migration$;

-- ── Step 2: Rewrite available_inventory() ────────────────────────────────────
-- Aggregates available stock across all active warehouses for a variant.
-- This is the public-facing availability number (used in product pages, etc.)
CREATE OR REPLACE FUNCTION public.available_inventory(p_variant_id uuid)
RETURNS integer
LANGUAGE sql STABLE
AS $$
  SELECT COALESCE(SUM(il.quantity - il.reserved)::integer, 0)
    FROM public.inventory_levels il
    JOIN public.warehouses w ON w.id = il.warehouse_id
   WHERE il.variant_id = p_variant_id
     AND w.is_active = true;
$$;

-- ── Step 3: Rewrite create_order_atomic to use inventory_levels ───────────────
-- All inventory locks, validations, and reservations now happen against
-- inventory_levels using the default warehouse.
CREATE OR REPLACE FUNCTION public.create_order_atomic(
  p_user_id          uuid,
  p_cart_items       jsonb,   -- [{variant_id, quantity, unit_price, product_name, sku, snapshot}]
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
  v_item                 jsonb;
  v_variant_id           uuid;
  v_quantity             integer;
  v_available            integer;
  v_order_id             uuid;
  v_order_number         text;
  v_default_warehouse_id uuid;
BEGIN
  -- ── Resolve default warehouse ─────────────────────────────────────────────
  SELECT id INTO v_default_warehouse_id
    FROM public.warehouses
   WHERE is_default = true AND is_active = true
   LIMIT 1;

  IF v_default_warehouse_id IS NULL THEN
    RAISE EXCEPTION 'No default warehouse configured. Cannot create order.'
      USING errcode = 'P0010';
  END IF;

  -- ── Step 1 & 2: Lock inventory_levels rows and validate stock ─────────────
  -- Rows locked in variant_id order — prevents deadlocks when two transactions
  -- share overlapping cart items.
  FOR v_item IN
    SELECT value
      FROM jsonb_array_elements(p_cart_items)
     ORDER BY value->>'variant_id'
  LOOP
    v_variant_id := (v_item->>'variant_id')::uuid;
    v_quantity   := (v_item->>'quantity')::integer;

    SELECT (il.quantity - il.reserved)
      INTO v_available
      FROM public.inventory_levels il
     WHERE il.variant_id   = v_variant_id
       AND il.warehouse_id = v_default_warehouse_id
       FOR UPDATE;

    IF v_available IS NULL THEN
      RAISE EXCEPTION 'Inventory record not found for variant %', v_variant_id
        USING errcode = 'P0002';
    END IF;

    IF v_available < v_quantity THEN
      RAISE EXCEPTION 'Insufficient stock: % available, % requested for variant %',
        v_available, v_quantity, v_variant_id
        USING errcode = 'P0001';
    END IF;
  END LOOP;

  -- ── Step 3: Re-validate coupon under transaction lock ─────────────────────
  IF p_coupon_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.coupons
       WHERE id = p_coupon_id
         AND usage_limit IS NOT NULL
         AND used_count >= usage_limit
    ) THEN
      RAISE EXCEPTION 'Coupon usage limit exceeded'
        USING errcode = 'P0003';
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.coupon_usage
       WHERE coupon_id = p_coupon_id AND user_id = p_user_id
    ) THEN
      RAISE EXCEPTION 'Coupon already used by this user'
        USING errcode = 'P0004';
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
    v_order_number, p_user_id, 'pending',
    p_subtotal, p_tax, p_shipping, p_discount, p_total,
    p_coupon_id, p_coupon_code,
    p_shipping_address, p_billing_address, p_notes
  )
  RETURNING id INTO v_order_id;

  -- ── Step 6: Insert order items (single bulk statement) ───────────────────
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

  -- ── Step 7: Reserve inventory in inventory_levels ─────────────────────────
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_cart_items) LOOP
    UPDATE public.inventory_levels
       SET reserved = reserved + (v_item->>'quantity')::integer
     WHERE variant_id   = (v_item->>'variant_id')::uuid
       AND warehouse_id = v_default_warehouse_id;
  END LOOP;

  -- ── Step 8: Consume coupon ────────────────────────────────────────────────
  IF p_coupon_id IS NOT NULL THEN
    UPDATE public.coupons
       SET used_count = used_count + 1
     WHERE id = p_coupon_id;

    INSERT INTO public.coupon_usage (coupon_id, user_id, order_id)
    VALUES (p_coupon_id, p_user_id, v_order_id);
  END IF;

  -- ── Step 9: Initial status history ───────────────────────────────────────
  INSERT INTO public.order_status_history (order_id, from_status, to_status, changed_by)
  VALUES (v_order_id, NULL, 'pending', p_user_id);

  RETURN v_order_id;
END;
$$;

-- ── Step 4: Add release_inventory_reservation() ───────────────────────────────
-- Called when an order is cancelled to free reserved stock back to available.
-- Must be called explicitly from the cancel route — not a trigger, so the
-- caller controls exactly when reservation is released.
CREATE OR REPLACE FUNCTION public.release_inventory_reservation(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_item                 record;
  v_default_warehouse_id uuid;
BEGIN
  SELECT id INTO v_default_warehouse_id
    FROM public.warehouses
   WHERE is_default = true AND is_active = true
   LIMIT 1;

  IF v_default_warehouse_id IS NULL THEN
    RAISE EXCEPTION 'No default warehouse configured'
      USING errcode = 'P0010';
  END IF;

  FOR v_item IN
    SELECT variant_id, quantity
      FROM public.order_items
     WHERE order_id = p_order_id
  LOOP
    UPDATE public.inventory_levels
       SET reserved = GREATEST(0, reserved - v_item.quantity)
     WHERE variant_id   = v_item.variant_id
       AND warehouse_id = v_default_warehouse_id;
  END LOOP;
END;
$$;

-- ── Step 5: Wire release into update_order_status ────────────────────────────
-- Extend the existing status transition function to automatically release
-- reserved inventory whenever an order moves to 'cancelled' or 'failed'.
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
      USING errcode = 'P0005';
  END IF;

  IF NOT (
    (v_current_status = 'pending'    AND p_new_status IN ('confirmed', 'cancelled')) OR
    (v_current_status = 'confirmed'  AND p_new_status IN ('processing', 'cancelled')) OR
    (v_current_status = 'processing' AND p_new_status IN ('shipped',   'cancelled')) OR
    (v_current_status = 'shipped'    AND p_new_status IN ('delivered', 'cancelled')) OR
    (v_current_status = 'delivered'  AND p_new_status = 'refunded') OR
    (v_current_status = 'cancelled'  AND p_new_status = 'refunded')
  ) THEN
    RAISE EXCEPTION 'Invalid status transition: % -> %', v_current_status, p_new_status
      USING errcode = 'P0006';
  END IF;

  UPDATE public.orders
     SET status = p_new_status, updated_at = now()
   WHERE id = p_order_id;

  INSERT INTO public.order_status_history (order_id, from_status, to_status, changed_by, reason)
  VALUES (p_order_id, v_current_status, p_new_status, p_changed_by, p_reason);

  -- Release reserved inventory when order is cancelled or failed
  IF p_new_status IN ('cancelled', 'failed') THEN
    PERFORM public.release_inventory_reservation(p_order_id);
  END IF;
END;
$$;
