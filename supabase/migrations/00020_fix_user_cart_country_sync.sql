-- ── Migration 00020: Fix user cart country sync ──────────────────────────────
--
-- PROBLEM: get_or_create_user_cart only set country_id on INSERT (new carts).
-- When a user switched store regions (e.g. /in/en/ → /us/en/) their existing
-- cart kept country_id = 'in', causing the pricing engine to always use India
-- GST (18%) regardless of the active region.
--
-- FIX: Also UPDATE country_id in the existing-cart branch so the cart always
-- mirrors the current store region context passed from the middleware header.
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
  -- Try to find existing active cart
  SELECT id INTO v_cart_id
  FROM public.carts
  WHERE user_id = p_user_id
    AND status = 'active'
    AND (currency_code = p_currency OR currency_code IS NULL)
  ORDER BY created_at DESC
  LIMIT 1;

  -- Create if not found
  IF v_cart_id IS NULL THEN
    INSERT INTO public.carts (user_id, currency_code, country_id, status, expires_at)
    VALUES (p_user_id, p_currency, p_country_id, 'active', now() + interval '30 days')
    RETURNING id INTO v_cart_id;
  ELSE
    -- Extend expiry on activity AND sync country to active store region
    UPDATE public.carts
    SET expires_at  = now() + interval '30 days',
        updated_at  = now(),
        country_id  = p_country_id
    WHERE id = v_cart_id;
  END IF;

  RETURN v_cart_id;
END;
$$;
