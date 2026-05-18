-- ============================================================
-- MIGRATION 00042 — RETURN LIFECYCLE COMPLETION
-- Adds RPC functions to advance a return request through the
-- post-received stages:
--   received → inspected → accepted → closed   (refund case)
--   received → inspected → accepted → closed   (replacement case)
--   received → inspected → rejected_after_inspection
--
-- The actual refund is triggered separately via the admin refund
-- API (/api/admin/orders/[id]/refund); these RPCs manage the
-- order_returns.status lifecycle only.
-- ============================================================

-- ── 1. mark_return_inspected ──────────────────────────────────────────────────
-- Transitions: received → inspected
CREATE OR REPLACE FUNCTION public.mark_return_inspected(
  p_return_id uuid,
  p_admin_id  uuid,
  p_notes     text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_return RECORD;
BEGIN
  SELECT id, order_id, status INTO v_return
    FROM public.order_returns
   WHERE id = p_return_id
     FOR UPDATE;

  IF v_return.id IS NULL THEN
    RAISE EXCEPTION 'Return request % not found', p_return_id;
  END IF;

  IF v_return.status != 'received' THEN
    RAISE EXCEPTION 'Return can only be marked inspected from received status (current: %)', v_return.status;
  END IF;

  UPDATE public.order_returns
     SET status      = 'inspected',
         reviewed_by = p_admin_id,
         reviewed_at = now(),
         review_note = COALESCE(p_notes, review_note),
         updated_at  = now()
   WHERE id = p_return_id;

  INSERT INTO public.order_events (order_id, event_type, actor_id, actor_type, description, metadata)
  VALUES (v_return.order_id, 'return_inspected', p_admin_id, 'admin',
          COALESCE(p_notes, 'Return item inspected'),
          jsonb_build_object('return_id', p_return_id));
END;
$$;

-- ── 2. mark_return_accepted ───────────────────────────────────────────────────
-- Transitions: inspected → accepted
CREATE OR REPLACE FUNCTION public.mark_return_accepted(
  p_return_id   uuid,
  p_admin_id    uuid,
  p_notes       text DEFAULT NULL,
  p_refund_amount numeric(12,2) DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_return RECORD;
BEGIN
  SELECT id, order_id, status INTO v_return
    FROM public.order_returns
   WHERE id = p_return_id
     FOR UPDATE;

  IF v_return.id IS NULL THEN
    RAISE EXCEPTION 'Return request % not found', p_return_id;
  END IF;

  IF v_return.status NOT IN ('inspected', 'received') THEN
    RAISE EXCEPTION 'Return can only be accepted from inspected/received status (current: %)', v_return.status;
  END IF;

  UPDATE public.order_returns
     SET status              = 'accepted',
         reviewed_by         = p_admin_id,
         reviewed_at         = COALESCE(reviewed_at, now()),
         review_note         = COALESCE(p_notes, review_note),
         total_refund_amount = COALESCE(p_refund_amount, total_refund_amount),
         updated_at          = now()
   WHERE id = p_return_id;

  INSERT INTO public.order_events (order_id, event_type, actor_id, actor_type, description, metadata)
  VALUES (v_return.order_id, 'return_accepted', p_admin_id, 'admin',
          COALESCE(p_notes, 'Return accepted — refund/replacement being processed'),
          jsonb_build_object('return_id', p_return_id, 'refund_amount', p_refund_amount));
END;
$$;

-- ── 3. mark_return_rejected_after_inspection ─────────────────────────────────
-- Transitions: inspected → rejected_after_inspection
CREATE OR REPLACE FUNCTION public.mark_return_rejected_after_inspection(
  p_return_id uuid,
  p_admin_id  uuid,
  p_reason    text
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_return RECORD;
BEGIN
  SELECT id, order_id, status INTO v_return
    FROM public.order_returns
   WHERE id = p_return_id
     FOR UPDATE;

  IF v_return.id IS NULL THEN
    RAISE EXCEPTION 'Return request % not found', p_return_id;
  END IF;

  IF v_return.status NOT IN ('inspected', 'received') THEN
    RAISE EXCEPTION 'Return can only be rejected after inspection from inspected/received status (current: %)', v_return.status;
  END IF;

  UPDATE public.order_returns
     SET status      = 'rejected_after_inspection',
         reviewed_by = p_admin_id,
         reviewed_at = now(),
         review_note = p_reason,
         updated_at  = now()
   WHERE id = p_return_id;

  INSERT INTO public.order_events (order_id, event_type, actor_id, actor_type, description, metadata)
  VALUES (v_return.order_id, 'return_rejected_after_inspection', p_admin_id, 'admin',
          p_reason,
          jsonb_build_object('return_id', p_return_id));
END;
$$;

-- ── 4. close_return ───────────────────────────────────────────────────────────
-- Transitions: accepted / refunded / replaced → closed
CREATE OR REPLACE FUNCTION public.close_return(
  p_return_id uuid,
  p_admin_id  uuid,
  p_notes     text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_return RECORD;
BEGIN
  SELECT id, order_id, status INTO v_return
    FROM public.order_returns
   WHERE id = p_return_id
     FOR UPDATE;

  IF v_return.id IS NULL THEN
    RAISE EXCEPTION 'Return request % not found', p_return_id;
  END IF;

  IF v_return.status NOT IN ('accepted', 'refunded', 'replaced') THEN
    RAISE EXCEPTION 'Return can only be closed from accepted/refunded/replaced status (current: %)', v_return.status;
  END IF;

  UPDATE public.order_returns
     SET status     = 'closed',
         updated_at = now(),
         review_note = COALESCE(p_notes, review_note)
   WHERE id = p_return_id;

  INSERT INTO public.order_events (order_id, event_type, actor_id, actor_type, description, metadata)
  VALUES (v_return.order_id, 'return_closed', p_admin_id, 'admin',
          COALESCE(p_notes, 'Return request closed'),
          jsonb_build_object('return_id', p_return_id));
END;
$$;
