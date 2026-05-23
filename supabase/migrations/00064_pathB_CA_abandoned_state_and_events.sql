-- ============================================================================
-- Migration 00064: Path-B P1 CA — Cart abandonment state + event emission
-- ============================================================================
--
-- PROBLEM:
--   Today expire_abandoned_carts() just flips active → expired at 30 days,
--   silently. No event, no recovery email, no audit. Customer wakes up to
--   an empty cart after a month with no warning. The 'abandoned' enum value
--   already exists on carts.status but is never used.
--
-- FIX:
--   Two-stage lifecycle:
--     1) active  → abandoned   when inactive for 24h        (sends email)
--     2) abandoned → expired   when inactive for 30d total  (terminal)
--
--   Each transition writes a cart_events row so the timeline is auditable.
--   The route handler fan-outs abandonment emails after calling
--   mark_abandoned_carts() (the RPC can't send email).
--
-- NEW RPCs:
--   • mark_abandoned_carts(p_threshold_hours integer DEFAULT 24)
--       Transitions active → abandoned. Returns TABLE of (cart_id, user_id)
--       so the route can email user-cart owners.
--   • expire_abandoned_carts() — EXTENDED — now transitions abandoned → expired
--       AND any stale active rows (defensive) → expired. Emits events.
--
-- IDEMPOTENCY:
--   Status filters in WHERE clauses guarantee a cart only transitions once
--   per stage. Re-running picks up new rows that have crossed the threshold.
-- ============================================================================

-- ── 0. Drop the old void-returning expire_abandoned_carts so the new
--    integer-returning signature can replace it (PG 42P13 otherwise). ──────
DROP FUNCTION IF EXISTS public.expire_abandoned_carts();

-- ── 1. mark_abandoned_carts (new) ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mark_abandoned_carts(
  p_threshold_hours integer DEFAULT 24
)
RETURNS TABLE (cart_id uuid, user_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH transitioned AS (
    UPDATE public.carts
       SET status     = 'abandoned',
           updated_at = now()
     WHERE status = 'active'
       AND updated_at < (now() - make_interval(hours => p_threshold_hours))
       AND expires_at >= now()  -- skip carts already past hard expiry
    RETURNING id, public.carts.user_id
  )
  SELECT t.id, t.user_id FROM transitioned t;

  -- Audit event per transitioned cart
  INSERT INTO public.cart_events (cart_id, event_type, metadata)
  SELECT id, 'cart_abandoned',
         jsonb_build_object('threshold_hours', p_threshold_hours, 'source', 'scheduled_job')
    FROM public.carts
   WHERE status = 'abandoned'
     AND updated_at > (now() - INTERVAL '5 minutes');
END;
$$;

REVOKE ALL ON FUNCTION public.mark_abandoned_carts(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_abandoned_carts(integer) TO service_role;

-- ── 2. expire_abandoned_carts (extended) ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.expire_abandoned_carts()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  WITH transitioned AS (
    UPDATE public.carts
       SET status     = 'expired',
           updated_at = now()
     WHERE status IN ('active', 'abandoned')
       AND expires_at < now()
    RETURNING id
  )
  SELECT COUNT(*) INTO v_count FROM transitioned;

  -- Audit event per transitioned cart
  INSERT INTO public.cart_events (cart_id, event_type, metadata)
  SELECT id, 'cart_expired',
         jsonb_build_object('source', 'scheduled_job', 'reason', 'past hard expiry (30d)')
    FROM public.carts
   WHERE status = 'expired'
     AND updated_at > (now() - INTERVAL '5 minutes');

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.expire_abandoned_carts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_abandoned_carts() TO service_role;
