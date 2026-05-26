-- ============================================================================
-- Migration 00066: P0-2 — Pincode serviceability for delivery
-- ============================================================================
--
-- PROBLEM:
--   Customer enters a delivery address with a pincode you can't service.
--   Order accepts → ships → comes back as RTO. Wasted shipping + warehouse
--   time + bad customer experience.
--
-- FIX:
--   • Table `serviceable_pincodes` stores deliverable pincodes per country.
--   • Two flags per row: `is_deliverable` (can we ship at all) and
--     `cod_enabled` (can we accept COD there — some pincodes are prepaid-only
--     because of high refusal rate).
--   • RPC `check_pincode_serviceability(p_country, p_pincode)` returns the
--     row OR a not_found sentinel. Used by checkout API + customer cart UI.
--
-- DEFAULT POLICY:
--   - If a pincode isn't in the table → NOT serviceable (strict).
--   - Ops adds rows via admin import (CSV upload, future) or seed.
--   - We seed a few sample IN pincodes so dev/test data works.
--
-- IDEMPOTENCY:
--   CREATE TABLE IF NOT EXISTS + ON CONFLICT DO NOTHING on seeds.
-- ============================================================================

-- ── 1. Table ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.serviceable_pincodes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code    text NOT NULL,         -- ISO alpha-2 uppercased ('IN', 'US')
  pincode         text NOT NULL,
  city            text,
  state           text,
  is_deliverable  boolean NOT NULL DEFAULT true,
  cod_enabled     boolean NOT NULL DEFAULT true,
  /** Expected delivery in business days; null = use carrier default. */
  expected_days   integer,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT serviceable_pincodes_country_pincode_key
    UNIQUE (country_code, pincode)
);

CREATE INDEX IF NOT EXISTS idx_serviceable_pincodes_country
  ON public.serviceable_pincodes (country_code, pincode)
  WHERE is_deliverable = true;

-- updated_at trigger
DROP TRIGGER IF EXISTS trg_serviceable_pincodes_updated_at ON public.serviceable_pincodes;
CREATE TRIGGER trg_serviceable_pincodes_updated_at
  BEFORE UPDATE ON public.serviceable_pincodes
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ── 2. RLS — readable by everyone, mutable by admin only ────────────────────
ALTER TABLE public.serviceable_pincodes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read serviceable pincodes" ON public.serviceable_pincodes;
CREATE POLICY "Public read serviceable pincodes"
  ON public.serviceable_pincodes
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Admins manage serviceable pincodes" ON public.serviceable_pincodes;
CREATE POLICY "Admins manage serviceable pincodes"
  ON public.serviceable_pincodes
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ── 3. RPC — fast serviceability lookup ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.check_pincode_serviceability(
  p_country text,
  p_pincode text
)
RETURNS TABLE (
  found          boolean,
  is_deliverable boolean,
  cod_enabled    boolean,
  expected_days  integer,
  city           text,
  state          text
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH hit AS (
    SELECT * FROM public.serviceable_pincodes
     WHERE country_code = upper(trim(p_country))
       AND pincode      = trim(p_pincode)
     LIMIT 1
  )
  SELECT
    (h.id IS NOT NULL)                AS found,
    COALESCE(h.is_deliverable, false) AS is_deliverable,
    COALESCE(h.cod_enabled,    false) AS cod_enabled,
    h.expected_days                   AS expected_days,
    h.city                            AS city,
    h.state                           AS state
  FROM (SELECT NULL::uuid AS id) base
  LEFT JOIN hit h ON true;
$$;

REVOKE ALL ON FUNCTION public.check_pincode_serviceability(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_pincode_serviceability(text, text)
  TO anon, authenticated, service_role;

-- ── 4. Seed sample IN pincodes (dev/test convenience) ───────────────────────
INSERT INTO public.serviceable_pincodes (country_code, pincode, city, state, expected_days)
VALUES
  ('IN', '400001', 'Mumbai',    'Maharashtra', 3),
  ('IN', '400050', 'Mumbai',    'Maharashtra', 3),
  ('IN', '110001', 'New Delhi', 'Delhi',       3),
  ('IN', '110016', 'New Delhi', 'Delhi',       3),
  ('IN', '560001', 'Bengaluru', 'Karnataka',   3),
  ('IN', '560034', 'Bengaluru', 'Karnataka',   3),
  ('IN', '600001', 'Chennai',   'Tamil Nadu',  4),
  ('IN', '700001', 'Kolkata',   'West Bengal', 4),
  ('IN', '500001', 'Hyderabad', 'Telangana',   3),
  ('IN', '411001', 'Pune',      'Maharashtra', 3)
ON CONFLICT (country_code, pincode) DO NOTHING;
