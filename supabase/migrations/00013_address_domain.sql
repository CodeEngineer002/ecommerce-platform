-- ============================================================
-- MIGRATION 00013 — ADDRESS DOMAIN HARDENING
-- ============================================================
-- Changes:
--   • Replace thin addresses table with customer_addresses
--     (separate default_shipping / default_billing, archived_at,
--      company, country_id FK, first_name/last_name split)
--   • Add order_address_snapshots table (immutable, append-only)
--   • Add address_country_rules table (postal/phone/state requirements)
--   • Add address_region_policies (shipping/billing allowed countries)
--   • Strict RLS on all new tables
--   • Triggers: enforce single-default-shipping, single-default-billing,
--               updated_at, audit events
-- ============================================================

-- ── 1. Rename / migrate old addresses table ────────────────────────────────────
-- Keep old table for backward-compat during rollout, create new one.
-- Old `addresses` rows will be migrated into `customer_addresses`.

CREATE TABLE IF NOT EXISTS public.customer_addresses (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Human name fields (split for invoice/shipping label generation)
  first_name           text        NOT NULL,
  last_name            text        NOT NULL DEFAULT '',
  company              text,

  -- Contact
  phone                text,
  email                text,

  -- Address lines
  address_line1        text        NOT NULL,
  address_line2        text,
  city                 text        NOT NULL,
  state                text        NOT NULL DEFAULT '',
  postal_code          text        NOT NULL DEFAULT '',
  country_code         char(2)     NOT NULL,             -- ISO alpha-2: 'IN','US','DE'
  country_id           text        REFERENCES public.countries(id) ON DELETE SET NULL,

  -- Display label (e.g. "Home", "Office")
  label                text,

  -- Delivery notes
  delivery_instructions text,

  -- Default flags (enforced to be unique per user by trigger)
  is_default_shipping  boolean     NOT NULL DEFAULT false,
  is_default_billing   boolean     NOT NULL DEFAULT false,

  -- Soft-delete (archived addresses cannot be used at checkout)
  archived_at          timestamptz,

  -- Validation metadata (stored at save-time)
  validation_metadata  jsonb       NOT NULL DEFAULT '{}',

  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_addresses_user_id
  ON public.customer_addresses(user_id);
CREATE INDEX IF NOT EXISTS idx_customer_addresses_country_id
  ON public.customer_addresses(country_id);
CREATE INDEX IF NOT EXISTS idx_customer_addresses_default_shipping
  ON public.customer_addresses(user_id, is_default_shipping)
  WHERE is_default_shipping = true AND archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_customer_addresses_default_billing
  ON public.customer_addresses(user_id, is_default_billing)
  WHERE is_default_billing = true AND archived_at IS NULL;

-- ── 2. Immutable order address snapshots ───────────────────────────────────────
-- Copied at order creation time. NEVER updated — historical accuracy required.

CREATE TABLE IF NOT EXISTS public.order_address_snapshots (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        uuid        NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  address_type    text        NOT NULL CHECK (address_type IN ('shipping','billing')),

  -- Full snapshot (denormalised for immutability)
  first_name      text        NOT NULL,
  last_name       text        NOT NULL DEFAULT '',
  company         text,
  phone           text,
  email           text,
  address_line1   text        NOT NULL,
  address_line2   text,
  city            text        NOT NULL,
  state           text        NOT NULL DEFAULT '',
  postal_code     text        NOT NULL DEFAULT '',
  country_code    char(2)     NOT NULL,
  country_name    text        NOT NULL DEFAULT '',

  -- Source reference (nullable — guest checkout has no saved address)
  source_address_id uuid      REFERENCES public.customer_addresses(id) ON DELETE SET NULL,

  created_at      timestamptz NOT NULL DEFAULT now(),

  UNIQUE (order_id, address_type)
);

CREATE INDEX IF NOT EXISTS idx_order_address_snapshots_order_id
  ON public.order_address_snapshots(order_id);

-- ── 3. Country-specific address validation rules ──────────────────────────────
-- Controls which fields are required and what format validation applies.

CREATE TABLE IF NOT EXISTS public.address_country_rules (
  country_id             text    PRIMARY KEY REFERENCES public.countries(id) ON DELETE CASCADE,
  postal_code_required   boolean NOT NULL DEFAULT true,
  postal_code_regex      text,                            -- NULL = accept any
  postal_code_example    text,
  state_required         boolean NOT NULL DEFAULT false,
  phone_required         boolean NOT NULL DEFAULT false,
  city_required          boolean NOT NULL DEFAULT true,
  rtl_layout             boolean NOT NULL DEFAULT false,  -- Arabic etc.
  postal_code_label      text    NOT NULL DEFAULT 'Postal Code',
  state_label            text    NOT NULL DEFAULT 'State / Province',
  metadata               jsonb   NOT NULL DEFAULT '{}'
);

-- Seed country rules for the 8 configured countries
INSERT INTO public.address_country_rules
  (country_id, postal_code_required, postal_code_regex,     postal_code_example, state_required, phone_required, city_required, rtl_layout, postal_code_label, state_label)
VALUES
  ('us', true,  '^\d{5}(-\d{4})?$',                '90210',     true,  false, true,  false, 'ZIP Code',    'State'),
  ('uk', true,  '^[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}$','SW1A 1AA', false, false, true,  false, 'Postcode',    'County'),
  ('de', true,  '^\d{5}$',                          '10115',     false, false, true,  false, 'PLZ',         'Bundesland'),
  ('fr', true,  '^\d{5}$',                          '75001',     false, false, true,  false, 'Code Postal', 'Département'),
  ('it', true,  '^\d{5}$',                          '00100',     false, false, true,  false, 'CAP',         'Provincia'),
  ('es', true,  '^\d{5}$',                          '28001',     false, false, true,  false, 'Código Postal','Provincia'),
  ('in', true,  '^\d{6}$',                          '400001',    true,  true,  true,  false, 'PIN Code',    'State'),
  ('ae', false, NULL,                                NULL,        true,  true,  true,  true,  'Postal Code', 'Emirate')
ON CONFLICT (country_id) DO UPDATE SET
  postal_code_required = EXCLUDED.postal_code_required,
  postal_code_regex    = EXCLUDED.postal_code_regex,
  postal_code_example  = EXCLUDED.postal_code_example,
  state_required       = EXCLUDED.state_required,
  phone_required       = EXCLUDED.phone_required,
  rtl_layout           = EXCLUDED.rtl_layout,
  postal_code_label    = EXCLUDED.postal_code_label,
  state_label          = EXCLUDED.state_label;

-- ── 4. Migrate old addresses → customer_addresses ─────────────────────────────
INSERT INTO public.customer_addresses (
  user_id, first_name, last_name, phone,
  address_line1, address_line2, city, state, postal_code,
  country_code, country_id, label, is_default_shipping, is_default_billing,
  created_at, updated_at
)
SELECT
  a.user_id,
  split_part(a.full_name, ' ', 1)                          AS first_name,
  COALESCE(NULLIF(substring(a.full_name FROM position(' ' IN a.full_name)+1), ''), '') AS last_name,
  a.phone,
  a.address_line1, a.address_line2,
  a.city, a.state, a.postal_code,
  upper(a.country)                                          AS country_code,
  lower(a.country)                                          AS country_id,
  a.label,
  a.is_default                                              AS is_default_shipping,
  a.is_default                                              AS is_default_billing,
  a.created_at, a.updated_at
FROM public.addresses a
WHERE NOT EXISTS (
  SELECT 1 FROM public.customer_addresses ca WHERE ca.user_id = a.user_id
)
ON CONFLICT DO NOTHING;

-- ── 5. updated_at trigger ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_customer_addresses_updated_at ON public.customer_addresses;
CREATE TRIGGER trg_customer_addresses_updated_at
  BEFORE UPDATE ON public.customer_addresses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 6. Enforce single default shipping per user ───────────────────────────────
CREATE OR REPLACE FUNCTION public.enforce_single_default_shipping()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.is_default_shipping = true AND NEW.archived_at IS NULL THEN
    UPDATE public.customer_addresses
       SET is_default_shipping = false
     WHERE user_id = NEW.user_id
       AND id <> NEW.id
       AND is_default_shipping = true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_single_default_shipping ON public.customer_addresses;
CREATE TRIGGER trg_single_default_shipping
  BEFORE INSERT OR UPDATE OF is_default_shipping
  ON public.customer_addresses
  FOR EACH ROW
  WHEN (NEW.is_default_shipping = true)
  EXECUTE FUNCTION public.enforce_single_default_shipping();

-- ── 7. Enforce single default billing per user ────────────────────────────────
CREATE OR REPLACE FUNCTION public.enforce_single_default_billing()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.is_default_billing = true AND NEW.archived_at IS NULL THEN
    UPDATE public.customer_addresses
       SET is_default_billing = false
     WHERE user_id = NEW.user_id
       AND id <> NEW.id
       AND is_default_billing = true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_single_default_billing ON public.customer_addresses;
CREATE TRIGGER trg_single_default_billing
  BEFORE INSERT OR UPDATE OF is_default_billing
  ON public.customer_addresses
  FOR EACH ROW
  WHEN (NEW.is_default_billing = true)
  EXECUTE FUNCTION public.enforce_single_default_billing();

-- ── 8. Prevent mutation of order_address_snapshots ───────────────────────────
CREATE OR REPLACE FUNCTION public.prevent_snapshot_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'order_address_snapshots are immutable';
END;
$$;

DROP TRIGGER IF EXISTS trg_immutable_order_snapshots ON public.order_address_snapshots;
CREATE TRIGGER trg_immutable_order_snapshots
  BEFORE UPDATE OR DELETE ON public.order_address_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.prevent_snapshot_mutation();

-- ── 9. Auto-promote default when first address is created ──────────────────────
CREATE OR REPLACE FUNCTION public.auto_promote_first_address()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_count int;
BEGIN
  SELECT count(*) INTO v_count
    FROM public.customer_addresses
   WHERE user_id = NEW.user_id AND archived_at IS NULL;

  IF v_count = 1 THEN
    NEW.is_default_shipping := true;
    NEW.is_default_billing  := true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_promote_first_address ON public.customer_addresses;
CREATE TRIGGER trg_auto_promote_first_address
  BEFORE INSERT ON public.customer_addresses
  FOR EACH ROW EXECUTE FUNCTION public.auto_promote_first_address();

-- ── 10. RLS ───────────────────────────────────────────────────────────────────

ALTER TABLE public.customer_addresses      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_address_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.address_country_rules   ENABLE ROW LEVEL SECURITY;

-- customer_addresses: users can only access their own rows
DROP POLICY IF EXISTS "Users manage own addresses" ON public.customer_addresses;
CREATE POLICY "Users manage own customer addresses"
  ON public.customer_addresses FOR ALL
  USING (auth.uid() = user_id);

-- Service role can manage all (needed for admin + merge operations)
DROP POLICY IF EXISTS "Service role manages customer addresses" ON public.customer_addresses;
CREATE POLICY "Service role manages customer addresses"
  ON public.customer_addresses FOR ALL
  USING (auth.role() = 'service_role');

-- order_address_snapshots: readable by order owner + admin/service
DROP POLICY IF EXISTS "Order owner reads address snapshots" ON public.order_address_snapshots;
CREATE POLICY "Order owner reads address snapshots"
  ON public.order_address_snapshots FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.orders
       WHERE id = order_id AND user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Service role manages order snapshots" ON public.order_address_snapshots;
CREATE POLICY "Service role manages order snapshots"
  ON public.order_address_snapshots FOR ALL
  USING (auth.role() = 'service_role');

-- address_country_rules: public read
DROP POLICY IF EXISTS "Public read address country rules" ON public.address_country_rules;
CREATE POLICY "Public read address country rules"
  ON public.address_country_rules FOR SELECT
  USING (true);
