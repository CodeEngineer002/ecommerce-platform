-- ============================================================
-- MIGRATION 00010 — CMS, MEDIA & SHIPPING
-- Media library, CMS versioning/blocks/navigation/banners,
-- shipping methods, zones, and seed data.
-- ============================================================

-- ── Media Folders ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.media_folders (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  parent_id   uuid REFERENCES public.media_folders(id) ON DELETE SET NULL,
  path        text NOT NULL,           -- '/product-images/electronics/'
  created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_media_folders_parent_id   ON public.media_folders(parent_id);
CREATE INDEX IF NOT EXISTS idx_media_folders_created_by  ON public.media_folders(created_by);

ALTER TABLE public.media_folders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated read media folders" ON public.media_folders;
CREATE POLICY "Authenticated read media folders"
  ON public.media_folders FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Admins manage media folders" ON public.media_folders;
CREATE POLICY "Admins manage media folders"
  ON public.media_folders FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ── Media Assets ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.media_assets (
  id              uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id       uuid    REFERENCES public.media_folders(id) ON DELETE SET NULL,
  filename        text    NOT NULL,
  original_name   text    NOT NULL,
  mime_type       text    NOT NULL,
  file_size       bigint  NOT NULL CHECK (file_size > 0),
  url             text    NOT NULL,
  thumbnail_url   text,
  width           int,
  height          int,
  alt_text        text,
  tags            text[]  DEFAULT '{}',
  metadata        jsonb   DEFAULT '{}',
  uploaded_by     uuid    REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_media_assets_folder_id     ON public.media_assets(folder_id);
CREATE INDEX IF NOT EXISTS idx_media_assets_uploaded_by   ON public.media_assets(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_media_assets_mime_type     ON public.media_assets(mime_type);
CREATE INDEX IF NOT EXISTS idx_media_assets_tags          ON public.media_assets USING GIN (tags);

ALTER TABLE public.media_assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated read media assets" ON public.media_assets;
CREATE POLICY "Authenticated read media assets"
  ON public.media_assets FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Admins manage media assets" ON public.media_assets;
CREATE POLICY "Admins manage media assets"
  ON public.media_assets FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ── CMS Page Versions ─────────────────────────────────────────────────────────
-- Version history for localized_cms_pages.
CREATE TABLE IF NOT EXISTS public.cms_page_versions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cms_page_id     uuid NOT NULL REFERENCES public.localized_cms_pages(id) ON DELETE CASCADE,
  version_number  int  NOT NULL,
  title           text NOT NULL,
  content         text,
  seo_title       text,
  seo_desc        text,
  status          text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'archived', 'scheduled')),
  published_at    timestamptz,
  scheduled_for   timestamptz,
  published_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cms_page_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_cms_page_versions_page_status
  ON public.cms_page_versions(cms_page_id, status);
CREATE INDEX IF NOT EXISTS idx_cms_page_versions_page_version
  ON public.cms_page_versions(cms_page_id, version_number);

ALTER TABLE public.cms_page_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage cms page versions" ON public.cms_page_versions;
CREATE POLICY "Admins manage cms page versions"
  ON public.cms_page_versions FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ── CMS Blocks ───────────────────────────────────────────────────────────────
-- Reusable locale-scoped content blocks embeddable in pages.
CREATE TABLE IF NOT EXISTS public.cms_blocks (
  id            uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  locale_id     text    NOT NULL REFERENCES public.locales(id) ON DELETE CASCADE,
  handle        text    NOT NULL,       -- 'hero-about-de', 'footer-cta-in'
  type          text    NOT NULL
    CHECK (type IN ('html', 'markdown', 'json_rich_text', 'image', 'banner', 'custom')),
  title         text,
  content       text,
  content_json  jsonb,
  is_active     boolean NOT NULL DEFAULT true,
  created_by    uuid    REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (locale_id, handle)
);

CREATE INDEX IF NOT EXISTS idx_cms_blocks_locale_handle
  ON public.cms_blocks(locale_id, handle);
CREATE INDEX IF NOT EXISTS idx_cms_blocks_is_active
  ON public.cms_blocks(is_active);

CREATE TRIGGER trg_cms_blocks_updated_at
  BEFORE UPDATE ON public.cms_blocks
  FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();

ALTER TABLE public.cms_blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read active cms blocks" ON public.cms_blocks;
CREATE POLICY "Public read active cms blocks"
  ON public.cms_blocks FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS "Admins manage cms blocks" ON public.cms_blocks;
CREATE POLICY "Admins manage cms blocks"
  ON public.cms_blocks FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ── CMS Block Versions ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cms_block_versions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  block_id        uuid NOT NULL REFERENCES public.cms_blocks(id) ON DELETE CASCADE,
  version_number  int  NOT NULL,
  content         text,
  content_json    jsonb,
  status          text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'archived')),
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (block_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_cms_block_versions_block_id
  ON public.cms_block_versions(block_id);
CREATE INDEX IF NOT EXISTS idx_cms_block_versions_status
  ON public.cms_block_versions(block_id, status);

ALTER TABLE public.cms_block_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read published block versions" ON public.cms_block_versions;
CREATE POLICY "Public read published block versions"
  ON public.cms_block_versions FOR SELECT USING (status = 'published');

DROP POLICY IF EXISTS "Admins manage block versions" ON public.cms_block_versions;
CREATE POLICY "Admins manage block versions"
  ON public.cms_block_versions FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ── CMS Navigation Menus ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cms_navigation_menus (
  id          uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  locale_id   text    NOT NULL REFERENCES public.locales(id) ON DELETE CASCADE,
  name        text    NOT NULL,
  handle      text    NOT NULL,    -- 'main-nav', 'footer-links', 'mobile-nav'
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (locale_id, handle)
);

CREATE INDEX IF NOT EXISTS idx_cms_navigation_menus_locale_handle
  ON public.cms_navigation_menus(locale_id, handle);

CREATE TRIGGER trg_cms_navigation_menus_updated_at
  BEFORE UPDATE ON public.cms_navigation_menus
  FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();

ALTER TABLE public.cms_navigation_menus ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read active navigation menus" ON public.cms_navigation_menus;
CREATE POLICY "Public read active navigation menus"
  ON public.cms_navigation_menus FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS "Admins manage navigation menus" ON public.cms_navigation_menus;
CREATE POLICY "Admins manage navigation menus"
  ON public.cms_navigation_menus FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ── CMS Navigation Items ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cms_navigation_items (
  id             uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_id        uuid    NOT NULL REFERENCES public.cms_navigation_menus(id) ON DELETE CASCADE,
  parent_id      uuid    REFERENCES public.cms_navigation_items(id) ON DELETE SET NULL,
  label          text    NOT NULL,
  url            text,
  page_id        uuid    REFERENCES public.localized_cms_pages(id) ON DELETE SET NULL,
  collection_id  uuid    REFERENCES public.collections(id) ON DELETE SET NULL,
  target         text    DEFAULT '_self' CHECK (target IN ('_self', '_blank')),
  icon           text,
  sort_order     int     NOT NULL DEFAULT 0,
  is_active      boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cms_nav_items_menu_sort
  ON public.cms_navigation_items(menu_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_cms_nav_items_parent_id
  ON public.cms_navigation_items(parent_id);

ALTER TABLE public.cms_navigation_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read active navigation items" ON public.cms_navigation_items;
CREATE POLICY "Public read active navigation items"
  ON public.cms_navigation_items FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS "Admins manage navigation items" ON public.cms_navigation_items;
CREATE POLICY "Admins manage navigation items"
  ON public.cms_navigation_items FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ── CMS Banners ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cms_banners (
  id                  uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  locale_id           text    NOT NULL REFERENCES public.locales(id) ON DELETE CASCADE,
  handle              text    NOT NULL,   -- 'homepage-hero', 'category-fashion'
  title               text,
  subtitle            text,
  image_url           text,
  cta_text            text,
  cta_url             text,
  cta_open_new_tab    boolean NOT NULL DEFAULT false,
  background_color    text,
  text_color          text,
  is_active           boolean NOT NULL DEFAULT true,
  valid_from          timestamptz,
  valid_until         timestamptz,
  sort_order          int     NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cms_banners_locale_active
  ON public.cms_banners(locale_id, is_active);
CREATE INDEX IF NOT EXISTS idx_cms_banners_validity
  ON public.cms_banners(valid_from, valid_until);

CREATE TRIGGER trg_cms_banners_updated_at
  BEFORE UPDATE ON public.cms_banners
  FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();

ALTER TABLE public.cms_banners ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read active banners" ON public.cms_banners;
CREATE POLICY "Public read active banners"
  ON public.cms_banners FOR SELECT
  USING (
    is_active = true
    AND (valid_from  IS NULL OR valid_from  <= now())
    AND (valid_until IS NULL OR valid_until >= now())
  );

DROP POLICY IF EXISTS "Admins manage cms banners" ON public.cms_banners;
CREATE POLICY "Admins manage cms banners"
  ON public.cms_banners FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ── Shipping Methods ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.shipping_methods (
  id                    uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  code                  text    NOT NULL UNIQUE,   -- 'STANDARD','EXPRESS','FREE','COD'
  name                  text    NOT NULL,
  description           text,
  type                  text    NOT NULL DEFAULT 'standard'
    CHECK (type IN ('standard', 'express', 'overnight', 'same_day', 'pickup', 'free', 'digital')),
  carrier               text,                      -- 'FedEx','DHL','India Post'
  estimated_days_min    int,
  estimated_days_max    int,
  is_taxable            boolean NOT NULL DEFAULT false,
  is_active             boolean NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shipping_methods_is_active ON public.shipping_methods(is_active);

CREATE TRIGGER trg_shipping_methods_updated_at
  BEFORE UPDATE ON public.shipping_methods
  FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();

ALTER TABLE public.shipping_methods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read active shipping methods" ON public.shipping_methods;
CREATE POLICY "Public read active shipping methods"
  ON public.shipping_methods FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS "Admins manage shipping methods" ON public.shipping_methods;
CREATE POLICY "Admins manage shipping methods"
  ON public.shipping_methods FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ── Shipping Zones ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.shipping_zones (
  id           uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text    NOT NULL,      -- 'India Domestic', 'Europe', 'Middle East'
  country_ids  text[]  NOT NULL DEFAULT '{}',  -- array of country codes
  is_active    boolean NOT NULL DEFAULT true,
  sort_order   int     NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shipping_zones_is_active   ON public.shipping_zones(is_active);
CREATE INDEX IF NOT EXISTS idx_shipping_zones_country_ids ON public.shipping_zones USING GIN (country_ids);

ALTER TABLE public.shipping_zones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read active shipping zones" ON public.shipping_zones;
CREATE POLICY "Public read active shipping zones"
  ON public.shipping_zones FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS "Admins manage shipping zones" ON public.shipping_zones;
CREATE POLICY "Admins manage shipping zones"
  ON public.shipping_zones FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ── Shipping Zone Methods (pricing per method per zone) ──────────────────────
CREATE TABLE IF NOT EXISTS public.shipping_zone_methods (
  id                  uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id             uuid           NOT NULL REFERENCES public.shipping_zones(id) ON DELETE CASCADE,
  method_id           uuid           NOT NULL REFERENCES public.shipping_methods(id) ON DELETE CASCADE,
  price               numeric(12,2)  NOT NULL DEFAULT 0,
  free_above_amount   numeric(12,2),          -- null = never free based on order amount
  min_order_amount    numeric(12,2),
  max_order_amount    numeric(12,2),
  min_weight_kg       numeric(8,3),
  max_weight_kg       numeric(8,3),
  currency_code       char(3)        REFERENCES public.currencies(id),
  is_active           boolean        NOT NULL DEFAULT true,
  UNIQUE (zone_id, method_id)
);

CREATE INDEX IF NOT EXISTS idx_shipping_zone_methods_zone_id   ON public.shipping_zone_methods(zone_id);
CREATE INDEX IF NOT EXISTS idx_shipping_zone_methods_method_id ON public.shipping_zone_methods(method_id);

ALTER TABLE public.shipping_zone_methods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read active shipping zone methods" ON public.shipping_zone_methods;
CREATE POLICY "Public read active shipping zone methods"
  ON public.shipping_zone_methods FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS "Admins manage shipping zone methods" ON public.shipping_zone_methods;
CREATE POLICY "Admins manage shipping zone methods"
  ON public.shipping_zone_methods FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ── Seed: Shipping Methods ────────────────────────────────────────────────────
INSERT INTO public.shipping_methods
  (code, name, description, type, estimated_days_min, estimated_days_max, is_active) VALUES
  ('STANDARD', 'Standard Shipping',  'Delivered in 3–7 business days',  'standard',  3,  7,  true),
  ('EXPRESS',  'Express Shipping',   'Delivered in 1–2 business days',  'express',   1,  2,  true),
  ('FREE',     'Free Shipping',      'Delivered in 5–10 business days', 'free',      5,  10, true),
  ('COD',      'Cash on Delivery',   'Pay at doorstep, 3–7 business days', 'standard', 3, 7, true)
ON CONFLICT (code) DO NOTHING;

-- ── Seed: Shipping Zones ──────────────────────────────────────────────────────
INSERT INTO public.shipping_zones (name, country_ids, is_active, sort_order) VALUES
  ('India Domestic', '{"in"}',                                  true, 1),
  ('International',  '{"us","uk","de","fr","it","es","ae"}',    true, 2)
ON CONFLICT DO NOTHING;

-- ── Seed: Shipping Zone Methods ───────────────────────────────────────────────
-- Bind the default methods to each zone with sensible pricing defaults.
-- Uses CTEs to look up the seeded IDs by code so the seed is idempotent.
WITH
  z_in  AS (SELECT id FROM public.shipping_zones WHERE name = 'India Domestic'),
  z_int AS (SELECT id FROM public.shipping_zones WHERE name = 'International'),
  m_std AS (SELECT id FROM public.shipping_methods WHERE code = 'STANDARD'),
  m_exp AS (SELECT id FROM public.shipping_methods WHERE code = 'EXPRESS'),
  m_fre AS (SELECT id FROM public.shipping_methods WHERE code = 'FREE'),
  m_cod AS (SELECT id FROM public.shipping_methods WHERE code = 'COD')
INSERT INTO public.shipping_zone_methods
  (zone_id, method_id, price, free_above_amount, currency_code, is_active)
SELECT zone_id, method_id, price, free_above, currency, true
FROM (VALUES
  ((SELECT id FROM z_in),  (SELECT id FROM m_std), 99.00,   999.00,  'INR'),
  ((SELECT id FROM z_in),  (SELECT id FROM m_exp), 199.00,  NULL,    'INR'),
  ((SELECT id FROM z_in),  (SELECT id FROM m_fre), 0.00,    NULL,    'INR'),
  ((SELECT id FROM z_in),  (SELECT id FROM m_cod), 49.00,   NULL,    'INR'),
  ((SELECT id FROM z_int), (SELECT id FROM m_std), 14.99,   75.00,   'USD'),
  ((SELECT id FROM z_int), (SELECT id FROM m_exp), 29.99,   NULL,    'USD'),
  ((SELECT id FROM z_int), (SELECT id FROM m_fre), 0.00,    NULL,    'USD')
) AS t(zone_id, method_id, price, free_above, currency)
ON CONFLICT (zone_id, method_id) DO NOTHING;

-- ── is_content_manager() helper ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_content_manager()
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT role FROM public.profiles WHERE id = auth.uid())
      IN ('admin', 'super_admin'),
    false
  ) OR public.has_permission('cms:write')
$$;
