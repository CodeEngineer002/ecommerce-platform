-- ══════════════════════════════════════════════════════════════════════════════
-- Migration: 00044_fix_inventory_lifecycle
--
-- Purpose:  Fix two related inventory accounting bugs that crept in when
--           migration 00038 replaced update_order_status:
--
--   BUG-A  commit_inventory_for_order (00006) still targets the LEGACY
--          `inventory` table, not `inventory_levels`. It was never called
--          after migration 00017 unified inventory into `inventory_levels`.
--          Result: delivered orders never deduct stock; `reserved` and
--          `quantity` on inventory_levels accumulate forever.
--
--   BUG-B  update_order_status (00038) removed the inventory side-effects
--          that migration 00023 had wired in.
--          Result:
--            • admin cancel  → reservation NOT released
--            • Stripe failure → reservation NOT released
--            • order deliver → stock NOT committed
--
-- Fix:
--   1. Rewrite commit_inventory_for_order to use `inventory_levels`
--      (consistent with create_order_atomic (00017), cancel_order (00043),
--      and release_inventory_reservation (00017)).
--
--   2. Re-add inventory side-effects to update_order_status:
--        delivered          → commit_inventory_for_order  (hard – fails tx on error)
--        cancelled / failed → release_inventory_reservation (soft – warns, not fails)
--
-- No API or frontend changes required. All callers already invoke the right
-- RPC at the right time; this migration simply makes the RPC do the right work.
-- ══════════════════════════════════════════════════════════════════════════════


