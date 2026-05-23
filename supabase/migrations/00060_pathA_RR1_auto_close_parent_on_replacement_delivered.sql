-- ============================================================================
-- Migration 00060: Path-A P0 RR-1 — auto-close parent + return on replacement delivery
-- ============================================================================
--
-- LIVE BUG EVIDENCE (2026-05-23):
--   replacement_order_id: 96d15822-…  (status='delivered')
--   parent_order_id:      475739c1-…  (status='replacement_delivered' — terminal, stuck)
--   return_id:            93409d81-…  (status='approved' — never closed)
--
--   The replacement child delivered correctly, but the parent and return
--   record were left in mid-air because no hook propagates the child's
--   delivery back up the chain.
--
-- FIX:
--   AFTER UPDATE trigger on orders. When a row with order_type='replacement'
--   transitions to status='delivered', it:
--     1. Transitions the parent order to 'delivered' (final terminal state).
--        Handles both new flow (parent at replacement_approved) and legacy
--        (parent at replacement_delivered).
--     2. Closes the linked order_returns row: approved | inspected | accepted
--        → 'replaced' (the terminal status for successful replacements).
--     3. Inserts a system order_event on the parent for audit.
--
-- IDEMPOTENCY:
--   The trigger fires only when NEW.status='delivered' AND OLD.status<>'delivered'.
--   update_order_status itself is idempotent for the parent if it already is
--   in 'delivered'. We add 'replacement_delivered → delivered' to the state
--   machine so legacy-state parents can be cleaned up; new-flow parents
--   already had 'replacement_approved → delivered' allowed.
--
-- BACKFILL:
--   At the end of this migration we manually run the same logic on the one
--   currently-stuck record.
-- ============================================================================

-- ── 1. Extend state machine: allow replacement_delivered → delivered ────────
-- Reuse the existing function (00056 emits events). Add the legacy transition.
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
  v_actor_uuid     uuid := NULLIF(p_changed_by, '')::uuid;
  v_event_type     text;
  v_recent_dup     boolean;
