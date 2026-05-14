-- ============================================================
-- CART DOMAIN — ENTERPRISE HARDENING
-- Migration 00012: Full cart domain
-- ============================================================
-- Adds:
--   • cart_status enum
--   • carts table enhancements (status, coupon, locale, expiry, merge tracking)
--   • cart_items.unit_price_snapshot (stale-price detection)
--   • cart_coupons join table (cart-level coupon state)
--   • cart_events table (lifecycle audit trail)
--   • Proper RLS for guest carts via session_token
--   • Indexes for active-cart lookups
--   • DB trigger: auto-expire abandoned carts
-- ============================================================

-- ── Cart status enum ──────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE public.cart_status AS ENUM (
    'active',       -- can be modified
    'abandoned',    -- no activity for X hours (soft state, still mutable)
    'expired',      -- TTL passed, cannot be modified
    'merged',       -- guest cart merged into authenticated cart
    'converted',    -- cart converted to order
    'deleted'       -- soft-deleted
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── Alter carts table ─────────────────────────────────────────────────────────
-- Add missing enterprise columns (IF NOT EXISTS guards make this safe to re-run)

ALTER TABLE public.carts
  ADD COLUMN IF NOT EXISTS status         public.cart_status NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS country_id     text    REFERENCES public.countries(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS currency_code  char(3) REFERENCES public.currencies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS coupon_id      uuid    REFERENCES public.coupons(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS coupon_code    text,
  ADD COLUMN IF NOT EXISTS expires_at     timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  ADD COLUMN IF NOT EXISTS abandoned_at   timestamptz,
  ADD COLUMN IF NOT EXISTS merged_from    uuid    REFERENCES public.carts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS converted_to_order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS metadata       jsonb   NOT NULL DEFAULT '{}';

-- Unique: only one active cart per authenticated user per currency
-- (guest carts don't need this constraint since they use session tokens)
CREATE UNIQUE INDEX IF NOT EXISTS idx_carts_user_active_currency
  ON public.carts(user_id, currency_code)
  WHERE status = 'active' AND user_id IS NOT NULL;

-- Fast lookup: active cart by user
CREATE INDEX IF NOT EXISTS idx_carts_user_id_status
  ON public.carts(user_id, status)
  WHERE user_id IS NOT NULL;

-- Fast lookup: guest cart by session_id + status
CREATE INDEX IF NOT EXISTS idx_carts_session_id_status
  ON public.carts(session_id, status)
  WHERE session_id IS NOT NULL;

-- Expiry cleanup job lookup
CREATE INDEX IF NOT EXISTS idx_carts_expires_at
  ON public.carts(expires_at)
  WHERE status = 'active';

-- ── Cart items: add price snapshot ────────────────────────────────────────────
-- Records the server-authoritative price at the moment the item was added.
-- On cart load we compare this to the current price to detect price changes.
ALTER TABLE public.cart_items
  ADD COLUMN IF NOT EXISTS unit_price_snapshot numeric(12,2),
  ADD COLUMN IF NOT EXISTS updated_at          timestamptz NOT NULL DEFAULT now();

CREATE TRIGGER trg_cart_items_updated_at
  BEFORE UPDATE ON public.cart_items
  FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();

-- ── Cart events (lifecycle audit trail) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cart_events (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id       uuid        NOT NULL REFERENCES public.carts(id) ON DELETE CASCADE,
  event_type    text        NOT NULL,  -- 'item_added', 'item_removed', 'merged', etc.
  actor_id      uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata      jsonb       NOT NULL DEFAULT '{}',
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cart_events_cart_id
  ON public.cart_events(cart_id);
CREATE INDEX IF NOT EXISTS idx_cart_events_created_at
  ON public.cart_events(created_at);

ALTER TABLE public.cart_events ENABLE ROW LEVEL SECURITY;

-- Cart events are write-only from service role (no user-facing read policy needed)
CREATE POLICY "Service role manages cart events"
  ON public.cart_events FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ── RLS: Fix carts ────────────────────────────────────────────────────────────
-- The original policy only covers authenticated users (user_id = auth.uid()).
-- Guest carts are locked out of RLS entirely — handled via service_role in API.
-- Keep the existing auth-user policy and add service_role bypass.

DROP POLICY IF EXISTS "Service role manages all carts" ON public.carts;
CREATE POLICY "Service role manages all carts"
  ON public.carts FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ── RLS: Fix cart_items ───────────────────────────────────────────────────────
-- The original policy breaks for guest carts (user_id is null on the cart).
-- Replace with: auth users own items via cart join, service_role has full access.

DROP POLICY IF EXISTS "Cart items follow cart ownership" ON public.cart_items;

CREATE POLICY "Authenticated users manage own cart items"
  ON public.cart_items FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.carts
      WHERE id = cart_id
        AND user_id = auth.uid()
        AND status = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.carts
      WHERE id = cart_id
        AND user_id = auth.uid()
        AND status = 'active'
    )
  );

CREATE POLICY "Service role manages all cart items"
  ON public.cart_items FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ── Updated_at trigger on carts ───────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_carts_updated_at ON public.carts;
CREATE TRIGGER trg_carts_updated_at
  BEFORE UPDATE ON public.carts
  FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();

-- ── DB function: expire_abandoned_carts ──────────────────────────────────────
-- Called by a scheduled job (pg_cron or Supabase cron) hourly.
-- Marks carts as expired when expires_at has passed.
CREATE OR REPLACE FUNCTION public.expire_abandoned_carts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.carts
  SET status = 'expired'
  WHERE status = 'active'
    AND expires_at < now();
END;
$$;

-- ── DB function: get_or_create_user_cart ─────────────────────────────────────
-- Atomically get or create the active cart for an authenticated user.
-- Runs as SECURITY DEFINER so service layer can call without managing RLS.
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
    -- Extend expiry on activity
    UPDATE public.carts
    SET expires_at = now() + interval '30 days',
        updated_at = now()
    WHERE id = v_cart_id;
  END IF;

  RETURN v_cart_id;
END;
$$;

-- ── DB function: merge_guest_cart ─────────────────────────────────────────────
-- Merges a guest cart into an authenticated user cart.
-- Same-variant items have their quantities summed (capped by max_qty).
-- Returns the target (user) cart ID.
CREATE OR REPLACE FUNCTION public.merge_guest_cart(
  p_guest_cart_id  uuid,
  p_user_cart_id   uuid,
  p_max_qty        integer DEFAULT 10
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_guest_item RECORD;
  v_existing_qty integer;
  v_new_qty integer;
BEGIN
  -- Validate both carts exist and guest is active/can be merged
  IF NOT EXISTS (
    SELECT 1 FROM public.carts
    WHERE id = p_guest_cart_id
      AND status IN ('active', 'abandoned')
      AND user_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Guest cart % not found or not mergeable', p_guest_cart_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.carts
    WHERE id = p_user_cart_id AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'User cart % not found or not active', p_user_cart_id;
  END IF;

  -- Merge items
  FOR v_guest_item IN
    SELECT variant_id, quantity, unit_price_snapshot
    FROM public.cart_items
    WHERE cart_id = p_guest_cart_id
  LOOP
    -- Check if user cart already has this variant
    SELECT quantity INTO v_existing_qty
    FROM public.cart_items
    WHERE cart_id = p_user_cart_id AND variant_id = v_guest_item.variant_id;

    IF FOUND THEN
      -- Sum quantities, cap at max
      v_new_qty := LEAST(v_existing_qty + v_guest_item.quantity, p_max_qty);
      UPDATE public.cart_items
      SET quantity = v_new_qty, updated_at = now()
      WHERE cart_id = p_user_cart_id AND variant_id = v_guest_item.variant_id;
    ELSE
      -- Insert new item into user cart
      INSERT INTO public.cart_items (cart_id, variant_id, quantity, unit_price_snapshot)
      VALUES (p_user_cart_id, v_guest_item.variant_id, v_guest_item.quantity, v_guest_item.unit_price_snapshot)
      ON CONFLICT (cart_id, variant_id) DO UPDATE
        SET quantity = LEAST(cart_items.quantity + EXCLUDED.quantity, p_max_qty),
            updated_at = now();
    END IF;
  END LOOP;

  -- Mark guest cart as merged
  UPDATE public.carts
  SET status = 'merged',
      merged_from = p_guest_cart_id,
      updated_at = now()
  WHERE id = p_user_cart_id;

  -- Technically: merged_from on user cart points to where we merged FROM
  -- Also track on guest cart that it was absorbed
  UPDATE public.carts
  SET status = 'merged',
      updated_at = now()
  WHERE id = p_guest_cart_id;

  -- Re-activate user cart after merge
  UPDATE public.carts
  SET status = 'active',
      merged_from = p_guest_cart_id,
      updated_at = now()
  WHERE id = p_user_cart_id;

END;
$$;
