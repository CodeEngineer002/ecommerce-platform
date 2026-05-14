-- ============================================================
-- MIGRATION 00011 — ORDER MANAGEMENT
-- Returns, refunds, fulfillment, replacements, admin notes,
-- timeline events; expanded order_status enum; updated RPC.
-- ============================================================

-- ── 1. Expand order_status enum ──────────────────────────────────────────────
-- Must run outside a transaction. Supabase CLI handles this correctly.
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'draft';
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'pending_payment';
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'packed';
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'out_for_delivery';
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'failed';
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'return_requested';
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'return_approved';
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'return_rejected';
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'return_in_transit';
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'returned';
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'replacement_requested';
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'replacement_approved';
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'replacement_rejected';
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'replacement_shipped';
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'replacement_delivered';
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'refund_requested';
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'refund_processing';
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'partially_returned';
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'partially_refunded';

-- ── 2. Order returns ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.order_returns (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id            uuid        NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  user_id             uuid        NOT NULL REFERENCES auth.users(id),
  status              text        NOT NULL DEFAULT 'requested'
    CHECK (status IN (
      'requested', 'approved', 'rejected',
      'pickup_scheduled', 'in_transit', 'received', 'inspected',
      'accepted', 'rejected_after_inspection',
      'refunded', 'replaced', 'closed'
    )),
  reason              text        NOT NULL,
  notes               text,
  total_refund_amount numeric(12,2),
  reviewed_by         uuid        REFERENCES auth.users(id),
  reviewed_at         timestamptz,
  review_note         text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_returns_order_id  ON public.order_returns(order_id);
CREATE INDEX IF NOT EXISTS idx_order_returns_user_id   ON public.order_returns(user_id);
CREATE INDEX IF NOT EXISTS idx_order_returns_status    ON public.order_returns(status);

ALTER TABLE public.order_returns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own returns"    ON public.order_returns;
CREATE POLICY "Users view own returns"
  ON public.order_returns FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users create own returns"  ON public.order_returns;
CREATE POLICY "Users create own returns"
  ON public.order_returns FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Admins manage returns"     ON public.order_returns;
CREATE POLICY "Admins manage returns"
  ON public.order_returns FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ── 3. Order return items ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.order_return_items (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id     uuid        NOT NULL REFERENCES public.order_returns(id) ON DELETE CASCADE,
  order_item_id uuid        NOT NULL REFERENCES public.order_items(id),
  quantity      int         NOT NULL CHECK (quantity > 0),
  reason        text,
  condition     text        CHECK (condition IN ('unopened', 'good', 'damaged', 'defective')),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_return_items_return_id ON public.order_return_items(return_id);

ALTER TABLE public.order_return_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own return items" ON public.order_return_items;
CREATE POLICY "Users view own return items"
  ON public.order_return_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.order_returns r
       WHERE r.id = return_id AND r.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Admins manage return items" ON public.order_return_items;
CREATE POLICY "Admins manage return items"
  ON public.order_return_items FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ── 4. Replacements ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.replacements (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        uuid        NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  return_id       uuid        REFERENCES public.order_returns(id),
  user_id         uuid        NOT NULL REFERENCES auth.users(id),
  status          text        NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested', 'approved', 'rejected', 'processing', 'shipped', 'delivered')),
  reason          text,
  tracking_number text,
  carrier         text,
  notes           text,
  processed_by    uuid        REFERENCES auth.users(id),
  shipped_at      timestamptz,
  delivered_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_replacements_order_id  ON public.replacements(order_id);
CREATE INDEX IF NOT EXISTS idx_replacements_user_id   ON public.replacements(user_id);
CREATE INDEX IF NOT EXISTS idx_replacements_status    ON public.replacements(status);

ALTER TABLE public.replacements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own replacements"   ON public.replacements;
CREATE POLICY "Users view own replacements"
  ON public.replacements FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users create own replacements" ON public.replacements;
CREATE POLICY "Users create own replacements"
  ON public.replacements FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Admins manage replacements"    ON public.replacements;
CREATE POLICY "Admins manage replacements"
  ON public.replacements FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ── 5. Replacement items ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.replacement_items (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  replacement_id   uuid        NOT NULL REFERENCES public.replacements(id) ON DELETE CASCADE,
  order_item_id    uuid        NOT NULL REFERENCES public.order_items(id),
  new_variant_id   uuid        REFERENCES public.product_variants(id),
  quantity         int         NOT NULL CHECK (quantity > 0),
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_replacement_items_replacement_id ON public.replacement_items(replacement_id);

ALTER TABLE public.replacement_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own replacement items" ON public.replacement_items;
CREATE POLICY "Users view own replacement items"
  ON public.replacement_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.replacements r
       WHERE r.id = replacement_id AND r.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Admins manage replacement items" ON public.replacement_items;
CREATE POLICY "Admins manage replacement items"
  ON public.replacement_items FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ── 6. Refunds ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.refunds (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id           uuid        NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  return_id          uuid        REFERENCES public.order_returns(id),
  payment_id         uuid        REFERENCES public.payments(id),
  amount             numeric(12,2) NOT NULL CHECK (amount > 0),
  currency           text        NOT NULL DEFAULT 'INR',
  status             text        NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'succeeded', 'failed')),
  refund_type        text        NOT NULL DEFAULT 'full'
    CHECK (refund_type IN ('full', 'partial', 'shipping')),
  provider_refund_id text,
  reason             text,
  processed_by       uuid        REFERENCES auth.users(id),
  processed_at       timestamptz,
  failed_reason      text,
  metadata           jsonb       NOT NULL DEFAULT '{}',
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_refunds_order_id   ON public.refunds(order_id);
CREATE INDEX IF NOT EXISTS idx_refunds_return_id  ON public.refunds(return_id);
CREATE INDEX IF NOT EXISTS idx_refunds_status     ON public.refunds(status);

ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own refunds"  ON public.refunds;
CREATE POLICY "Users view own refunds"
  ON public.refunds FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
       WHERE o.id = order_id AND o.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Admins manage refunds" ON public.refunds;
CREATE POLICY "Admins manage refunds"
  ON public.refunds FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ── 7. Refund items ───────────────────────────────────────────────────────────
-- refund_line_items: per-item breakdown for refunds issued via the new flow
-- NOTE: existing `refund_items` table (migration 00008) is linked to refund_requests.
-- This new table tracks per-item amounts against the new `refunds` table.
CREATE TABLE IF NOT EXISTS public.refund_line_items (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  refund_id     uuid        NOT NULL REFERENCES public.refunds(id) ON DELETE CASCADE,
  order_item_id uuid        NOT NULL REFERENCES public.order_items(id),
  quantity      int         NOT NULL CHECK (quantity > 0),
  amount        numeric(12,2) NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_refund_line_items_refund_id ON public.refund_line_items(refund_id);

ALTER TABLE public.refund_line_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own refund line items" ON public.refund_line_items;
CREATE POLICY "Users view own refund line items"
  ON public.refund_line_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.refunds rf
        JOIN public.orders o ON o.id = rf.order_id
       WHERE rf.id = refund_id AND o.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Admins manage refund line items" ON public.refund_line_items;
CREATE POLICY "Admins manage refund line items"
  ON public.refund_line_items FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ── 8. Order fulfillments ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.order_fulfillments (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id            uuid        NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  status              text        NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing', 'packed', 'shipped', 'out_for_delivery', 'delivered', 'failed')),
  carrier             text,
  tracking_number     text,
  tracking_url        text,
  notes               text,
  packed_at           timestamptz,
  shipped_at          timestamptz,
  estimated_delivery  timestamptz,
  delivered_at        timestamptz,
  created_by          uuid        REFERENCES auth.users(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_fulfillments_order_id ON public.order_fulfillments(order_id);

ALTER TABLE public.order_fulfillments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own fulfillments" ON public.order_fulfillments;
CREATE POLICY "Users view own fulfillments"
  ON public.order_fulfillments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
       WHERE o.id = order_id AND o.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Admins manage fulfillments" ON public.order_fulfillments;
CREATE POLICY "Admins manage fulfillments"
  ON public.order_fulfillments FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ── 9. Fulfillment items ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.fulfillment_items (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  fulfillment_id uuid        NOT NULL REFERENCES public.order_fulfillments(id) ON DELETE CASCADE,
  order_item_id  uuid        NOT NULL REFERENCES public.order_items(id),
  quantity       int         NOT NULL CHECK (quantity > 0),
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fulfillment_items_fulfillment_id ON public.fulfillment_items(fulfillment_id);

ALTER TABLE public.fulfillment_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own fulfillment items" ON public.fulfillment_items;
CREATE POLICY "Users view own fulfillment items"
  ON public.fulfillment_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.order_fulfillments f
        JOIN public.orders o ON o.id = f.order_id
       WHERE f.id = fulfillment_id AND o.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Admins manage fulfillment items" ON public.fulfillment_items;
CREATE POLICY "Admins manage fulfillment items"
  ON public.fulfillment_items FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ── 10. Admin order notes ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.admin_order_notes (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    uuid        NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  author_id   uuid        NOT NULL REFERENCES auth.users(id),
  content     text        NOT NULL,
  is_internal boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_order_notes_order_id ON public.admin_order_notes(order_id);

ALTER TABLE public.admin_order_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage order notes" ON public.admin_order_notes;
CREATE POLICY "Admins manage order notes"
  ON public.admin_order_notes FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Public notes visible to the order owner
DROP POLICY IF EXISTS "Users view public order notes" ON public.admin_order_notes;
CREATE POLICY "Users view public order notes"
  ON public.admin_order_notes FOR SELECT
  USING (
    is_internal = false AND
    EXISTS (
      SELECT 1 FROM public.orders o
       WHERE o.id = order_id AND o.user_id = auth.uid()
    )
  );

-- ── 11. Order events (timeline) ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.order_events (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    uuid        NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  event_type  text        NOT NULL,
  actor_id    uuid        REFERENCES auth.users(id),
  actor_type  text        CHECK (actor_type IN ('customer', 'admin', 'system')),
  description text        NOT NULL,
  metadata    jsonb       NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_events_order_id   ON public.order_events(order_id);
CREATE INDEX IF NOT EXISTS idx_order_events_created_at ON public.order_events(created_at);

ALTER TABLE public.order_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own order events" ON public.order_events;
CREATE POLICY "Users view own order events"
  ON public.order_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
       WHERE o.id = order_id AND o.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Admins manage order events" ON public.order_events;
CREATE POLICY "Admins manage order events"
  ON public.order_events FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "System insert order events" ON public.order_events;
CREATE POLICY "System insert order events"
  ON public.order_events FOR INSERT
  WITH CHECK (true);

-- ── 12. Updated update_order_status with full transition table ────────────────
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

  IF NOT (
    -- Pending / payment flows
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
    (v_current_status = 'return_requested'     AND p_new_status IN ('return_approved', 'return_rejected')) OR
    (v_current_status = 'return_approved'      AND p_new_status = 'return_in_transit') OR
    (v_current_status = 'return_in_transit'    AND p_new_status = 'returned') OR
    (v_current_status = 'returned'             AND p_new_status IN ('refunded', 'replacement_shipped')) OR
    -- Replacement flow
    (v_current_status = 'replacement_requested' AND p_new_status IN ('replacement_approved', 'replacement_rejected')) OR
    (v_current_status = 'replacement_approved'  AND p_new_status = 'replacement_shipped') OR
    (v_current_status = 'replacement_shipped'   AND p_new_status = 'replacement_delivered') OR
    -- Refund flow
    (v_current_status = 'refund_requested'     AND p_new_status = 'refund_processing') OR
    (v_current_status = 'refund_processing'    AND p_new_status IN ('refunded', 'partially_refunded')) OR
    -- Partial states
    (v_current_status = 'partially_returned'   AND p_new_status IN (
        'return_requested', 'replacement_requested', 'refund_requested',
        'refunded', 'partially_refunded')) OR
    (v_current_status = 'partially_refunded'   AND p_new_status = 'refunded') OR
    -- Terminal with refund / retry
    (v_current_status = 'cancelled'            AND p_new_status = 'refunded') OR
    (v_current_status = 'failed'               AND p_new_status = 'pending_payment')
  ) THEN
    RAISE EXCEPTION 'Invalid status transition: % -> %', v_current_status, p_new_status
      USING ERRCODE = 'P0006';
  END IF;

  UPDATE public.orders
     SET status = p_new_status, updated_at = now()
   WHERE id = p_order_id;

  INSERT INTO public.order_status_history (order_id, from_status, to_status, changed_by, reason)
  VALUES (p_order_id, v_current_status, p_new_status, p_changed_by, p_reason);
END;
$$;

-- ── 13. cancel_order RPC ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cancel_order(
  p_order_id   uuid,
  p_user_id    uuid,
  p_reason     text    DEFAULT NULL,
  p_actor_type text    DEFAULT 'customer'
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_order RECORD;
BEGIN
  SELECT id, status, user_id INTO v_order
    FROM public.orders
   WHERE id = p_order_id
     FOR UPDATE;

  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'Order % not found', p_order_id USING ERRCODE = 'P0005';
  END IF;

  IF p_actor_type = 'customer' AND v_order.user_id != p_user_id THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = 'P0007';
  END IF;

  IF v_order.status NOT IN (
    'draft', 'pending', 'pending_payment', 'confirmed', 'processing', 'packed', 'shipped'
  ) THEN
    RAISE EXCEPTION 'Order cannot be cancelled from status: %', v_order.status
      USING ERRCODE = 'P0006';
  END IF;

  -- Release reserved inventory
  UPDATE public.inventory i
     SET reserved   = GREATEST(0, i.reserved - oi.quantity),
         updated_at = now()
    FROM public.order_items oi
   WHERE oi.order_id = p_order_id
     AND oi.variant_id IS NOT NULL
     AND i.variant_id  = oi.variant_id;

  UPDATE public.orders
     SET status = 'cancelled', updated_at = now()
   WHERE id = p_order_id;

  INSERT INTO public.order_status_history (order_id, from_status, to_status, changed_by, reason)
  VALUES (p_order_id, v_order.status, 'cancelled', p_user_id, p_reason);

  INSERT INTO public.order_events (order_id, event_type, actor_id, actor_type, description, metadata)
  VALUES (p_order_id, 'order_cancelled', p_user_id, p_actor_type,
          COALESCE(p_reason, 'Order cancelled'),
          jsonb_build_object('previous_status', v_order.status::text));
END;
$$;

-- ── 14. request_return RPC ────────────────────────────────────────────────────
-- Creates return request + updates order status atomically.
-- p_items: JSON array of {order_item_id, quantity, reason?, condition?}
CREATE OR REPLACE FUNCTION public.request_return(
  p_order_id uuid,
  p_user_id  uuid,
  p_reason   text,
  p_items    jsonb
)
RETURNS uuid  -- returns the new order_return id
LANGUAGE plpgsql
AS $$
DECLARE
  v_order     RECORD;
  v_return_id uuid;
  v_item      jsonb;
  v_delivered_at timestamptz;
  v_window_days  int := 30;
BEGIN
  SELECT id, status, user_id INTO v_order
    FROM public.orders
   WHERE id = p_order_id
     FOR UPDATE;

  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'Order % not found', p_order_id USING ERRCODE = 'P0005';
  END IF;

  IF v_order.user_id != p_user_id THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = 'P0007';
  END IF;

  IF v_order.status NOT IN ('delivered', 'partially_returned') THEN
    RAISE EXCEPTION 'Order must be delivered to request a return (current: %)', v_order.status
      USING ERRCODE = 'P0008';
  END IF;

  -- Check return window using order_status_history
  SELECT created_at INTO v_delivered_at
    FROM public.order_status_history
   WHERE order_id  = p_order_id
     AND to_status = 'delivered'
   ORDER BY created_at DESC
   LIMIT 1;

  IF v_delivered_at IS NULL THEN
    SELECT updated_at INTO v_delivered_at FROM public.orders WHERE id = p_order_id;
  END IF;

  IF now() > (v_delivered_at + (v_window_days || ' days')::interval) THEN
    RAISE EXCEPTION 'Return window of % days has expired', v_window_days
      USING ERRCODE = 'P0009';
  END IF;

  -- Create return request
  INSERT INTO public.order_returns (order_id, user_id, reason)
  VALUES (p_order_id, p_user_id, p_reason)
  RETURNING id INTO v_return_id;

  -- Insert return items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    INSERT INTO public.order_return_items (return_id, order_item_id, quantity, reason, condition)
    VALUES (
      v_return_id,
      (v_item->>'order_item_id')::uuid,
      (v_item->>'quantity')::int,
      v_item->>'reason',
      v_item->>'condition'
    );
  END LOOP;

  -- Transition order to return_requested
  UPDATE public.orders
     SET status = 'return_requested', updated_at = now()
   WHERE id = p_order_id;

  INSERT INTO public.order_status_history (order_id, from_status, to_status, changed_by, reason)
  VALUES (p_order_id, v_order.status, 'return_requested', p_user_id, p_reason);

  INSERT INTO public.order_events (order_id, event_type, actor_id, actor_type, description, metadata)
  VALUES (p_order_id, 'return_requested', p_user_id, 'customer',
          'Return request submitted: ' || p_reason,
          jsonb_build_object('return_id', v_return_id));

  RETURN v_return_id;
END;
$$;

-- ── 15. approve_return / reject_return RPCs ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.approve_return(
  p_return_id uuid,
  p_admin_id  uuid,
  p_note      text DEFAULT NULL
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
    RAISE EXCEPTION 'Return request % not found', p_return_id USING ERRCODE = 'P0005';
  END IF;

  IF v_return.status != 'requested' THEN
    RAISE EXCEPTION 'Return is not in requested state (current: %)', v_return.status
      USING ERRCODE = 'P0006';
  END IF;

  UPDATE public.order_returns
     SET status      = 'approved',
         reviewed_by = p_admin_id,
         reviewed_at = now(),
         review_note = p_note,
         updated_at  = now()
   WHERE id = p_return_id;

  PERFORM public.update_order_status(v_return.order_id, 'return_approved', p_admin_id, p_note);

  INSERT INTO public.order_events (order_id, event_type, actor_id, actor_type, description, metadata)
  VALUES (v_return.order_id, 'return_approved', p_admin_id, 'admin',
          COALESCE(p_note, 'Return request approved'),
          jsonb_build_object('return_id', p_return_id));
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_return(
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
    RAISE EXCEPTION 'Return request % not found', p_return_id USING ERRCODE = 'P0005';
  END IF;

  IF v_return.status != 'requested' THEN
    RAISE EXCEPTION 'Return is not in requested state (current: %)', v_return.status
      USING ERRCODE = 'P0006';
  END IF;

  UPDATE public.order_returns
     SET status      = 'rejected',
         reviewed_by = p_admin_id,
         reviewed_at = now(),
         review_note = p_reason,
         updated_at  = now()
   WHERE id = p_return_id;

  PERFORM public.update_order_status(v_return.order_id, 'return_rejected', p_admin_id, p_reason);

  INSERT INTO public.order_events (order_id, event_type, actor_id, actor_type, description, metadata)
  VALUES (v_return.order_id, 'return_rejected', p_admin_id, 'admin',
          'Return request rejected: ' || p_reason,
          jsonb_build_object('return_id', p_return_id));
END;
$$;

-- ── 16. record_refund RPC ─────────────────────────────────────────────────────
-- Records refund in DB and transitions order status.
-- Payment gateway call happens in the API layer before invoking this.
CREATE OR REPLACE FUNCTION public.record_refund(
  p_order_id           uuid,
  p_payment_id         uuid,
  p_amount             numeric,
  p_refund_type        text,       -- 'full' | 'partial' | 'shipping'
  p_admin_id           uuid,
  p_reason             text        DEFAULT NULL,
  p_return_id          uuid        DEFAULT NULL,
  p_provider_refund_id text        DEFAULT NULL
)
RETURNS uuid  -- returns new refund id
LANGUAGE plpgsql
AS $$
DECLARE
  v_order     RECORD;
  v_paid      numeric;
  v_refunded  numeric;
  v_refund_id uuid;
  v_new_status public.order_status;
BEGIN
  SELECT id, status, total INTO v_order
    FROM public.orders
   WHERE id = p_order_id
     FOR UPDATE;

  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'Order % not found', p_order_id USING ERRCODE = 'P0005';
  END IF;

  -- Total already refunded
  SELECT COALESCE(SUM(amount), 0) INTO v_refunded
    FROM public.refunds
   WHERE order_id = p_order_id AND status = 'succeeded';

  IF v_refunded + p_amount > v_order.total THEN
    RAISE EXCEPTION 'Refund amount % exceeds remaining refundable amount %',
      p_amount, (v_order.total - v_refunded)
      USING ERRCODE = 'P0010';
  END IF;

  INSERT INTO public.refunds (
    order_id, return_id, payment_id, amount, refund_type,
    status, reason, provider_refund_id, processed_by, processed_at
  ) VALUES (
    p_order_id, p_return_id, p_payment_id, p_amount, p_refund_type,
    'succeeded', p_reason, p_provider_refund_id, p_admin_id, now()
  ) RETURNING id INTO v_refund_id;

  -- Determine new order status
  v_paid := v_order.total;
  IF (v_refunded + p_amount) >= v_paid THEN
    v_new_status := 'refunded';
  ELSE
    v_new_status := 'partially_refunded';
  END IF;

  UPDATE public.orders
     SET status = v_new_status, updated_at = now()
   WHERE id = p_order_id;

  INSERT INTO public.order_status_history (order_id, from_status, to_status, changed_by, reason)
  VALUES (p_order_id, v_order.status, v_new_status, p_admin_id, p_reason);

  INSERT INTO public.order_events (order_id, event_type, actor_id, actor_type, description, metadata)
  VALUES (p_order_id, 'refund_issued', p_admin_id, 'admin',
          'Refund of ' || p_amount || ' issued',
          jsonb_build_object(
            'refund_id',   v_refund_id,
            'amount',      p_amount,
            'refund_type', p_refund_type
          ));

  RETURN v_refund_id;
END;
$$;

-- ── 17. create_fulfillment RPC ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_fulfillment(
  p_order_id       uuid,
  p_admin_id       uuid,
  p_carrier        text    DEFAULT NULL,
  p_tracking_number text   DEFAULT NULL,
  p_tracking_url   text    DEFAULT NULL,
  p_estimated_delivery timestamptz DEFAULT NULL,
  p_notes          text    DEFAULT NULL
)
RETURNS uuid  -- returns new fulfillment id
LANGUAGE plpgsql
AS $$
DECLARE
  v_order        RECORD;
  v_fulfillment_id uuid;
  v_new_status   public.order_status;
BEGIN
  SELECT id, status INTO v_order
    FROM public.orders
   WHERE id = p_order_id
     FOR UPDATE;

  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'Order % not found', p_order_id USING ERRCODE = 'P0005';
  END IF;

  IF v_order.status NOT IN ('confirmed', 'processing', 'packed') THEN
    RAISE EXCEPTION 'Order must be confirmed/processing/packed to create fulfillment (current: %)', v_order.status
      USING ERRCODE = 'P0006';
  END IF;

  v_new_status := CASE
    WHEN p_tracking_number IS NOT NULL THEN 'shipped'
    ELSE 'processing'
  END;

  INSERT INTO public.order_fulfillments (
    order_id, status, carrier, tracking_number, tracking_url,
    estimated_delivery, notes, shipped_at, created_by
  ) VALUES (
    p_order_id,
    CASE WHEN p_tracking_number IS NOT NULL THEN 'shipped' ELSE 'processing' END,
    p_carrier,
    p_tracking_number,
    p_tracking_url,
    p_estimated_delivery,
    p_notes,
    CASE WHEN p_tracking_number IS NOT NULL THEN now() ELSE NULL END,
    p_admin_id
  ) RETURNING id INTO v_fulfillment_id;

  -- Insert all order items as fulfillment items
  INSERT INTO public.fulfillment_items (fulfillment_id, order_item_id, quantity)
  SELECT v_fulfillment_id, id, quantity
    FROM public.order_items
   WHERE order_id = p_order_id;

  -- Advance order status
  IF v_order.status != v_new_status THEN
    UPDATE public.orders
       SET status = v_new_status, updated_at = now()
     WHERE id = p_order_id;

    INSERT INTO public.order_status_history (order_id, from_status, to_status, changed_by, reason)
    VALUES (p_order_id, v_order.status, v_new_status, p_admin_id,
            COALESCE(p_notes, 'Fulfillment created'));
  END IF;

  INSERT INTO public.order_events (order_id, event_type, actor_id, actor_type, description, metadata)
  VALUES (p_order_id, 'fulfillment_created', p_admin_id, 'admin',
          COALESCE('Fulfillment created' || CASE WHEN p_carrier IS NOT NULL THEN ' via ' || p_carrier ELSE '' END, 'Fulfillment created'),
          jsonb_build_object(
            'fulfillment_id',   v_fulfillment_id,
            'carrier',          p_carrier,
            'tracking_number',  p_tracking_number
          ));

  RETURN v_fulfillment_id;
END;
$$;

-- ── 18. update_fulfillment_tracking RPC ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_fulfillment_tracking(
  p_fulfillment_id  uuid,
  p_admin_id        uuid,
  p_carrier         text    DEFAULT NULL,
  p_tracking_number text    DEFAULT NULL,
  p_tracking_url    text    DEFAULT NULL,
  p_status          text    DEFAULT NULL,
  p_estimated_delivery timestamptz DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_fulfillment RECORD;
  v_order_id    uuid;
BEGIN
  SELECT id, order_id, status INTO v_fulfillment
    FROM public.order_fulfillments
   WHERE id = p_fulfillment_id
     FOR UPDATE;

  IF v_fulfillment.id IS NULL THEN
    RAISE EXCEPTION 'Fulfillment % not found', p_fulfillment_id USING ERRCODE = 'P0005';
  END IF;

  v_order_id := v_fulfillment.order_id;

  UPDATE public.order_fulfillments
     SET carrier              = COALESCE(p_carrier,           carrier),
         tracking_number      = COALESCE(p_tracking_number,   tracking_number),
         tracking_url         = COALESCE(p_tracking_url,      tracking_url),
         estimated_delivery   = COALESCE(p_estimated_delivery, estimated_delivery),
         status               = COALESCE(p_status,            status),
         shipped_at           = CASE
                                  WHEN p_status = 'shipped' AND shipped_at IS NULL THEN now()
                                  ELSE shipped_at
                                END,
         delivered_at         = CASE
                                  WHEN p_status = 'delivered' AND delivered_at IS NULL THEN now()
                                  ELSE delivered_at
                                END,
         updated_at           = now()
   WHERE id = p_fulfillment_id;

  -- Sync order status with fulfillment status
  IF p_status = 'shipped' THEN
    PERFORM public.update_order_status(v_order_id, 'shipped', p_admin_id, 'Shipment dispatched');
  ELSIF p_status = 'out_for_delivery' THEN
    PERFORM public.update_order_status(v_order_id, 'out_for_delivery', p_admin_id, 'Out for delivery');
  ELSIF p_status = 'delivered' THEN
    PERFORM public.update_order_status(v_order_id, 'delivered', p_admin_id, 'Delivered');
  END IF;

  INSERT INTO public.order_events (order_id, event_type, actor_id, actor_type, description, metadata)
  VALUES (v_order_id, 'fulfillment_updated', p_admin_id, 'admin',
          'Tracking updated' || CASE WHEN p_tracking_number IS NOT NULL THEN ': ' || p_tracking_number ELSE '' END,
          jsonb_build_object(
            'fulfillment_id',  p_fulfillment_id,
            'carrier',         p_carrier,
            'tracking_number', p_tracking_number,
            'status',          p_status
          ));
END;
$$;
