-- ============================================================
-- MIGRATION 00007 — GLOBALIZATION FOUNDATION
-- Country-first multi-region, multi-language architecture.
-- ============================================================

-- ── Languages ────────────────────────────────────────────────────────────────
create table if not exists public.languages (
  id           text primary key,           -- 'en', 'de', 'fr', 'hi', 'ar' …
  name         text not null,              -- 'English'
  native_name  text not null,              -- 'Deutsch'
  direction    text not null default 'ltr'
               check (direction in ('ltr', 'rtl')),
  is_active    boolean not null default true,
  created_at   timestamptz not null default now()
);

-- ── Countries ────────────────────────────────────────────────────────────────
create table if not exists public.countries (
  id                    text primary key,   -- 'us', 'uk', 'de', 'in', 'ae' …
  name                  text not null,      -- 'Germany'
  native_name           text not null,      -- 'Deutschland'
  iso_alpha2            char(2) not null unique,  -- 'DE'
  iso_alpha3            char(3) not null unique,  -- 'DEU'
  default_language_id   text not null references public.languages(id),
  fallback_language_id  text not null references public.languages(id),
  currency_code         char(3) not null,   -- 'EUR'
  timezone              text not null,      -- 'Europe/Berlin'
  is_active             boolean not null default true,
  sort_order            integer not null default 0,
  created_at            timestamptz not null default now()
);

-- ── Locales (country × language pairings) ────────────────────────────────────
-- Each row represents one supported locale: e.g. 'de-DE', 'en-DE', 'hi-IN'.
-- The locale ID mirrors BCP-47: {lang}-{ISO_COUNTRY}.
create table if not exists public.locales (
  id            text primary key,           -- 'de-DE', 'en-DE', 'hi-IN', 'ar-AE'
  country_id    text not null references public.countries(id) on delete cascade,
  language_id   text not null references public.languages(id) on delete cascade,
  is_default    boolean not null default false,  -- primary locale for this country?
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  unique (country_id, language_id)
);