BEGIN
  SELECT status INTO v_current_status FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF v_current_status IS NULL THEN
    RAISE EXCEPTION 'Order % not found', p_order_id USING ERRCODE = 'P0005';
  END IF;
  IF v_current_status = p_new_status THEN
    RETURN;
  END IF;

  IF NOT (
    (v_current_status = 'draft'              AND p_new_status IN ('pending', 'pending_payment', 'cancelled')) OR
    (v_current_status = 'pending'            AND p_new_status IN ('confirmed', 'pending_payment', 'cancelled')) OR
    (v_current_status = 'pending_payment'    AND p_new_status IN ('confirmed', 'cancelled', 'failed')) OR
    (v_current_status = 'confirmed'          AND p_new_status IN ('processing', 'cancelled')) OR
    (v_current_status = 'processing'         AND p_new_status IN ('packed', 'shipped', 'cancelled')) OR
    (v_current_status = 'packed'             AND p_new_status IN ('shipped', 'cancelled')) OR
    (v_current_status = 'shipped'            AND p_new_status IN ('out_for_delivery', 'delivered', 'cancelled', 'delivery_refused')) OR
    (v_current_status = 'out_for_delivery'   AND p_new_status IN ('delivered', 'delivery_refused')) OR
    (v_current_status = 'delivery_refused'   AND p_new_status IN ('return_to_origin', 'cancelled')) OR
    (v_current_status = 'return_to_origin'   AND p_new_status = 'cancelled') OR
    (v_current_status = 'delivered'          AND p_new_status IN (
        'return_requested', 'replacement_requested', 'refund_requested',
        'partially_returned', 'partially_refunded', 'refunded')) OR
    (v_current_status = 'return_requested'   AND p_new_status IN ('return_approved', 'return_rejected')) OR
    (v_current_status = 'return_approved'    AND p_new_status = 'return_in_transit') OR
    (v_current_status = 'return_in_transit'  AND p_new_status = 'returned') OR
    (v_current_status = 'returned'           AND p_new_status IN ('refunded', 'replacement_shipped')) OR
    (v_current_status = 'replacement_requested' AND p_new_status IN ('replacement_approved', 'replacement_rejected')) OR
    (v_current_status = 'replacement_approved'  AND p_new_status = 'delivered') OR
    (v_current_status = 'replacement_shipped'   AND p_new_status = 'replacement_delivered') OR
    -- ★ Path-A RR-1: clean up legacy-flow parents stuck at replacement_delivered.
    (v_current_status = 'replacement_delivered' AND p_new_status = 'delivered') OR
    (v_current_status = 'return_rejected'        AND p_new_status = 'delivered') OR
    (v_current_status = 'replacement_rejected'   AND p_new_status = 'delivered') OR
    (v_current_status = 'refund_requested'   AND p_new_status = 'refund_processing') OR
    (v_current_status = 'refund_processing'  AND p_new_status IN ('refunded', 'partially_refunded')) OR
    (v_current_status = 'partially_returned' AND p_new_status IN (
        'return_requested', 'replacement_requested', 'refund_requested',
        'refunded', 'partially_refunded')) OR
    (v_current_status = 'partially_refunded' AND p_new_status = 'refunded') OR
    (v_current_status = 'cancelled'          AND p_new_status = 'refunded') OR
    (v_current_status = 'failed'             AND p_new_status = 'pending_payment')
  ) THEN
    RAISE EXCEPTION 'Invalid status transition: % -> %', v_current_status, p_new_status
      USING ERRCODE = 'P0006';
  END IF;

  IF p_new_status = 'delivered' THEN
    -- Phase 1.3 guard. Skip for legacy parents being cleaned up (they already
    -- have a fulfillment trail elsewhere — the replacement child).
    IF v_current_status NOT IN ('replacement_approved', 'replacement_delivered',
                                  'return_rejected', 'replacement_rejected') THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.order_fulfillments f
         WHERE f.order_id = p_order_id
           AND f.shipment_type = 'outbound_original'
           AND f.status IN ('shipped', 'out_for_delivery', 'delivered')
      ) THEN
        RAISE EXCEPTION
          'Cannot mark order % as delivered: no outbound shipment found.', p_order_id
          USING ERRCODE = 'P0020';
      END IF;
    END IF;
  END IF;

  UPDATE public.orders SET status = p_new_status, updated_at = now() WHERE id = p_order_id;

  INSERT INTO public.order_status_history (order_id, from_status, to_status, changed_by, reason)
  VALUES (p_order_id, v_current_status, p_new_status, v_actor_uuid, p_reason);

  v_event_type := 'order_' || p_new_status::text;
  SELECT EXISTS (
    SELECT 1 FROM public.order_events
     WHERE order_id = p_order_id AND event_type = v_event_type
       AND created_at > now() - INTERVAL '5 seconds'
  ) INTO v_recent_dup;

  IF NOT v_recent_dup THEN
    INSERT INTO public.order_events (
      order_id, event_type, actor_id, actor_type, description, metadata, source
    ) VALUES (
      p_order_id, v_event_type, v_actor_uuid,
      CASE WHEN v_source IN ('admin_override','admin') THEN 'admin'
           WHEN v_source = 'customer_action' THEN 'customer'
           ELSE 'system' END,
      'Order ' || p_new_status::text,
      jsonb_build_object('from_status', v_current_status::text,
                         'to_status', p_new_status::text, 'reason', p_reason),
      v_source
    );
  END IF;

  IF p_new_status = 'delivered' THEN
    -- Skip stock commit for replacement-cleanup transitions — they're parent
    -- audit closures, not real deliveries (the replacement child already
    -- committed its own stock when IT delivered).
    IF v_current_status NOT IN ('replacement_delivered', 'return_rejected', 'replacement_rejected') THEN
      PERFORM public.commit_inventory_for_order(p_order_id, v_actor_uuid);
    END IF;
  ELSIF p_new_status IN ('cancelled', 'failed') THEN
    BEGIN
      PERFORM public.release_inventory_reservation(p_order_id);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING
        'update_order_status: inventory release skipped for order % (% → %): %',
        p_order_id, v_current_status, p_new_status, SQLERRM;
    END;
  END IF;
