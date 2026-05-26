-- ============================================================================
-- Migration 00071: Per-currency variant pricing
-- ============================================================================
--
-- PROBLEM:
--   product_variants has a single `price` column. The storefront renders that
--   number with the customer's currency symbol via getCurrencyForCountry(),
--   which means an IN customer sees ₹150 and a US customer sees $150 — same
--   number, two very different economic values. Real ecommerce pricing is a
--   marketing decision ($99 maps to ₹8,499, not ₹8,217 from FX), so we need a
--   per-market price book.
--
-- DESIGN:
--   `product_variant_prices` — sibling table to product_variants.
--   One row per (variant_id, currency_code). Optional compare_price for the
--   strike-through display. is_active lets ops temporarily hide a market
--   price without deleting it.
--
--   resolve_variant_pricing(variant_id, currency) function returns the best-
--   available price with a 3-step fallback:
--     1. product_variant_prices override for the requested currency
--     2. Legacy product_variants.price (assumed canonical USD scale)
--     3. products.base_price (last resort)
--
--   Fallback step 2 preserves today's exact behaviour, so existing reads can
--   migrate to the resolver without any user-visible change. Per-market
--   prices are opt-in: a missing override = today's behaviour.
--
-- IDEMPOTENCY:
--   CREATE TABLE IF NOT EXISTS, DROP FUNCTION before CREATE, ON CONFLICT
--   DO NOTHING on the USD backfill.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.product_variant_prices (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id     uuid NOT NULL REFERENCES public.product_variants(id) ON DELETE CASCADE,
  currency_code  text NOT NULL,
  price          numeric(12,2) NOT NULL CHECK (price >= 0),
  compare_price  numeric(12,2) CHECK (compare_price IS NULL OR compare_price >= price),
  is_active      boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_variant_prices_variant_ccy_key
    UNIQUE (variant_id, currency_code),
  CONSTRAINT product_variant_prices_ccy_format_chk
    CHECK (currency_code = upper(currency_code) AND length(currency_code) = 3)
);

CREATE INDEX IF NOT EXISTS idx_pvp_variant
  ON public.product_variant_prices (variant_id);
CREATE INDEX IF NOT EXISTS idx_pvp_currency_price
  ON public.product_variant_prices (currency_code, price)
  WHERE is_active = true;

-- updated_at trigger — same convention as other tables
DROP TRIGGER IF EXISTS trg_product_variant_prices_updated_at
  ON public.product_variant_prices;
CREATE TRIGGER trg_product_variant_prices_updated_at
  BEFORE UPDATE ON public.product_variant_prices
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Public read for active rows (storefront needs price lookup).
-- Admins manage via service-role from the route handlers; explicit ALL policy
-- so future authenticated-admin-with-jwt paths also work.
ALTER TABLE public.product_variant_prices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read active variant prices"
  ON public.product_variant_prices;
CREATE POLICY "Public read active variant prices"
  ON public.product_variant_prices
  FOR SELECT
  USING (is_active = true);

DROP POLICY IF EXISTS "Admins manage variant prices"
  ON public.product_variant_prices;
CREATE POLICY "Admins manage variant prices"
  ON public.product_variant_prices
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ── Resolver function ───────────────────────────────────────────────────────
-- Returns price + compare_price for a (variant, currency) pair. Always returns
-- exactly one row. Compare_price may be null if no override + legacy didn't
-- carry it; that's intentional — caller treats null as "no strike-through".
DROP FUNCTION IF EXISTS public.resolve_variant_pricing(uuid, text);
CREATE OR REPLACE FUNCTION public.resolve_variant_pricing(
  p_variant_id uuid,
  p_currency   text DEFAULT 'USD'
)
RETURNS TABLE (price numeric, compare_price numeric)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH override AS (
    SELECT pvp.price, pvp.compare_price
      FROM public.product_variant_prices pvp
     WHERE pvp.variant_id = p_variant_id
       AND pvp.currency_code = upper(p_currency)
       AND pvp.is_active = true
     LIMIT 1
  ),
  legacy AS (
    SELECT v.price AS variant_price, p.compare_price AS product_compare, p.base_price AS product_base
      FROM public.product_variants v
      JOIN public.products p ON p.id = v.product_id
     WHERE v.id = p_variant_id
  )
  SELECT
    COALESCE(
      (SELECT price FROM override),
      (SELECT variant_price FROM legacy),
      (SELECT product_base  FROM legacy)
    ) AS price,
    COALESCE(
      (SELECT compare_price FROM override),
      (SELECT product_compare FROM legacy)
    ) AS compare_price;
$$;

-- Batched variant of the resolver — accepts an array of variant ids and
-- returns one row per variant. App code uses this for cart/checkout so we
-- don't fire N round-trips for an N-line cart.
DROP FUNCTION IF EXISTS public.resolve_variant_pricing_batch(uuid[], text);
CREATE OR REPLACE FUNCTION public.resolve_variant_pricing_batch(
  p_variant_ids uuid[],
  p_currency    text DEFAULT 'USD'
)
RETURNS TABLE (variant_id uuid, price numeric, compare_price numeric)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT v.id AS variant_id,
         COALESCE(pvp.price, v.price, p.base_price)        AS price,
         COALESCE(pvp.compare_price, p.compare_price)      AS compare_price
    FROM public.product_variants v
    JOIN public.products p ON p.id = v.product_id
    LEFT JOIN public.product_variant_prices pvp
      ON pvp.variant_id = v.id
     AND pvp.currency_code = upper(p_currency)
     AND pvp.is_active = true
   WHERE v.id = ANY(p_variant_ids);
$$;

-- ── USD backfill ────────────────────────────────────────────────────────────
-- Capture the canonical USD price (the legacy variant.price column post
-- migration 00070's data fix) into the new table. Idempotent — re-running is
-- a no-op thanks to the UNIQUE constraint.
INSERT INTO public.product_variant_prices (variant_id, currency_code, price, compare_price)
SELECT v.id, 'USD', v.price, p.compare_price
  FROM public.product_variants v
  JOIN public.products p ON p.id = v.product_id
 WHERE v.is_active = true AND v.price IS NOT NULL
ON CONFLICT (variant_id, currency_code) DO NOTHING;
