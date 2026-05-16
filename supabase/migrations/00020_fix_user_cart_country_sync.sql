-- ── Migration 00020: Fix user cart country + currency sync ───────────────────
--
-- PROBLEM: get_or_create_user_cart only set country_id/currency on INSERT.
-- When a user switched regions (e.g. /in/en/ → /us/en/), the existing cart
-- kept country_id='in' and currency_code='INR', causing pricing to always use
-- India GST (18%) and show INR regardless of the active store region.
--
-- FIX 1: Remove currency_code from the WHERE clause — a user should always
--         find their cart regardless of what currency it was created in.
-- FIX 2: UPDATE both country_id AND currency_code in the existing-cart branch
--         so the cart always mirrors the current region on every request.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_or_create_user_cart(
  p_user_id      uuid,
  p_currency     char(3)  DEFAULT 'INR',
  p_country_id   text     DEFAULT 'in'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cart_id uuid;
BEGIN
  -- Find existing active cart (no currency filter — we update it below)
  SELECT id INTO v_cart_id
  FROM public.carts
  WHERE user_id = p_user_id
    AND status = 'active'
  ORDER BY created_at DESC
  LIMIT 1;

  -- Create if not found
  IF v_cart_id IS NULL THEN
    INSERT INTO public.carts (user_id, currency_code, country_id, status, expires_at)
    VALUES (p_user_id, p_currency, p_country_id, 'active', now() + interval '30 days')
    RETURNING id INTO v_cart_id;
  ELSE
    -- Extend expiry AND sync country + currency to the active store region
    UPDATE public.carts
    SET expires_at    = now() + interval '30 days',
        updated_at    = now(),
        country_id    = p_country_id,
        currency_code = p_currency
    WHERE id = v_cart_id;
  END IF;

  RETURN v_cart_id;
END;
$$;
