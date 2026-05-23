-- ============================================================================
-- Migration 00049: Phase 1.2 — Inventory invariants at the DB layer
-- ============================================================================
--
-- WHY:
--   The 00041-era cancel bug drove `reserved` below zero (multi-warehouse
--   over-release). The 00038→00044 window left reservations un-released and
--   stock un-committed. In both cases the application code used GREATEST(0, …)
--   wrappers to clamp values, but the DB itself had NO invariants — silent
--   corruption was invisible until an audit.
--
-- INVARIANTS LOCKED IN:
--   • quantity >= 0          — physical stock cannot be negative
--   • reserved >= 0          — reservation counter cannot be negative
--   • reserved <= quantity   — you cannot reserve more than you have
--
-- BLAST RADIUS:
--   Schema-level CHECK constraints. The Phase 1.1 backfill (migration 00048)
--   already cleaned all existing rows; these ADDs should succeed without
--   table-rewrite cost on this dataset.
--
-- IDEMPOTENCY:
--   Each ALTER TABLE ... ADD CONSTRAINT IF NOT EXISTS is naturally safe to
--   re-run. Postgres 15+ supports this syntax directly.
-- ============================================================================

-- Defensive: re-clamp any stray negatives just in case (no-op if Phase 1.1 ran)
UPDATE public.inventory_levels
   SET quantity = GREATEST(0, quantity),
       reserved = GREATEST(0, LEAST(reserved, quantity)),
       updated_at = now()
 WHERE quantity < 0 OR reserved < 0 OR reserved > quantity;

ALTER TABLE public.inventory_levels
  DROP CONSTRAINT IF EXISTS inv_qty_nonneg,
  ADD  CONSTRAINT inv_qty_nonneg CHECK (quantity >= 0);

ALTER TABLE public.inventory_levels
  DROP CONSTRAINT IF EXISTS inv_reserved_nonneg,
  ADD  CONSTRAINT inv_reserved_nonneg CHECK (reserved >= 0);

ALTER TABLE public.inventory_levels
  DROP CONSTRAINT IF EXISTS inv_reserved_le_qty,
  ADD  CONSTRAINT inv_reserved_le_qty CHECK (reserved <= quantity);
