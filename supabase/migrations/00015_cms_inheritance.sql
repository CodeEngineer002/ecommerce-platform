-- ─────────────────────────────────────────────────────────────────────────────
-- 00015_cms_inheritance.sql
-- AEM-like country-first CMS inheritance model.
--
-- localized_cms_pages + localized_homepage_sections already have country_id.
-- cms_blocks / cms_navigation_menus / cms_banners only have locale_id — we add
-- country_id to them here before adding scope/inheritance columns.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. localized_cms_pages ───────────────────────────────────────────────────

ALTER TABLE public.localized_cms_pages
  ADD COLUMN IF NOT EXISTS scope_type          text    NOT NULL DEFAULT 'locale'
    CHECK (scope_type IN ('country', 'locale')),
  ADD COLUMN IF NOT EXISTS inherits_from_id    uuid
    REFERENCES public.localized_cms_pages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS inheritance_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS override_status     text    NOT NULL DEFAULT 'inherited'
    CHECK (override_status IN ('inherited', 'overridden', 'detached'));

ALTER TABLE public.localized_cms_pages
  ALTER COLUMN locale_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cms_pages_scope
  ON public.localized_cms_pages(scope_type, country_id);
CREATE INDEX IF NOT EXISTS idx_cms_pages_inherit
  ON public.localized_cms_pages(inherits_from_id) WHERE inherits_from_id IS NOT NULL;

-- ── 2. localized_homepage_sections ───────────────────────────────────────────