-- ── Part A: Rewrite commit_inventory_for_order ────────────────────────────────
--
-- Deducts actual stock from inventory_levels when an order is delivered:
--   quantity -= order_qty   (physical stock leaves warehouse)
--   reserved -= order_qty   (reservation is consumed, not just released)
--
-- Both columns change by the same amount so that customer-visible available
-- stock (quantity − reserved) does NOT change at the moment of delivery —
-- it was already reduced at order placement. This is the standard ecommerce
-- inventory lifecycle:
--
--   Order placed  → reserved += qty             (available shown to others ↓)
--   Order delivered → quantity -= qty
--                   + reserved -= qty           (internal accounting clean-up)
--   Order cancelled → reserved -= qty           (available shown to others ↑)
--
CREATE OR REPLACE FUNCTION public.commit_inventory_for_order(
  p_order_id  uuid,
  p_actor_id  uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item              RECORD;
  v_default_warehouse uuid;
  v_prev_qty          integer;
  v_prev_reserved     integer;
BEGIN
  -- Resolve the default warehouse — same logic as create_order_atomic and cancel_order.
  SELECT id INTO v_default_warehouse
    FROM public.warehouses
   WHERE is_default = true
     AND is_active  = true
   LIMIT 1;

  IF v_default_warehouse IS NULL THEN
    -- Warehouse misconfiguration: warn but do not block the delivery transition.
    -- The order status will still be updated to 'delivered'; an ops alert should
    -- be raised to manually reconcile stock.
    RAISE WARNING
      'commit_inventory_for_order: no default warehouse configured; '
      'inventory NOT committed for order %', p_order_id;
    RETURN;
  END IF;

  FOR v_item IN
    SELECT oi.variant_id, oi.quantity
      FROM public.order_items oi
     WHERE oi.order_id        = p_order_id
       AND oi.variant_id IS NOT NULL
  LOOP
    -- Lock the row to prevent concurrent modifications (e.g. another delivery
    -- or an admin stock adjustment running at the same time).
    SELECT il.quantity, il.reserved
      INTO v_prev_qty, v_prev_reserved
      FROM public.inventory_levels il
     WHERE il.variant_id   = v_item.variant_id
       AND il.warehouse_id = v_default_warehouse
       FOR UPDATE;

    IF NOT FOUND THEN
      -- Variant has no stock row in this warehouse. This should not happen in
      -- normal operation (create_order_atomic would have blocked the order),
      -- but guard defensively instead of aborting the delivery.
      RAISE WARNING
        'commit_inventory_for_order: no inventory_levels row for variant % '
        'in default warehouse; skipping', v_item.variant_id;
      CONTINUE;
    END IF;

    -- Deduct physical quantity and release reservation atomically.
    -- GREATEST(0, …) prevents negative values from concurrent edge-cases.
    UPDATE public.inventory_levels
       SET quantity   = GREATEST(0, quantity - v_item.quantity),
           reserved   = GREATEST(0, reserved - v_item.quantity),
           updated_at = now()
     WHERE variant_id   = v_item.variant_id
       AND warehouse_id = v_default_warehouse;

    -- Append an audit record for the inventory movement ledger.
    -- Uses the canonical column set established in migrations 00001 + 00006.
    INSERT INTO public.inventory_movements (
      variant_id,
      type,
      quantity,
      previous_quantity,
      new_quantity,
      source_type,
      source_id,
      reference_id,
      note,
      created_by
    ) VALUES (
      v_item.variant_id,
      'sale'::public.inventory_movement_type,
      v_item.quantity,
      v_prev_qty,
      GREATEST(0, v_prev_qty - v_item.quantity),
      'order',
      p_order_id,
      p_order_id,
      'Stock committed on order delivery',
      p_actor_id
    );
  END LOOP;
END;
$$;


-- ── Part B: Restore inventory side-effects in update_order_status ─────────────
--
-- Adds two inventory hooks after the orders UPDATE, restoring the behaviour
-- that migration 00023 had and migration 00038 accidentally dropped:
--
--   p_new_status = 'delivered'           → commit_inventory_for_order
--   p_new_status IN ('cancelled','failed') → release_inventory_reservation
--
-- The full function body is reproduced here because CREATE OR REPLACE requires
-- the complete definition; only the inventory block (clearly marked) is new.
--
CREATE OR REPLACE FUNCTION public.update_order_status(
  p_order_id   uuid,
  p_new_status public.order_status,
  p_changed_by text     DEFAULT NULL,
  p_reason     text     DEFAULT NULL,
  p_source     text     DEFAULT 'system'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_status public.order_status;
  v_source         text := COALESCE(p_source, 'system');
BEGIN
  -- Lock the row to prevent concurrent transitions
  SELECT status INTO v_current_status
    FROM public.orders
   WHERE id = p_order_id
     FOR UPDATE;

  IF v_current_status IS NULL THEN
    RAISE EXCEPTION 'Order % not found', p_order_id USING ERRCODE = 'P0005';
  END IF;

  -- Idempotency: no-op if already in target state
  IF v_current_status = p_new_status THEN
    RETURN;
  END IF;

  -- ── State machine transition validation ──────────────────────────────────────
  -- Identical to migration 00038 — no changes to allowed transitions.
  IF NOT (
    -- Payment / creation flow
    (v_current_status = 'draft'              AND p_new_status IN ('pending', 'pending_payment', 'cancelled')) OR
    (v_current_status = 'pending'            AND p_new_status IN ('confirmed', 'pending_payment', 'cancelled')) OR
    (v_current_status = 'pending_payment'    AND p_new_status IN ('confirmed', 'cancelled', 'failed')) OR
    -- Fulfilment flow
    (v_current_status = 'confirmed'          AND p_new_status IN ('processing', 'cancelled')) OR
    (v_current_status = 'processing'         AND p_new_status IN ('packed', 'shipped', 'cancelled')) OR
    (v_current_status = 'packed'             AND p_new_status IN ('shipped', 'cancelled')) OR
    (v_current_status = 'shipped'            AND p_new_status IN ('out_for_delivery', 'delivered', 'cancelled')) OR
    (v_current_status = 'out_for_delivery'   AND p_new_status = 'delivered') OR
    -- Post-delivery
    (v_current_status = 'delivered'          AND p_new_status IN (
        'return_requested', 'replacement_requested', 'refund_requested',
        'partially_returned', 'partially_refunded', 'refunded')) OR
    -- Return flow
    (v_current_status = 'return_requested'   AND p_new_status IN ('return_approved', 'return_rejected')) OR
    (v_current_status = 'return_approved'    AND p_new_status = 'return_in_transit') OR
    (v_current_status = 'return_in_transit'  AND p_new_status = 'returned') OR
    (v_current_status = 'returned'           AND p_new_status IN ('refunded', 'replacement_shipped')) OR
    -- Replacement flow (new architecture: migration 00036+)
    (v_current_status = 'replacement_requested' AND p_new_status IN ('replacement_approved', 'replacement_rejected')) OR
    (v_current_status = 'replacement_approved'  AND p_new_status = 'delivered') OR
    -- Legacy path kept for any parent orders created before migration 00036
    (v_current_status = 'replacement_shipped'   AND p_new_status = 'replacement_delivered') OR
    -- Rejection reverts to delivered (both return and replacement)
    (v_current_status = 'return_rejected'        AND p_new_status = 'delivered') OR
    (v_current_status = 'replacement_rejected'   AND p_new_status = 'delivered') OR
    -- Refund flow
    (v_current_status = 'refund_requested'   AND p_new_status = 'refund_processing') OR
    (v_current_status = 'refund_processing'  AND p_new_status IN ('refunded', 'partially_refunded')) OR
    -- Partial states
    (v_current_status = 'partially_returned' AND p_new_status IN (
        'return_requested', 'replacement_requested', 'refund_requested',
        'refunded', 'partially_refunded')) OR
    (v_current_status = 'partially_refunded' AND p_new_status = 'refunded') OR
    -- Terminal transitions
    (v_current_status = 'cancelled'          AND p_new_status = 'refunded') OR
    (v_current_status = 'failed'             AND p_new_status = 'pending_payment')
  ) THEN
    RAISE EXCEPTION 'Invalid status transition: % -> %', v_current_status, p_new_status
      USING ERRCODE = 'P0006';
  END IF;

  -- ── Apply transition ─────────────────────────────────────────────────────────
  UPDATE public.orders
     SET status     = p_new_status,
         updated_at = now()
   WHERE id = p_order_id;

  -- ── Record in status history ─────────────────────────────────────────────────
  INSERT INTO public.order_status_history (order_id, from_status, to_status, changed_by, reason)
  VALUES (p_order_id, v_current_status, p_new_status, p_changed_by::uuid, p_reason);

  -- ════════════════════════════════════════════════════════════════════════════
  -- NEW (migration 00044): Inventory side-effects — restored from 00023,
  -- accidentally removed in 00038.
  --
  --   delivered   → commit_inventory_for_order
  --                 Hard failure: if stock commit fails the delivery is not
  --                 confirmed (transaction rolls back). This is intentional —
  --                 silent inventory corruption is worse than a retry prompt.
  --
  --   cancelled   → release_inventory_reservation
  --   failed      → release_inventory_reservation
  --                 Soft failure: wrapped in EXCEPTION so that a warehouse
  --                 misconfiguration can never block an admin from cancelling
  --                 an order. A WARNING is emitted instead.
  --
  -- Double-release safety:
  --   The customer-cancel path uses cancel_order (00043) which updates
  --   orders.status directly without calling update_order_status. So
  --   there is NO scenario where both functions run for the same order.
  --   The idempotency guard at the top (current = new → RETURN) also
  --   prevents any second invocation from reaching this block.
  -- ════════════════════════════════════════════════════════════════════════════
  IF p_new_status = 'delivered' THEN

    -- NULLIF guard converts empty string to NULL before casting to uuid.
    PERFORM public.commit_inventory_for_order(
      p_order_id,
      NULLIF(p_changed_by, '')::uuid
    );

  ELSIF p_new_status IN ('cancelled', 'failed') THEN

    BEGIN
      PERFORM public.release_inventory_reservation(p_order_id);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING
        'update_order_status: inventory release skipped for order % (status → %): %',
        p_order_id, p_new_status, SQLERRM;
    END;

  END IF;

END;
$$;
