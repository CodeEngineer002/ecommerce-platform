-- ============================================================================
-- Migration 00070: COD cap moves to country_payment_methods (DB-driven)
-- ============================================================================
--
-- PROBLEM (live bug, 2026-05-26):
--   Admin enabled COD for US via the new country_payment_methods table.
--   /api/serviceability/check returned {cod_enabled: true} for US 92909.
--   But the COD radio still showed "not available in this region" because
--   the OLD region-config TS file had codMaxAmount: null for US — meaning
--   "COD disabled" in legacy semantics — and that override beat the table.
--
-- ROOT CAUSE:
--   Two sources of truth for "is COD enabled for this country":
--     1. country_payment_methods.is_enabled  ← admin-toggleable, new
--     2. region-config.codMaxAmount=null     ← deploy-time, old
--   They disagreed.
--
-- FIX (this migration + companion TS changes):
--   • Add cod_max_amount column to country_payment_methods.
--     - NULL  = no upper cap (use any amount as long as method is enabled)
--     - >= 0  = max accepted COD total in the country's currency
--   • Backfill: IN/cod → 10000, AE/cod → 1000 (mirrors the old TS values).
--   • DB trigger now reads from country_payment_methods exclusively:
--     - is_enabled=false       → block
--     - is_enabled=true + cap  → block if amount > cap
--     - is_enabled=true + NULL → allow any amount
--   • Region-config codMaxAmount field becomes deprecated (TS changes
--     separately stop reading it — kept on the type to avoid breaking
--     existing seed code).
--
-- IDEMPOTENCY:
--   ADD COLUMN IF NOT EXISTS + idempotent UPDATE + CREATE OR REPLACE FUNCTION.
-- ============================================================================

-- ── 1. New column ────────────────────────────────────────────────────────────
ALTER TABLE public.country_payment_methods
  ADD COLUMN IF NOT EXISTS cod_max_amount numeric(12,2);

COMMENT ON COLUMN public.country_payment_methods.cod_max_amount IS
  'For method=cod only. NULL = no cap. Positive value = max accepted total.';

-- ── 2. Backfill from former region-config values ────────────────────────────
UPDATE public.country_payment_methods
   SET cod_max_amount = CASE country_code
     WHEN 'IN' THEN 10000
     WHEN 'AE' THEN 1000
     ELSE cod_max_amount  -- leave nulls/explicit values untouched
   END
 WHERE method = 'cod'
   AND cod_max_amount IS NULL;

-- ── 3. Rewrite the trigger to read from the table ───────────────────────────
CREATE OR REPLACE FUNCTION public._enforce_cod_amount_limit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_country   text;
  v_row       RECORD;
BEGIN
  IF NEW.provider <> 'cod' THEN
    RETURN NEW;
  END IF;

  -- Resolve shipping country off the order
  SELECT shipping_address->>'country' INTO v_country
    FROM public.orders
   WHERE id = NEW.order_id;

  IF v_country IS NULL THEN
    RAISE EXCEPTION 'Cannot enforce COD: order has no shipping country'
      USING ERRCODE = 'P0030';
  END IF;

  SELECT is_enabled, cod_max_amount
    INTO v_row
    FROM public.country_payment_methods
   WHERE country_code = upper(trim(v_country))
     AND method       = 'cod';

  IF NOT FOUND OR NOT v_row.is_enabled THEN
    RAISE EXCEPTION
      'COD not available for country %', v_country
      USING ERRCODE = 'P0030';
  END IF;

  IF v_row.cod_max_amount IS NOT NULL AND NEW.amount > v_row.cod_max_amount THEN
    RAISE EXCEPTION
      'COD amount % exceeds cap % for country %',
      NEW.amount, v_row.cod_max_amount, v_country
      USING ERRCODE = 'P0031';
  END IF;

  RETURN NEW;
END;
$$;
