-- ============================================================
-- MIGRATION 00072 — ENABLE RLS ON TABLES MISSING ROW-LEVEL SECURITY
-- ============================================================
-- Supabase security scan (25 May 2026) flagged three tables as
-- publicly accessible because RLS was never enabled:
--
--   1. public.carriers              (added in 00022)
--   2. public.administrative_regions (added in 00014)
--   3. public.cities                 (added in 00014)
--
-- Risk: Without RLS, any client holding the anon key can SELECT,
-- INSERT, UPDATE, and DELETE rows in these tables via the PostgREST
-- API. Service-role already bypasses RLS so no change is needed there.
--
-- Fix: Enable RLS + add minimal policies that match the access model
-- already in use for other reference/lookup tables in this project:
--   READ  → public (anyone, including unauthenticated visitors)
--   WRITE → admin/super_admin via public.is_admin() (same as
--           shipping_methods, shipping_zones, currencies, etc.)
-- ============================================================

-- ── 1. carriers ───────────────────────────────────────────────────────────────
-- Carriers are public reference data: customers need carrier names/logos when
-- viewing tracking info. Only admins should be able to add/modify carriers.

ALTER TABLE public.carriers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read active carriers"
  ON public.carriers FOR SELECT
  USING (is_active = true);

CREATE POLICY "Admins manage carriers"
  ON public.carriers FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ── 2. administrative_regions ─────────────────────────────────────────────────
-- States / provinces / emirates used in the address form.
-- Read access must be unrestricted so unauthenticated checkout flows work.
-- Writes are seeded at migration time and managed by admins only.

ALTER TABLE public.administrative_regions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read active administrative regions"
  ON public.administrative_regions FOR SELECT
  USING (is_active = true);

CREATE POLICY "Admins manage administrative regions"
  ON public.administrative_regions FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ── 3. cities ─────────────────────────────────────────────────────────────────
-- City lookup used in the address form (trigram search).
-- Same access model as administrative_regions.

ALTER TABLE public.cities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read active cities"
  ON public.cities FOR SELECT
  USING (is_active = true);

CREATE POLICY "Admins manage cities"
  ON public.cities FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
