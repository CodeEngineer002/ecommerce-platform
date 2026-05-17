-- ============================================================
-- MIGRATION 00027 — PRODUCT CATALOG ENHANCEMENTS
-- ============================================================
-- Adds shipping/operations readiness fields to the products table.
-- All columns are nullable with safe defaults — zero impact on existing
-- active products. No data migration required.
--
-- ADR-010: Enterprise Catalog Management UX Architecture
-- ============================================================

-- ── Shipping / Physical dimensions ───────────────────────────────────────────
-- Note: products.weight (numeric(8,3)) already exists from initial schema.
-- We add dimensional fields alongside it.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS length_cm numeric(8, 2),
  ADD COLUMN IF NOT EXISTS width_cm  numeric(8, 2),
  ADD COLUMN IF NOT EXISTS height_cm numeric(8, 2);

-- ── Fulfillment type ─────────────────────────────────────────────────────────
-- Drives warehouse workflows: standard pick/pack vs digital delivery vs preorder.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS fulfillment_type text
    CHECK (
      fulfillment_type IS NULL OR
      fulfillment_type IN ('standard', 'digital', 'preorder', 'backorder')
    )
    DEFAULT 'standard';

-- ── Tax class ────────────────────────────────────────────────────────────────
-- Maps to tax configuration for tax-inclusive/exclusive pricing regions.
-- Kept as free text for flexibility (GST, VAT, HSN codes, etc.).

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS tax_class text;

-- ── Return eligibility ───────────────────────────────────────────────────────
-- Digital products are typically non-returnable by default.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS is_returnable boolean NOT NULL DEFAULT true;

-- ── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_products_fulfillment_type
  ON public.products (fulfillment_type)
  WHERE fulfillment_type IS NOT NULL;

-- ── Comments ─────────────────────────────────────────────────────────────────

COMMENT ON COLUMN public.products.length_cm IS
  'Packaged product length in centimetres (for shipping cost calculation).';

COMMENT ON COLUMN public.products.width_cm IS
  'Packaged product width in centimetres.';

COMMENT ON COLUMN public.products.height_cm IS
  'Packaged product height in centimetres.';

COMMENT ON COLUMN public.products.fulfillment_type IS
  'Warehouse workflow type: standard | digital | preorder | backorder. Defaults to standard.';

COMMENT ON COLUMN public.products.tax_class IS
  'Tax class identifier (e.g. GST_5, VAT_20, EXEMPT). Resolved by regional tax config.';

COMMENT ON COLUMN public.products.is_returnable IS
  'Whether this product is eligible for return/refund. Default true. Set false for digital, food, etc.';