END;
$$;

-- ── 2. Trigger function: propagate replacement delivery to parent + return ─
CREATE OR REPLACE FUNCTION public._on_replacement_delivered()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_parent_status public.order_status;
BEGIN
  -- Only react when a replacement order transitions TO delivered.
  IF NEW.order_type IS DISTINCT FROM 'replacement' THEN RETURN NEW; END IF;
  IF NEW.status <> 'delivered' OR OLD.status = 'delivered' THEN RETURN NEW; END IF;
  IF NEW.parent_order_id IS NULL THEN RETURN NEW; END IF;

  -- Close the parent order (idempotent for already-delivered parents).
  SELECT status INTO v_parent_status FROM public.orders WHERE id = NEW.parent_order_id;
  IF v_parent_status IN ('replacement_approved', 'replacement_delivered') THEN
    BEGIN
      PERFORM public.update_order_status(
        p_order_id   := NEW.parent_order_id,
        p_new_status := 'delivered'::public.order_status,
        p_changed_by := NULL,
        p_reason     := 'Auto-close: replacement order ' || NEW.order_number ||
                        ' delivered to customer',
        p_source     := 'system'
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Replacement-delivery parent auto-close failed for order %: %',
        NEW.parent_order_id, SQLERRM;
    END;
  END IF;

  -- Close the linked return record.
  IF NEW.replacement_request_id IS NOT NULL THEN
    UPDATE public.order_returns
       SET status     = 'replaced',
           updated_at = now()
     WHERE id     = NEW.replacement_request_id
       AND status IN ('approved', 'inspected', 'accepted');

    INSERT INTO public.order_events (
      order_id, event_type, actor_type, description, metadata, source
    ) VALUES (
      NEW.parent_order_id, 'return_replaced', 'system',
      'Replacement delivered — return record auto-closed',
      jsonb_build_object('return_id', NEW.replacement_request_id,
                         'replacement_order_id', NEW.id,
                         'replacement_order_number', NEW.order_number),
      'system'
    );
  END IF;

  RETURN NEW;
END;
$$;

-- ── 3. Attach trigger ────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_replacement_delivered ON public.orders;
CREATE TRIGGER trg_replacement_delivered
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW
  WHEN (NEW.order_type = 'replacement')
  EXECUTE FUNCTION public._on_replacement_delivered();

-- ── 4. Backfill the 1 known live stuck record ───────────────────────────────
-- replacement_order_id 96d15822-… is delivered; parent + return are stuck.
-- This block manually applies what the new trigger will do for future cases.
DO $$
BEGIN
  -- Close parent
  BEGIN
    PERFORM public.update_order_status(
      p_order_id   := '475739c1-e59a-4e65-929c-b9d924e41846'::uuid,
      p_new_status := 'delivered'::public.order_status,
      p_changed_by := NULL,
      p_reason     := 'Backfill (00060): replacement delivered, parent auto-closed',
      p_source     := 'system'
    );
  EXCEPTION
    WHEN OTHERS THEN
      RAISE NOTICE 'backfill: parent close skipped (likely already delivered): %', SQLERRM;
  END;

  -- Close return record
  UPDATE public.order_returns
     SET status = 'replaced', updated_at = now()
   WHERE id = '93409d81-547e-4482-ad94-c284c48f2f8b'::uuid
     AND status IN ('approved', 'inspected', 'accepted');
END $$;
