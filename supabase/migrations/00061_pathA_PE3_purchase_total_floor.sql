-- ============================================================================
-- Migration 00061: Path-A P0 PE-3 — Floor zero/negative purchase order totals
-- ============================================================================
--
-- PROBLEM:
--   calculatePricing() clamps total at >= 0 but allows total = 0. If a customer
--   applies a 100%-off coupon (intentionally or via a misconfigured coupon),
--   they get a free purchase. There's no DB-side guarantee against it.
--
-- FIX:
--   CHECK constraint:
--     - Purchase orders: total > 0
--     - Replacement orders: total = 0 (by design — they're system-created,
--       no payment, just inventory ship)
--
-- EXISTING DATA (verified 2026-05-23):
--   - 8 purchase orders, 0 with total=0 ✓
--   - 1 replacement order, total=0 ✓
--   So the constraint validates cleanly against existing rows.
--
-- IDEMPOTENCY:
--   DROP/ADD CONSTRAINT IF EXISTS pattern. Safe to re-run.
-- ============================================================================

-- Defensive: if there are any stray zero-total purchases, surface them so
-- the migration fails loudly rather than silently violating the new constraint.
DO $$
DECLARE
  v_bad integer;
BEGIN
  SELECT COUNT(*) INTO v_bad
    FROM public.orders
   WHERE total <= 0
     AND COALESCE(order_type, 'purchase') = 'purchase';

  IF v_bad > 0 THEN
    RAISE EXCEPTION 'Cannot apply PE-3 floor: % zero-total purchase orders exist. Investigate before re-running.', v_bad;
  END IF;
END $$;

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS chk_orders_total_floor;
ALTER TABLE public.orders
  ADD CONSTRAINT chk_orders_total_floor
  CHECK (
    -- Purchase orders must have positive total (no free purchases).
    (COALESCE(order_type, 'purchase') = 'purchase' AND total > 0)
    OR
    -- Replacement orders are total=0 by design.
    (order_type = 'replacement' AND total = 0)
  );
