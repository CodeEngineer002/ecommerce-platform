-- ============================================================================
-- Migration 00048: Phase 1.1 — Backfill historical inventory drift
-- ============================================================================
--
-- CONTEXT (Phase 0 audit 2026-05-23):
--   Two orders processed during the 00038→00044 deploy window had no inventory
--   side-effects because update_order_status had its inventory hooks stripped:
--
--     • Order 947f58c7 (purchase, cancelled 2026-05-16):
--         Reserved 1 unit of variant 5bd32f5b, was never released on cancel.
--         Effect: inventory_levels.reserved is overstated by 1.
--
--     • Order 96d15822 (replacement, delivered 2026-05-18):
--         Reserved 1 unit of variant 5bd32f5b at replacement-creation, was
--         never committed on delivery (legacy update_order_status no-op).
--         Effect: quantity AND reserved overstated by 1.
--
--   Net drift on variant 5bd32f5b: quantity overstated by 1, reserved
--   overstated by 2.
--
--   Going forward (post-00044) all delivers/cancels correctly trigger
--   inventory hooks; this migration only repairs the historical rows.
--
-- IDEMPOTENCY:
--   Each backfill row carries a unique note prefix 'phase1-backfill:'. Before
--   inserting we check for an existing movement with that note and source_id.
--   Safe to re-run.
--
-- VERIFICATION:
--   Post-apply, variant 5bd32f5b should read:
--     quantity = 19  (was 20, -1 for delivery)
--     reserved =  3  (was 5,  -2 for cancel + delivery)
--     available = 16
-- ============================================================================

DO $$
DECLARE
  v_variant_id       uuid := '5bd32f5b-1733-4dd1-8616-c525deadf641';
  v_warehouse_id     uuid;
  v_cancel_order_id  uuid := '947f58c7-1d2f-4220-9d65-3cbdd792a124';
  v_deliver_order_id uuid := '96d15822-74ed-4909-a88f-c4c411324150';
  v_prev_qty         integer;
  v_prev_reserved    integer;
BEGIN
  -- Resolve default warehouse (same logic as create_order_atomic / cancel_order)
  SELECT id INTO v_warehouse_id
    FROM public.warehouses
   WHERE is_default = true AND is_active = true
   LIMIT 1;

  IF v_warehouse_id IS NULL THEN
    RAISE EXCEPTION 'No default warehouse configured; cannot backfill.';
  END IF;

  -- ── Lock the inventory row to prevent racing with live orders ────────────
  SELECT quantity, reserved
    INTO v_prev_qty, v_prev_reserved
    FROM public.inventory_levels
   WHERE variant_id = v_variant_id AND warehouse_id = v_warehouse_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'inventory_levels row for variant % not found in default warehouse', v_variant_id;
  END IF;

  -- =========================================================================
  -- Part A: Release reservation for cancelled order 947f58c7
  -- =========================================================================
  IF NOT EXISTS (
    SELECT 1 FROM public.inventory_movements
     WHERE source_id = v_cancel_order_id
       AND type = 'adjustment'::public.inventory_movement_type
       AND note LIKE 'phase1-backfill:%'
  ) THEN
    UPDATE public.inventory_levels
       SET reserved   = GREATEST(0, reserved - 1),
           updated_at = now()
     WHERE variant_id = v_variant_id AND warehouse_id = v_warehouse_id;

    INSERT INTO public.inventory_movements
      (variant_id, type, quantity, previous_quantity, new_quantity,
       source_type, source_id, reference_id, note, created_by)
    VALUES
      (v_variant_id,
       'adjustment'::public.inventory_movement_type,
       1,
       v_prev_qty,               -- quantity unchanged (this is a reserve release)
       v_prev_qty,
       'order',
       v_cancel_order_id,
       v_cancel_order_id,
       'phase1-backfill: reservation released for cancelled order (drift from 00038-00044 window)',
       NULL);

    -- Update locals for next step
    v_prev_reserved := v_prev_reserved - 1;
  ELSE
    RAISE NOTICE 'Cancel-release backfill for order % already applied — skipping', v_cancel_order_id;
  END IF;

  -- =========================================================================
  -- Part B: Commit stock for replacement-delivered order 96d15822
  -- =========================================================================
  IF NOT EXISTS (
    SELECT 1 FROM public.inventory_movements
     WHERE source_id = v_deliver_order_id
       AND type = 'sale'::public.inventory_movement_type
       AND note LIKE 'phase1-backfill:%'
  ) THEN
    UPDATE public.inventory_levels
       SET quantity   = GREATEST(0, quantity - 1),
           reserved   = GREATEST(0, reserved - 1),
           updated_at = now()
     WHERE variant_id = v_variant_id AND warehouse_id = v_warehouse_id;

    INSERT INTO public.inventory_movements
      (variant_id, type, quantity, previous_quantity, new_quantity,
       source_type, source_id, reference_id, note, created_by)
    VALUES
      (v_variant_id,
       'sale'::public.inventory_movement_type,
       1,
       v_prev_qty,
       GREATEST(0, v_prev_qty - 1),
       'order',
       v_deliver_order_id,
       v_deliver_order_id,
       'phase1-backfill: stock committed for replacement-delivered order (drift from 00038-00044 window)',
       NULL);
  ELSE
    RAISE NOTICE 'Delivery-commit backfill for order % already applied — skipping', v_deliver_order_id;
  END IF;
END $$;
