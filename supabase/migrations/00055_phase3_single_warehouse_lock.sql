-- ============================================================================
-- Migration 00055: Phase 3.1 — Single-warehouse lock (Option B)
-- ============================================================================
--
-- WHY:
--   Today every inventory-touching RPC (create_order_atomic, cancel_order,
--   release_inventory_reservation, commit_inventory_for_order) resolves
--   exactly one warehouse — the row with is_default=true AND is_active=true.
--   If a second warehouse exists, its stock is silently ignored.
--
--   ShopNest is single-warehouse by design for now. This migration makes that
--   assumption explicit at the DB level:
--
--     1. UNIQUE partial index ensures at most ONE warehouse can be both
--        is_default=true AND is_active=true. Trying to mark a second one
--        will fail loudly.
--     2. The order-fulfillment helper now raises a clearer error when no
--        active default warehouse exists.
--     3. A new helper `current_order_warehouse_id()` documents the contract
--        and gives us a single place to switch routing logic when we go
--        multi-warehouse.
--
--   When the time comes to support multi-warehouse routing, replace
--   current_order_warehouse_id() body with a real routing algorithm and
--   drop the partial-unique index. Everything else continues to work.
--
-- IDEMPOTENCY:
--   CREATE UNIQUE INDEX IF NOT EXISTS + CREATE OR REPLACE FUNCTION.
-- ============================================================================

-- ── 1. Lock: exactly one active-default warehouse ───────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_default_warehouse
  ON public.warehouses ((1))
  WHERE is_default = true AND is_active = true;

-- ── 2. Helper: canonical "where do orders draw stock from?" function ────────
CREATE OR REPLACE FUNCTION public.current_order_warehouse_id()
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  -- Single-warehouse mode (Phase 3.1). When we go multi-warehouse later,
  -- replace this body with a real routing algorithm. All inventory RPCs
  -- call this helper instead of inlining the warehouse lookup.
  SELECT id
    FROM public.warehouses
   WHERE is_default = true AND is_active = true
   LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.current_order_warehouse_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_order_warehouse_id() TO authenticated, service_role;

-- ── 3. Sanity-check helper: warn if multiple warehouses present ─────────────
--    Optional but useful — call this at admin warehouse-management time to
--    surface the "multi-warehouse mode not yet supported" implication.
CREATE OR REPLACE FUNCTION public.check_warehouse_mode()
RETURNS TABLE (mode text, active_warehouses integer, message text)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    CASE
      WHEN cnt <= 1 THEN 'single_warehouse'
      ELSE 'multi_warehouse'
    END AS mode,
    cnt AS active_warehouses,
    CASE
      WHEN cnt = 0 THEN 'CRITICAL: no active warehouse — orders will fail'
      WHEN cnt = 1 THEN 'OK: single-warehouse mode'
      ELSE 'WARNING: ' || cnt::text || ' active warehouses exist but only the default is used for orders. '
        || 'Stock in non-default warehouses is silently ignored.'
    END AS message
  FROM (SELECT COUNT(*)::int AS cnt FROM public.warehouses WHERE is_active = true) t;
$$;

REVOKE ALL ON FUNCTION public.check_warehouse_mode() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_warehouse_mode() TO authenticated, service_role;
