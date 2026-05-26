-- ============================================================================
-- Migration 00065: P0-1 — DB-level guard for COD amount limits
-- ============================================================================
--
-- The TypeScript layer (region-config.ts + /api/orders/create) is the primary
-- gate. This migration adds a redundant DB-level CHECK so that any code path
-- that creates a payment with provider='cod' for an over-limit amount fails
-- loudly instead of silently accepting a risky order.
--
-- The CHECK uses a hardcoded cap per known country code stored in the
-- payments.metadata field at insert time. Since we don't have a region_configs
-- table referenced from payments, we keep this as a soft trigger that reads
-- the order's shipping country and the codMaxAmount agreed with the app.
--
-- LIMITS (must match src/lib/i18n/region-config.ts):
--   IN  = 10000  (₹10,000)
--   AE  = 1000   (AED 1,000)
--   others = COD disabled
--
-- Going forward, when ops needs to adjust a country's limit, the change must
-- be made in BOTH places (TS config + this migration). Acceptable because
-- limits change rarely and we want one screen of truth on each side.
-- ============================================================================

CREATE OR REPLACE FUNCTION public._enforce_cod_amount_limit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_country  text;
  v_max      numeric;
BEGIN
  IF NEW.provider <> 'cod' THEN
    RETURN NEW;
  END IF;

  -- Read shipping country off the order
  SELECT shipping_address->>'country' INTO v_country
    FROM public.orders
   WHERE id = NEW.order_id;

  v_max := CASE upper(COALESCE(v_country, ''))
    WHEN 'IN' THEN 10000
    WHEN 'AE' THEN 1000
    ELSE NULL  -- COD disabled
  END;

  IF v_max IS NULL THEN
    RAISE EXCEPTION
      'COD not available for country %', COALESCE(v_country, '(none)')
      USING ERRCODE = 'P0030';
  END IF;

  IF NEW.amount > v_max THEN
    RAISE EXCEPTION
      'COD amount % exceeds limit % for country %', NEW.amount, v_max, v_country
      USING ERRCODE = 'P0031';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_cod_amount_limit ON public.payments;
CREATE TRIGGER trg_enforce_cod_amount_limit
  BEFORE INSERT ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public._enforce_cod_amount_limit();