-- ── Region configurations (business rules per country) ───────────────────────
create table if not exists public.region_configs (
  id                       uuid primary key default gen_random_uuid(),
  country_id               text not null references public.countries(id) on delete cascade unique,
  currency_code            char(3) not null,
  tax_rate                 numeric(6,4) not null default 0,
  tax_inclusive            boolean not null default false,
  tax_label                text not null default 'Tax',
  free_shipping_threshold  numeric(12,2),
  default_shipping_cost    numeric(12,2),
  date_format              text not null default 'MM/DD/YYYY',
  number_format            text not null default 'en-US',
  -- Schema-ready for future features (not yet enforced):
  -- payment_method_ids    text[] default '{}',
  -- compliance_rules      jsonb  default '{}',
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

-- ── Localized CMS pages ───────────────────────────────────────────────────────
-- Each CMS page can have one version per locale.
-- slug + locale_id is the unique content entity.
create table if not exists public.localized_cms_pages (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null,
  locale_id    text not null references public.locales(id) on delete cascade,
  country_id   text not null references public.countries(id) on delete cascade,
  language_id  text not null references public.languages(id) on delete cascade,
  title        text not null,
  content      text,
  seo_title    text,
  seo_desc     text,
  is_active    boolean not null default true,
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (slug, locale_id)
);

-- ── Localized homepage sections ───────────────────────────────────────────────
-- Locale-scoped version of homepage_sections.
-- Each country/language combination manages its own hero, banners, etc.
create table if not exists public.localized_homepage_sections (
  id           uuid primary key default gen_random_uuid(),
  locale_id    text not null references public.locales(id) on delete cascade,
  country_id   text not null references public.countries(id) on delete cascade,
  language_id  text not null references public.languages(id) on delete cascade,
  type         public.section_type not null,
  title        text,
  subtitle     text,
  content      jsonb,
  sort_order   integer not null default 0,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ── Localized SEO entries ─────────────────────────────────────────────────────
-- Stores per-locale SEO overrides for products, categories, pages, homepage.
create table if not exists public.localized_seo (
  id               uuid primary key default gen_random_uuid(),
  locale_id        text not null references public.locales(id) on delete cascade,
  entity_type      text not null check (entity_type in ('product', 'category', 'page', 'homepage')),
  entity_id        text not null,   -- UUID or slug of the entity
  title            text,
  description      text,
  og_title         text,
  og_description   text,
  og_image_url     text,
  canonical_path   text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (locale_id, entity_type, entity_id)
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
create index if not exists idx_locales_country_id   on public.locales(country_id);
create index if not exists idx_locales_language_id  on public.locales(language_id);
create index if not exists idx_localized_cms_pages_slug       on public.localized_cms_pages(slug);
create index if not exists idx_localized_cms_pages_locale_id  on public.localized_cms_pages(locale_id);
create index if not exists idx_localized_cms_pages_country_id on public.localized_cms_pages(country_id);
create index if not exists idx_localized_hp_sections_locale   on public.localized_homepage_sections(locale_id);
create index if not exists idx_localized_seo_entity           on public.localized_seo(locale_id, entity_type, entity_id);

-- ── Row-Level Security ────────────────────────────────────────────────────────
alter table public.languages                  enable row level security;
alter table public.countries                  enable row level security;
alter table public.locales                    enable row level security;
alter table public.region_configs             enable row level security;
alter table public.localized_cms_pages        enable row level security;
alter table public.localized_homepage_sections enable row level security;
alter table public.localized_seo              enable row level security;

-- Reference tables: public read
create policy "Public read languages"       on public.languages        for select using (true);
create policy "Public read active countries" on public.countries        for select using (is_active = true);
create policy "Public read active locales"  on public.locales           for select using (is_active = true);
create policy "Public read region_configs"  on public.region_configs    for select using (true);

-- CMS content: public read (active), admin write
create policy "Public read active localized_cms_pages"
  on public.localized_cms_pages for select using (is_active = true);
create policy "Admins manage localized_cms_pages"
  on public.localized_cms_pages for all using (public.is_admin());

create policy "Public read active localized_homepage_sections"
  on public.localized_homepage_sections for select using (is_active = true);
create policy "Admins manage localized_homepage_sections"
  on public.localized_homepage_sections for all using (public.is_admin());

create policy "Public read localized_seo"
  on public.localized_seo for select using (true);
create policy "Admins manage localized_seo"
  on public.localized_seo for all using (public.is_admin());

-- ── Seed: languages ───────────────────────────────────────────────────────────
insert into public.languages (id, name, native_name, direction) values
  ('en', 'English',  'English',    'ltr'),
  ('de', 'German',   'Deutsch',    'ltr'),
  ('fr', 'French',   'Français',   'ltr'),
  ('it', 'Italian',  'Italiano',   'ltr'),
  ('es', 'Spanish',  'Español',    'ltr'),
  ('hi', 'Hindi',    'हिन्दी',      'ltr'),
  ('ar', 'Arabic',   'العربية',    'rtl')
on conflict (id) do nothing;

-- ── Seed: countries ───────────────────────────────────────────────────────────
insert into public.countries
  (id, name, native_name, iso_alpha2, iso_alpha3, default_language_id, fallback_language_id, currency_code, timezone, sort_order)
values
  ('us', 'United States',          'United States',   'US', 'USA', 'en', 'en', 'USD', 'America/New_York',  1),
  ('uk', 'United Kingdom',         'United Kingdom',  'GB', 'GBR', 'en', 'en', 'GBP', 'Europe/London',     2),
  ('de', 'Germany',                'Deutschland',     'DE', 'DEU', 'de', 'en', 'EUR', 'Europe/Berlin',     3),
  ('fr', 'France',                 'France',          'FR', 'FRA', 'fr', 'en', 'EUR', 'Europe/Paris',      4),
  ('it', 'Italy',                  'Italia',          'IT', 'ITA', 'it', 'en', 'EUR', 'Europe/Rome',       5),
  ('es', 'Spain',                  'España',          'ES', 'ESP', 'es', 'en', 'EUR', 'Europe/Madrid',     6),
  ('in', 'India',                  'भारत',             'IN', 'IND', 'hi', 'en', 'INR', 'Asia/Kolkata',      7),
  ('ae', 'United Arab Emirates',   'الإمارات',         'AE', 'ARE', 'ar', 'en', 'AED', 'Asia/Dubai',        8)
on conflict (id) do nothing;

-- ── Seed: locales ─────────────────────────────────────────────────────────────
insert into public.locales (id, country_id, language_id, is_default) values
  ('en-US', 'us', 'en', true),
  ('en-GB', 'uk', 'en', true),
  ('de-DE', 'de', 'de', true),
  ('en-DE', 'de', 'en', false),
  ('fr-FR', 'fr', 'fr', true),
  ('en-FR', 'fr', 'en', false),
  ('it-IT', 'it', 'it', true),
  ('en-IT', 'it', 'en', false),
  ('es-ES', 'es', 'es', true),
  ('en-ES', 'es', 'en', false),
  ('hi-IN', 'in', 'hi', true),
  ('en-IN', 'in', 'en', false),
  ('ar-AE', 'ae', 'ar', true),
  ('en-AE', 'ae', 'en', false)
on conflict (id) do nothing;

-- ── Seed: region configs ──────────────────────────────────────────────────────
insert into public.region_configs
  (country_id, currency_code, tax_rate, tax_inclusive, tax_label, free_shipping_threshold, default_shipping_cost, date_format, number_format)
values
  ('us', 'USD', 0.0875, false, 'Sales Tax', 75.00,   9.99,  'MM/DD/YYYY', 'en-US'),
  ('uk', 'GBP', 0.20,   true,  'VAT',       50.00,   4.99,  'DD/MM/YYYY', 'en-GB'),
  ('de', 'EUR', 0.19,   true,  'MwSt.',     50.00,   4.99,  'DD.MM.YYYY', 'de-DE'),
  ('fr', 'EUR', 0.20,   true,  'TVA',       50.00,   4.99,  'DD/MM/YYYY', 'fr-FR'),
  ('it', 'EUR', 0.22,   true,  'IVA',       50.00,   5.99,  'DD/MM/YYYY', 'it-IT'),
  ('es', 'EUR', 0.21,   true,  'IVA',       50.00,   4.99,  'DD/MM/YYYY', 'es-ES'),
  ('in', 'INR', 0.18,   false, 'GST',       999.00,  99.00, 'DD/MM/YYYY', 'en-IN'),
  ('ae', 'AED', 0.05,   false, 'VAT',       200.00,  20.00, 'DD/MM/YYYY', 'ar-AE')
on conflict (country_id) do nothing;
