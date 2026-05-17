-- ============================================================
-- MIGRATION 00025 — PRODUCT IDENTIFIER MODEL
-- Establishes enterprise-grade catalog identifiers:
--   products.product_code   — human/business-readable product code (style code)
--   product_variants.barcode        — GTIN/EAN/UPC (variant level)
--   product_variants.supplier_sku   — supplier reconciliation code
--   product_variants.color_code     — standardized color abbreviation (BLK, BEI, OLV…)
--   product_variants.size_code      — standardized size code (XS, S, M, L, XL, XXL)
--   product_variants.is_default     — default variant flag for PDP/admin
--
-- ADR-008: product_code (product/style level) + sku (variant/sellable level)
--          are the canonical catalog identifiers.
-- ============================================================

-- ── products.product_code ─────────────────────────────────────────────────────
-- The human-readable business code that identifies the product style.
-- Backfilled from products.sku (already used as: ELEC-001, FASH-003).
-- products.sku is retained for backward compat.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS product_code text;

-- Backfill from existing sku values (ELEC-001, FASH-001, FASH-002, FASH-003, etc.)
UPDATE public.products
  SET product_code = sku
  WHERE product_code IS NULL AND sku IS NOT NULL;

-- For products without an sku (unlikely but safe), generate a placeholder
UPDATE public.products
  SET product_code = 'PC-' || UPPER(SUBSTRING(id::text, 1, 8))
  WHERE product_code IS NULL;

-- Enforce uniqueness and add index
ALTER TABLE public.products
  ADD CONSTRAINT products_product_code_unique UNIQUE (product_code);

CREATE INDEX IF NOT EXISTS idx_products_product_code
  ON public.products (product_code);

-- ── product_variants — new identifier columns ─────────────────────────────────

-- Variant-level barcode (GTIN/EAN/UPC). Unique where set — prevents duplicate barcodes.
ALTER TABLE public.product_variants
  ADD COLUMN IF NOT EXISTS barcode text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_product_variants_barcode_unique
  ON public.product_variants (barcode)
  WHERE barcode IS NOT NULL;

-- Supplier SKU — external supplier reference code for ERP/procurement integration
ALTER TABLE public.product_variants
  ADD COLUMN IF NOT EXISTS supplier_sku text;

CREATE INDEX IF NOT EXISTS idx_product_variants_supplier_sku
  ON public.product_variants (supplier_sku)
  WHERE supplier_sku IS NOT NULL;

-- Standardized color abbreviation code (BLK, BEI, OLV, NVY, CHR, WHT, …)
-- Derived from options->>'color' via lookup. Backfilled below.
ALTER TABLE public.product_variants
  ADD COLUMN IF NOT EXISTS color_code text;

-- Standardized size code (XS, S, M, L, XL, XXL, ONE, …)
-- Derived from options->>'size'. Backfilled below.
ALTER TABLE public.product_variants
  ADD COLUMN IF NOT EXISTS size_code text;

-- Composite index for warehouse/barcode scan lookups by color+size
CREATE INDEX IF NOT EXISTS idx_product_variants_color_size
  ON public.product_variants (color_code, size_code)
  WHERE color_code IS NOT NULL;

-- Explicit index on sku for admin search (UNIQUE constraint creates one,
-- but adding IF NOT EXISTS is safe and documents intent)
CREATE INDEX IF NOT EXISTS idx_product_variants_sku
  ON public.product_variants (sku)
  WHERE sku IS NOT NULL;

-- Default variant flag — one variant per product can be flagged as the
-- canonical default shown on the PDP and used as the primary catalog image anchor
ALTER TABLE public.product_variants
  ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false;

-- ── Backfill color_code from options jsonb ────────────────────────────────────
-- Maps full color names (as stored in options->>'color') to standardized codes.
-- Existing SKUs (FASH-003-BLACK-XS) are NOT changed — color_code is a new field.

