-- ============================================================================
-- Migration 00063: Path-B P1 — Auto-surface pending refund on return acceptance
-- ============================================================================
--
-- PROBLEM:
--   Today mark_return_accepted() stores the refund_amount in
--   order_returns.total_refund_amount but does nothing else. Admin must
--   remember to manually trigger the /refund route. In practice, returns sit
--   accepted-but-unrefunded for days, customers ask "where's my refund?"
--
-- WHY NOT AUTO-PROCESS THE REFUND?
--   For prepaid orders, refunds go through Stripe/Razorpay which need
--   item-level breakdowns + gateway calls (handled in the /refund route).
--   We can't trigger that from a DB RPC cleanly.
--
--   For COD orders, the refund is a manual cash payback / bank transfer
--   that the admin physically performs.
--
--   In both cases, the system can't AUTO-MOVE money — but it CAN make sure
--   the action is visible and trackable.
--
-- FIX:
--   On return acceptance (request_type='return', refund amount > 0), insert
--   an order_exceptions row of type 'refund_pending' that surfaces in the
--   existing admin exceptions queue (/admin/orders/exceptions). Admin
--   processes the refund via the standard /refund route and the exception
--   gets auto-resolved (separate small change).
--
--   For replacement requests acceptance is the "send the replacement" path,
--   no refund involved — no exception created.
--
-- IDEMPOTENCY:
--   Unique partial index on (order_id, exception_type) WHERE status='open'
--   already exists. Re-acceptance after a previous accept will find the
--   existing 'open' row and skip insertion.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.mark_return_accepted(
  p_return_id     uuid,
  p_admin_id      uuid,
  p_notes         text DEFAULT NULL,
  p_refund_amount numeric(12,2) DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_return RECORD;
  v_amount numeric(12,2);
BEGIN
  SELECT id, order_id, status, request_type, total_refund_amount
    INTO v_return
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

  -- ── Path-B: surface the pending refund as an admin task ────────────────
  -- Only for return requests (replacements don't refund money). Use the
  -- final stored amount (COALESCE handles both new and pre-existing values).
  v_amount := COALESCE(p_refund_amount, v_return.total_refund_amount);

  IF v_return.request_type = 'return' AND v_amount IS NOT NULL AND v_amount > 0 THEN
    INSERT INTO public.order_exceptions (
      order_id, exception_type, severity, title, description, metadata, status
    ) VALUES (
      v_return.order_id,
      'refund_pending',
      'warning',
      'Refund pending for accepted return',
      'Customer return was accepted with refund amount ' || v_amount::text ||
        '. Admin needs to process the refund via /admin/orders/' || v_return.order_id::text || '#refund.',
      jsonb_build_object(
        'return_id',     p_return_id,
        'refund_amount', v_amount,
        'request_type',  v_return.request_type,
        'accepted_by',   p_admin_id,
        'accepted_at',   now()
      ),
      'open'
    )
    ON CONFLICT DO NOTHING;  -- unique partial idx on (order_id, type) WHERE status='open' prevents dupes
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_return_accepted(uuid, uuid, text, numeric)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_return_accepted(uuid, uuid, text, numeric)
  TO service_role;

-- ── Sibling: auto-resolve the exception when refund is recorded ────────────
-- Wraps record_refund to mark any matching 'refund_pending' exception as
-- resolved. Cleanest place is a trigger on refunds.
CREATE OR REPLACE FUNCTION public._on_refund_succeeded_resolve_pending()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status <> 'succeeded' THEN RETURN NEW; END IF;
  IF NEW.return_id IS NULL    THEN RETURN NEW; END IF;

  UPDATE public.order_exceptions
     SET status          = 'resolved',
         resolved_by     = NEW.processed_by,
         resolved_at     = now(),
         resolution_note = 'Refund recorded (id=' || NEW.id::text || ', amount=' || NEW.amount::text || ')'
   WHERE order_id       = NEW.order_id
     AND exception_type = 'refund_pending'
     AND status         = 'open'
     AND metadata->>'return_id' = NEW.return_id::text;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_refund_resolves_pending_exception ON public.refunds;
CREATE TRIGGER trg_refund_resolves_pending_exception
  AFTER INSERT OR UPDATE OF status ON public.refunds
  FOR EACH ROW
  WHEN (NEW.status = 'succeeded' AND NEW.return_id IS NOT NULL)
  EXECUTE FUNCTION public._on_refund_succeeded_resolve_pending();