ALTER TABLE public.localized_homepage_sections
  ADD COLUMN IF NOT EXISTS scope_type          text    NOT NULL DEFAULT 'locale'
    CHECK (scope_type IN ('country', 'locale')),
  ADD COLUMN IF NOT EXISTS inherits_from_id    uuid
    REFERENCES public.localized_homepage_sections(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS inheritance_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS override_status     text    NOT NULL DEFAULT 'inherited'
    CHECK (override_status IN ('inherited', 'overridden', 'detached'));

ALTER TABLE public.localized_homepage_sections
  ALTER COLUMN locale_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_homepage_scope
  ON public.localized_homepage_sections(scope_type, country_id);
CREATE INDEX IF NOT EXISTS idx_homepage_inherit
  ON public.localized_homepage_sections(inherits_from_id) WHERE inherits_from_id IS NOT NULL;

-- ── 3. cms_blocks — add country_id first, then scope/inheritance ──────────────

ALTER TABLE public.cms_blocks
  ADD COLUMN IF NOT EXISTS country_id          text
    REFERENCES public.countries(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS scope_type          text    NOT NULL DEFAULT 'locale'
    CHECK (scope_type IN ('country', 'locale')),
  ADD COLUMN IF NOT EXISTS inherits_from_id    uuid
    REFERENCES public.cms_blocks(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS inheritance_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS override_status     text    NOT NULL DEFAULT 'inherited'
    CHECK (override_status IN ('inherited', 'overridden', 'detached'));

ALTER TABLE public.cms_blocks
  ALTER COLUMN locale_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cms_blocks_scope
  ON public.cms_blocks(scope_type) WHERE scope_type = 'country';
CREATE INDEX IF NOT EXISTS idx_cms_blocks_country_id
  ON public.cms_blocks(country_id) WHERE country_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cms_blocks_inherit
  ON public.cms_blocks(inherits_from_id) WHERE inherits_from_id IS NOT NULL;

-- ── 4. cms_navigation_menus — add country_id first ───────────────────────────

ALTER TABLE public.cms_navigation_menus
  ADD COLUMN IF NOT EXISTS country_id          text
    REFERENCES public.countries(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS scope_type          text    NOT NULL DEFAULT 'locale'
    CHECK (scope_type IN ('country', 'locale')),
  ADD COLUMN IF NOT EXISTS inherits_from_id    uuid
    REFERENCES public.cms_navigation_menus(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS inheritance_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS override_status     text    NOT NULL DEFAULT 'inherited'
    CHECK (override_status IN ('inherited', 'overridden', 'detached'));

ALTER TABLE public.cms_navigation_menus
  ALTER COLUMN locale_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cms_nav_scope
  ON public.cms_navigation_menus(scope_type) WHERE scope_type = 'country';
CREATE INDEX IF NOT EXISTS idx_cms_nav_country_id
  ON public.cms_navigation_menus(country_id) WHERE country_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cms_nav_inherit
  ON public.cms_navigation_menus(inherits_from_id) WHERE inherits_from_id IS NOT NULL;

-- ── 5. cms_banners — add country_id first ────────────────────────────────────

ALTER TABLE public.cms_banners
  ADD COLUMN IF NOT EXISTS country_id          text
    REFERENCES public.countries(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS scope_type          text    NOT NULL DEFAULT 'locale'
    CHECK (scope_type IN ('country', 'locale')),
  ADD COLUMN IF NOT EXISTS inherits_from_id    uuid
    REFERENCES public.cms_banners(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS inheritance_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS override_status     text    NOT NULL DEFAULT 'inherited'
    CHECK (override_status IN ('inherited', 'overridden', 'detached'));

ALTER TABLE public.cms_banners
  ALTER COLUMN locale_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cms_banners_scope
  ON public.cms_banners(scope_type) WHERE scope_type = 'country';
CREATE INDEX IF NOT EXISTS idx_cms_banners_country_id
  ON public.cms_banners(country_id) WHERE country_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cms_banners_inherit
  ON public.cms_banners(inherits_from_id) WHERE inherits_from_id IS NOT NULL;

-- ── 6. CMS Inheritance Audit Log ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.cms_inheritance_audit (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id     uuid        NOT NULL REFERENCES auth.users(id),
  action       text        NOT NULL CHECK (action IN (
    'break_inheritance', 'restore_inheritance',
    'country_content_published', 'locale_content_published',
    'country_content_created', 'locale_override_created',
    'country_content_updated', 'locale_override_updated'
  )),
  country      text        NOT NULL,
  locale_id    text,
  module       text        NOT NULL CHECK (module IN (
    'pages', 'homepage', 'blocks', 'navigation', 'banners'
  )),
  entity_id    uuid        NOT NULL,
  meta         jsonb       NOT NULL DEFAULT '{}',
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cms_audit_country   ON public.cms_inheritance_audit(country);
CREATE INDEX IF NOT EXISTS idx_cms_audit_actor     ON public.cms_inheritance_audit(actor_id);
CREATE INDEX IF NOT EXISTS idx_cms_audit_entity    ON public.cms_inheritance_audit(entity_id);
CREATE INDEX IF NOT EXISTS idx_cms_audit_created   ON public.cms_inheritance_audit(created_at DESC);

ALTER TABLE public.cms_inheritance_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read cms audit" ON public.cms_inheritance_audit;
CREATE POLICY "Admins read cms audit"
  ON public.cms_inheritance_audit FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin')
    )
  );

DROP POLICY IF EXISTS "Admins insert cms audit" ON public.cms_inheritance_audit;
CREATE POLICY "Admins insert cms audit"
  ON public.cms_inheritance_audit FOR INSERT
  WITH CHECK (actor_id = auth.uid());

-- ── 7. New CMS permissions ────────────────────────────────────────────────────

INSERT INTO public.permissions (code, resource, action, description) VALUES
  ('cms:manage_country_content',  'cms', 'write',   'Create and edit country-level CMS source content'),
  ('cms:manage_locale_content',   'cms', 'write',   'Create and edit locale-level CMS override content'),
  ('cms:break_inheritance',       'cms', 'manage',  'Break locale inheritance from country-level source content'),
  ('cms:restore_inheritance',     'cms', 'manage',  'Restore locale inheritance back to country-level source content'),
  ('cms:publish_country_content', 'cms', 'publish', 'Publish country-level CMS content (propagates to all inherited locales)'),
  ('cms:publish_locale_content',  'cms', 'publish', 'Publish locale-level CMS content override only')
ON CONFLICT (code) DO NOTHING;
