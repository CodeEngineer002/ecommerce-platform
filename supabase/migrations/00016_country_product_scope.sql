-- ─────────────────────────────────────────────────────────────────────────────
-- 00016_country_product_scope.sql
-- Country-scoped products and per-country inventory.
--
-- Design decisions:
--   • products.available_country_ids = '{}'  → available in ALL countries (default, backward-compat)
--   • products.available_country_ids = '{in,de}' → only India + Germany
--   • country_inventory: per-country stock pool; if no row → falls back to global inventory
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Product country availability ──────────────────────────────────────────

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS available_country_ids text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.products.available_country_ids IS
  'Empty = available everywhere. Non-empty = only in listed country IDs.';

CREATE INDEX IF NOT EXISTS idx_products_country_ids
  ON public.products USING GIN(available_country_ids);

-- ── 2. Per-country inventory pool ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.country_inventory (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id  uuid        NOT NULL REFERENCES public.product_variants(id) ON DELETE CASCADE,
  country_id  text        NOT NULL REFERENCES public.countries(id) ON DELETE CASCADE,
  quantity    integer     NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  reserved    integer     NOT NULL DEFAULT 0 CHECK (reserved >= 0),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE(variant_id, country_id)
);

COMMENT ON TABLE public.country_inventory IS
  'Per-country stock pool. If no row exists for a country, storefront falls back to global inventory table.';

CREATE INDEX IF NOT EXISTS idx_country_inv_variant  ON public.country_inventory(variant_id);
CREATE INDEX IF NOT EXISTS idx_country_inv_country  ON public.country_inventory(country_id);

CREATE OR REPLACE TRIGGER trg_country_inventory_updated_at
  BEFORE UPDATE ON public.country_inventory
  FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();

ALTER TABLE public.country_inventory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read country inventory" ON public.country_inventory;
CREATE POLICY "Public read country inventory"
  ON public.country_inventory FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins manage country inventory" ON public.country_inventory;
CREATE POLICY "Admins manage country inventory"
  ON public.country_inventory FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ── 3. Country management: allow admin to toggle is_active on countries ───────

-- countries table already has is_active — just need admin RLS policy for writes
DROP POLICY IF EXISTS "Admins manage countries" ON public.countries;
CREATE POLICY "Admins manage countries"
  ON public.countries FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Similarly for locales
DROP POLICY IF EXISTS "Admins manage locales" ON public.locales;
CREATE POLICY "Admins manage locales"
  ON public.locales FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- And region_configs
DROP POLICY IF EXISTS "Admins manage region_configs" ON public.region_configs;
CREATE POLICY "Admins manage region_configs"
  ON public.region_configs FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ── 4. Helper function: effective available stock for a variant in a country ──

CREATE OR REPLACE FUNCTION public.available_stock_for_country(
  p_variant_id uuid,
  p_country_id text
) RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT COALESCE(
    -- 1. Country-specific pool (if configured)
    (SELECT quantity - reserved
     FROM public.country_inventory
     WHERE variant_id = p_variant_id AND country_id = p_country_id
     LIMIT 1),
    -- 2. Fall back to global inventory
    (SELECT quantity - reserved
     FROM public.inventory
     WHERE variant_id = p_variant_id
     LIMIT 1),
    0
  );
$$;
