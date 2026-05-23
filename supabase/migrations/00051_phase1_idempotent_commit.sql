-- ============================================================================
-- Migration 00051: Phase 1.5 — Idempotent commit_inventory_for_order
-- ============================================================================
--
-- WHY:
--   commit_inventory_for_order does a hard `quantity -= qty, reserved -= qty`
--   for every order_item. If it ever runs twice for the same order, stock is
--   double-deducted. Today protection is INDIRECT: update_order_status has an
--   "already in target state → RETURN" idempotency check at the top, which
--   prevents the function from being re-called via that path. BUT:
--
--     • Future code or a manual admin script could call the function
--       directly, bypassing update_order_status entirely.
--     • A retry-after-error scenario (network drop mid-commit) could trigger
--       it twice if state changes were partially applied.
--     • Migration backfills (like 00048) could collide with future runs.
--
-- DESIGN:
--   1. Add column `orders.inventory_committed_at timestamptz`. NULL = never
--      committed. NOT NULL = committed once at this timestamp.
--   2. Backfill: for any order that already has at least one 'sale' inventory
--      movement, set inventory_committed_at to the movement's created_at.
--      This covers historical commits AND the 00048 backfill row.
--   3. Make commit_inventory_for_order:
--        a. SELECT … FOR UPDATE on orders to serialize.
--        b. RETURN immediately if inventory_committed_at IS NOT NULL.
--        c. Do the commit work (UPDATE inventory_levels + INSERT movements).
--        d. SET orders.inventory_committed_at = now() at the end.
--
-- IDEMPOTENCY OF THIS MIGRATION:
--   ADD COLUMN IF NOT EXISTS + idempotent UPDATE + CREATE OR REPLACE FUNCTION.
--   Safe to re-run.
-- ============================================================================

-- ── Part 1: schema column ────────────────────────────────────────────────────
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS inventory_committed_at timestamptz;

-- ── Part 2: backfill from existing inventory_movements ───────────────────────
-- For each order that has at least one 'sale' movement, set the column.
-- Uses the earliest movement timestamp per order.
UPDATE public.orders o
   SET inventory_committed_at = sub.first_committed_at
  FROM (
    SELECT source_id AS order_id, MIN(created_at) AS first_committed_at
      FROM public.inventory_movements
     WHERE source_type = 'order'
       AND type = 'sale'::public.inventory_movement_type
     GROUP BY source_id
  ) sub
 WHERE sub.order_id = o.id
   AND o.inventory_committed_at IS NULL;

-- ── Part 3: rewrite commit_inventory_for_order with idempotency guard ────────
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
  v_already_committed timestamptz;
BEGIN
  -- ── Idempotency guard: take lock + check the marker ─────────────────────
  SELECT inventory_committed_at INTO v_already_committed
    FROM public.orders
   WHERE id = p_order_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'commit_inventory_for_order: order % not found', p_order_id
      USING ERRCODE = 'P0005';
  END IF;

  IF v_already_committed IS NOT NULL THEN
    -- Already committed once. Silent no-op — this is the correct behaviour
    -- for retries and double-fire scenarios.
    RETURN;
  END IF;

  -- ── Resolve default warehouse ───────────────────────────────────────────
  SELECT id INTO v_default_warehouse
    FROM public.warehouses
   WHERE is_default = true AND is_active = true
   LIMIT 1;

  IF v_default_warehouse IS NULL THEN
    -- Same soft behaviour as 00044: warn, do not block the delivery.
    RAISE WARNING
      'commit_inventory_for_order: no default warehouse configured; '
      'inventory NOT committed for order %', p_order_id;
    -- Intentionally do NOT set inventory_committed_at — we want a retry
    -- after warehouse fix to actually commit.
    RETURN;
  END IF;

  -- ── Decrement stock per order_item ──────────────────────────────────────
  FOR v_item IN
    SELECT oi.variant_id, oi.quantity
      FROM public.order_items oi
     WHERE oi.order_id = p_order_id
       AND oi.variant_id IS NOT NULL
  LOOP
    SELECT il.quantity, il.reserved
      INTO v_prev_qty, v_prev_reserved
      FROM public.inventory_levels il
     WHERE il.variant_id   = v_item.variant_id
       AND il.warehouse_id = v_default_warehouse
       FOR UPDATE;

    IF NOT FOUND THEN
      RAISE WARNING
        'commit_inventory_for_order: no inventory_levels row for variant % '
        'in default warehouse; skipping', v_item.variant_id;
      CONTINUE;
    END IF;

    UPDATE public.inventory_levels
       SET quantity   = GREATEST(0, quantity - v_item.quantity),
           reserved   = GREATEST(0, reserved - v_item.quantity),
           updated_at = now()
     WHERE variant_id   = v_item.variant_id
       AND warehouse_id = v_default_warehouse;

    INSERT INTO public.inventory_movements (
      variant_id, type, quantity, previous_quantity, new_quantity,
      source_type, source_id, reference_id, note, created_by
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

  -- ── Mark order as committed ─────────────────────────────────────────────
  UPDATE public.orders
     SET inventory_committed_at = now()
   WHERE id = p_order_id;
END;
$$;
