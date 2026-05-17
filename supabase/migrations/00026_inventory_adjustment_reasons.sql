-- ============================================================
-- MIGRATION 00026 — INVENTORY ADJUSTMENT REASONS
-- ============================================================
-- Adds an `adjustment_reason` column to inventory_movements so that
-- admin-initiated stock adjustments carry a human-readable business
-- reason (e.g. "New inventory received", "Damaged stock").
--
-- Safe migration:
--   - Adds a nullable TEXT column — no data migration required.
--   - Existing rows (from order events) will have NULL here, which
--     is correct: reasons only apply to manual admin adjustments.
--   - source_type = 'admin' can be used to filter adjustment rows.
-- ============================================================

ALTER TABLE public.inventory_movements
  ADD COLUMN IF NOT EXISTS adjustment_reason text
  CHECK (
    adjustment_reason IS NULL OR adjustment_reason IN (
      'new_inventory_received',
      'damaged_stock',
      'manual_correction',
      'return_restocked',
      'warehouse_transfer',
      'audit_correction'
    )
  );

COMMENT ON COLUMN public.inventory_movements.adjustment_reason IS
  'Human-readable reason for admin manual adjustments (source_type = ''admin'').
   NULL for system-generated movements (orders, returns, etc.).';

-- Index for filtering adjustment history by reason
CREATE INDEX IF NOT EXISTS idx_inventory_movements_adjustment_reason
  ON public.inventory_movements(adjustment_reason)
  WHERE adjustment_reason IS NOT NULL;