UPDATE public.product_variants
  SET color_code = CASE UPPER(TRIM(options->>'color'))
    WHEN 'BLACK'     THEN 'BLK'
    WHEN 'BEIGE'     THEN 'BEI'
    WHEN 'OLIVE'     THEN 'OLV'
    WHEN 'NAVY'      THEN 'NVY'
    WHEN 'CHARCOAL'  THEN 'CHR'
    WHEN 'WHITE'     THEN 'WHT'
    WHEN 'RED'       THEN 'RED'
    WHEN 'BLUE'      THEN 'BLU'
    WHEN 'GREEN'     THEN 'GRN'
    WHEN 'YELLOW'    THEN 'YLW'
    WHEN 'PINK'      THEN 'PNK'
    WHEN 'ORANGE'    THEN 'ORG'
    WHEN 'GREY'      THEN 'GRY'
    WHEN 'GRAY'      THEN 'GRY'
    WHEN 'PURPLE'    THEN 'PRP'
    WHEN 'BROWN'     THEN 'BRN'
    WHEN 'GOLD'      THEN 'GLD'
    WHEN 'SILVER'    THEN 'SLV'
    ELSE NULL
  END
  WHERE options->>'color' IS NOT NULL
    AND color_code IS NULL;

-- ── Backfill size_code from options jsonb ─────────────────────────────────────
-- Size codes are already standardized (XS, S, M, L, XL, XXL) — use as-is.
-- For numeric sizes or shoe sizes, a manual mapping step is logged.

UPDATE public.product_variants
  SET size_code = UPPER(TRIM(options->>'size'))
  WHERE options->>'size' IS NOT NULL
    AND size_code IS NULL
    AND UPPER(TRIM(options->>'size')) IN ('XS','S','M','L','XL','XXL','2XL','3XL','ONE','OS');

-- ── is_default: flag the 'M' or first variant per product as default ──────────
-- This is a one-time bootstrap. Admins can update per product.
-- Strategy: prefer size M, then L, then first variant by created_at.

WITH ranked AS (
  SELECT
    id,
    product_id,
    ROW_NUMBER() OVER (
      PARTITION BY product_id
      ORDER BY
        CASE size_code
          WHEN 'M'  THEN 1
          WHEN 'L'  THEN 2
          WHEN 'S'  THEN 3
          WHEN 'XL' THEN 4
          WHEN 'XS' THEN 5
          WHEN 'XXL' THEN 6
          ELSE 99
        END,
        created_at ASC
    ) AS rn
  FROM public.product_variants
  WHERE is_active = true
)
UPDATE public.product_variants pv
  SET is_default = true
  FROM ranked r
  WHERE pv.id = r.id AND r.rn = 1;

-- ── order_items — add product_code snapshot column ───────────────────────────
-- Ensures future orders capture product_code alongside sku.
-- Existing orders already have snapshot jsonb; we enrich the schema column
-- so the order creation route can write it directly.

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS product_code text;

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS color text;

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS size text;

-- Backfill product_code for existing order_items that have a variant_id
UPDATE public.order_items oi
  SET product_code = p.product_code
  FROM public.product_variants pv
  JOIN public.products p ON p.id = pv.product_id
  WHERE oi.variant_id = pv.id
    AND oi.product_code IS NULL;

-- Backfill color/size for existing order_items from variant options
UPDATE public.order_items oi
  SET
    color = pv.options->>'color',
    size  = pv.options->>'size'
  FROM public.product_variants pv
  WHERE oi.variant_id = pv.id
    AND (oi.color IS NULL OR oi.size IS NULL);

-- Index for admin search/filter by product_code on order_items
CREATE INDEX IF NOT EXISTS idx_order_items_product_code
  ON public.order_items (product_code)
  WHERE product_code IS NOT NULL;

-- ── RLS: new columns inherit table-level policies (no new policies needed) ────
-- products and product_variants RLS is already set up.
-- order_items RLS is already set up.

-- ── Verification queries (run manually after push to confirm) ─────────────────
-- SELECT id, name, sku, product_code FROM public.products ORDER BY created_at;
-- SELECT id, product_id, name, sku, color_code, size_code, is_default FROM public.product_variants WHERE product_id IN (SELECT id FROM public.products WHERE sku = 'FASH-003');
-- SELECT COUNT(*) FROM public.product_variants WHERE color_code IS NOT NULL;
-- SELECT COUNT(*) FROM public.product_variants WHERE size_code IS NOT NULL;
-- SELECT COUNT(*) FROM public.product_variants WHERE is_default = true;
