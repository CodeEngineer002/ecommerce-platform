-- ============================================================================
-- Migration 00062: Path-A P0 RR-2 + RR-3 — Rejected-after-inspection unwind
-- ============================================================================
--
-- PROBLEM:
--   When a return is rejected AFTER inspection (item defective / abused),
--   today's mark_return_rejected_after_inspection() only updates the return
--   record's status. It does NOT:
--     RR-2: change the parent order status (left at whatever post-return
--           state it was in — return_in_transit, replacement_approved, etc.).
--     RR-3: reverse the auto-restock that mark_return_received did earlier
--           (the defective item is now counted as saleable stock — wrong).
--           Also doesn't cancel a pending replacement order if one was
--           created during approval — that replacement would still ship.
--
-- FIX:
--   On rejected_after_inspection:
--     1. Reverse the restock: subtract the same quantities from
--        inventory_levels (use GREATEST(0, …) to avoid negatives in edge
--        cases where the item was over-restocked). Insert reversal rows in
--        inventory_movements with note='rejected_after_inspection_unwind'.
--     2. Cancel any replacement order if this is a replacement request and
--        a replacement order was created. Releases its inventory reservation
--        via the existing cancel_order path.
--     3. Revert the parent order to 'delivered' (customer keeps the original
--        item or it gets disposed/RTO'd separately). Bypasses the state
--        machine because the return states aren't designed for this revert
--        path; we do a direct UPDATE + status_history + order_events row to
--        preserve the audit trail.
--
-- IDEMPOTENCY:
--   Function uses status guard (only proceeds from 'received' or 'inspected').
--   Restock reversal is keyed on the return's items, not on prior movements,
--   so a re-call after status change is rejected at the guard.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.mark_return_rejected_after_inspection(
  p_return_id uuid,
  p_admin_id  uuid,
  p_reason    text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_return            RECORD;
  v_parent_status     public.order_status;
  v_item              RECORD;
  v_warehouse_id      uuid;
  v_prev_qty          integer;
  v_replacement_id    uuid;
BEGIN
  -- Load + lock the return row
  SELECT id, order_id, status, request_type
    INTO v_return
    FROM public.order_returns
   WHERE id = p_return_id
     FOR UPDATE;

  IF v_return.id IS NULL THEN
    RAISE EXCEPTION 'Return request % not found', p_return_id USING ERRCODE = 'P0005';
  END IF;

  -- Must be in a post-receipt state to reject after inspection.
  IF v_return.status NOT IN ('inspected', 'received') THEN
    RAISE EXCEPTION 'Return can only be rejected after inspection from inspected/received status (current: %)',
      v_return.status USING ERRCODE = 'P0006';
  END IF;

  -- Resolve canonical order warehouse (single-warehouse mode — see 00055).
  SELECT public.current_order_warehouse_id() INTO v_warehouse_id;

  -- ── 1. Reverse the restock that mark_return_received auto-applied ───────
  -- For each return-item, decrement inventory_levels.quantity by the
  -- returned quantity. Defensive GREATEST(0, …) prevents going negative if
  -- someone manually adjusted stock in the meantime.
  IF v_warehouse_id IS NOT NULL THEN
    FOR v_item IN
      SELECT ori.quantity, oi.variant_id
        FROM public.order_return_items ori
        JOIN public.order_items oi ON oi.id = ori.order_item_id
       WHERE ori.return_id = p_return_id
         AND oi.variant_id IS NOT NULL
    LOOP
      SELECT quantity INTO v_prev_qty
        FROM public.inventory_levels
       WHERE variant_id = v_item.variant_id
         AND warehouse_id = v_warehouse_id
         FOR UPDATE;

      IF FOUND THEN
        UPDATE public.inventory_levels
           SET quantity   = GREATEST(0, quantity - v_item.quantity),
               updated_at = now()
         WHERE variant_id = v_item.variant_id
           AND warehouse_id = v_warehouse_id;

        INSERT INTO public.inventory_movements (
          variant_id, type, quantity, previous_quantity, new_quantity,
          source_type, source_id, reference_id, note, created_by
        ) VALUES (
          v_item.variant_id,
          'adjustment'::public.inventory_movement_type,
          v_item.quantity,
          v_prev_qty,
          GREATEST(0, v_prev_qty - v_item.quantity),
          'return',
          p_return_id,
          v_return.order_id,
          'rejected_after_inspection_unwind: restock reversed because item failed inspection',
          p_admin_id
        );
      END IF;
    END LOOP;
  END IF;

  -- ── 2. Cancel any replacement order linked to this return ───────────────
  IF v_return.request_type = 'replacement' THEN
    SELECT id INTO v_replacement_id
      FROM public.orders
     WHERE replacement_request_id = p_return_id
       AND order_type = 'replacement'
       AND status NOT IN ('cancelled', 'delivered')
     LIMIT 1;

    IF v_replacement_id IS NOT NULL THEN
      BEGIN
        PERFORM public.cancel_order(
          p_order_id   := v_replacement_id,
          p_user_id    := p_admin_id,
          p_reason     := 'Replacement cancelled: original return rejected after inspection',
          p_actor_type := 'admin'
        );
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Replacement order % cancel failed during reject-after-inspection: %',
          v_replacement_id, SQLERRM;
      END;
    END IF;
  END IF;

  -- ── 3. Update the return record ─────────────────────────────────────────
  UPDATE public.order_returns
     SET status      = 'rejected_after_inspection',
         reviewed_by = p_admin_id,
         reviewed_at = now(),
         review_note = p_reason,
         updated_at  = now()
   WHERE id = p_return_id;

  -- ── 4. Revert parent order to 'delivered' (audit-only direct update) ────
  -- Bypasses update_order_status because return-cycle states (return_in_transit,
  -- replacement_approved, etc.) don't have a clean transition back to delivered
  -- in the standard state machine. This is an admin override, audited via
  -- order_status_history + order_events.
  SELECT status INTO v_parent_status
    FROM public.orders
   WHERE id = v_return.order_id
     FOR UPDATE;

  IF v_parent_status IS NOT NULL AND v_parent_status <> 'delivered' THEN
    UPDATE public.orders
       SET status     = 'delivered',
           updated_at = now()
     WHERE id = v_return.order_id;

    INSERT INTO public.order_status_history (order_id, from_status, to_status, changed_by, reason)
    VALUES (v_return.order_id, v_parent_status, 'delivered',
            p_admin_id, 'Reverted after rejected_after_inspection: ' || p_reason);
  END IF;

  -- ── 5. Audit event ──────────────────────────────────────────────────────
  INSERT INTO public.order_events (
    order_id, event_type, actor_id, actor_type, description, metadata, source
  ) VALUES (
    v_return.order_id, 'return_rejected_after_inspection', p_admin_id, 'admin',
    'Return rejected after inspection — restock reversed, replacement cancelled, order reverted to delivered',
    jsonb_build_object(
      'return_id',           p_return_id,
      'reason',              p_reason,
      'request_type',        v_return.request_type,
      'parent_prev_status',  v_parent_status::text,
      'replacement_cancelled', v_replacement_id IS NOT NULL,
      'replacement_order_id', v_replacement_id
    ),
    'admin_override'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.mark_return_rejected_after_inspection(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_return_rejected_after_inspection(uuid, uuid, text)
  TO service_role;
