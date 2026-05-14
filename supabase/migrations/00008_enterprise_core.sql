-- ============================================================
-- MIGRATION 00008 — ENTERPRISE CORE
-- Currencies, warehouses, multi-warehouse inventory, price lists,
-- brands, RBAC, checkout sessions, refunds, admin action logs,
-- structural additions, RLS fixes from 00005/00006, indexes, seeds.
-- ============================================================

-- ── Currencies ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.currencies (
  id             char(3)  PRIMARY KEY,                   -- 'USD','EUR','INR'
  name           text     NOT NULL,
  symbol         text     NOT NULL,
  decimal_places int      NOT NULL DEFAULT 2,
  is_active      boolean  NOT NULL DEFAULT true
);

ALTER TABLE public.currencies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read currencies" ON public.currencies;
CREATE POLICY "Public read currencies"
  ON public.currencies FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins manage currencies" ON public.currencies;
CREATE POLICY "Admins manage currencies"
  ON public.currencies FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

INSERT INTO public.currencies (id, name, symbol, decimal_places) VALUES
  ('USD', 'US Dollar',          '$',      2),
  ('EUR', 'Euro',               '€',      2),
  ('GBP', 'British Pound',      '£',      2),
  ('INR', 'Indian Rupee',       '₹',      2),
  ('AED', 'UAE Dirham',         'د.إ',    2)
ON CONFLICT (id) DO NOTHING;

-- ── Warehouses ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.warehouses (
  id              uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  code            text    NOT NULL UNIQUE,               -- 'WH-IN-01'
  name            text    NOT NULL,
  country_id      text    REFERENCES public.countries(id) ON DELETE SET NULL,
  address         jsonb,
  contact_email   text,
  contact_phone   text,
  is_default      boolean NOT NULL DEFAULT false,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_warehouses_country_id  ON public.warehouses(country_id);
CREATE INDEX IF NOT EXISTS idx_warehouses_is_default  ON public.warehouses(is_default) WHERE is_default = true;
CREATE INDEX IF NOT EXISTS idx_warehouses_is_active   ON public.warehouses(is_active);

CREATE TRIGGER trg_warehouses_updated_at
  BEFORE UPDATE ON public.warehouses
  FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();

ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read active warehouses" ON public.warehouses;
CREATE POLICY "Public read active warehouses"
  ON public.warehouses FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS "Admins manage warehouses" ON public.warehouses;
CREATE POLICY "Admins manage warehouses"
  ON public.warehouses FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

INSERT INTO public.warehouses (code, name, country_id, is_default, is_active, address) VALUES
  ('WH-DEFAULT', 'Default Warehouse', 'in', true, true,
   '{"city": "Mumbai", "state": "Maharashtra", "country": "India", "postal_code": "400001"}'::jsonb)
ON CONFLICT (code) DO NOTHING;

-- ── Inventory Levels (multi-warehouse) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.inventory_levels (
  id              uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id    uuid    NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  variant_id      uuid    NOT NULL REFERENCES public.product_variants(id) ON DELETE CASCADE,
  quantity        int     NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  reserved        int     NOT NULL DEFAULT 0 CHECK (reserved >= 0),
  reorder_point   int     NOT NULL DEFAULT 0,
  max_quantity    int,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (warehouse_id, variant_id)
);

CREATE INDEX IF NOT EXISTS idx_inventory_levels_variant_id    ON public.inventory_levels(variant_id);
CREATE INDEX IF NOT EXISTS idx_inventory_levels_warehouse_id  ON public.inventory_levels(warehouse_id);

CREATE TRIGGER trg_inventory_levels_updated_at
  BEFORE UPDATE ON public.inventory_levels
  FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();

ALTER TABLE public.inventory_levels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read inventory levels" ON public.inventory_levels;
CREATE POLICY "Public read inventory levels"
  ON public.inventory_levels FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins manage inventory levels" ON public.inventory_levels;
CREATE POLICY "Admins manage inventory levels"
  ON public.inventory_levels FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ── Price Lists ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.price_lists (
  id              uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  code            text    NOT NULL UNIQUE,               -- 'DEFAULT','SALE','B2B','IN-INR'
  name            text    NOT NULL,
  currency_code   char(3) NOT NULL REFERENCES public.currencies(id),
  country_id      text    REFERENCES public.countries(id) ON DELETE SET NULL,
  type            text    NOT NULL DEFAULT 'retail'
    CHECK (type IN ('retail', 'sale', 'b2b', 'employee', 'wholesale')),
  is_default      boolean NOT NULL DEFAULT false,
  valid_from      timestamptz,
  valid_until     timestamptz,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_price_lists_currency_code     ON public.price_lists(currency_code);
CREATE INDEX IF NOT EXISTS idx_price_lists_country_id        ON public.price_lists(country_id);
CREATE INDEX IF NOT EXISTS idx_price_lists_default_active    ON public.price_lists(is_default, is_active);

CREATE TRIGGER trg_price_lists_updated_at
  BEFORE UPDATE ON public.price_lists
  FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();

ALTER TABLE public.price_lists ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read active price lists" ON public.price_lists;
CREATE POLICY "Public read active price lists"
  ON public.price_lists FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS "Admins manage price lists" ON public.price_lists;
CREATE POLICY "Admins manage price lists"
  ON public.price_lists FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

INSERT INTO public.price_lists (code, name, currency_code, country_id, type, is_default, is_active) VALUES
  ('DEFAULT', 'Default Price List', 'USD', NULL, 'retail', true, true)
ON CONFLICT (code) DO NOTHING;

-- ── Product Prices ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.product_prices (
  id              uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  price_list_id   uuid           NOT NULL REFERENCES public.price_lists(id) ON DELETE CASCADE,
  product_id      uuid           NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  amount          numeric(12,2)  NOT NULL CHECK (amount > 0),
  compare_at      numeric(12,2)  CHECK (compare_at > 0),
  cost_price      numeric(12,2)  CHECK (cost_price > 0),
  valid_from      timestamptz,
  valid_until     timestamptz,
  created_at      timestamptz    NOT NULL DEFAULT now(),
  updated_at      timestamptz    NOT NULL DEFAULT now(),
  UNIQUE (price_list_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_product_prices_product_id    ON public.product_prices(product_id);
CREATE INDEX IF NOT EXISTS idx_product_prices_price_list_id ON public.product_prices(price_list_id);

CREATE TRIGGER trg_product_prices_updated_at
  BEFORE UPDATE ON public.product_prices
  FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();

ALTER TABLE public.product_prices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read product prices" ON public.product_prices;
CREATE POLICY "Public read product prices"
  ON public.product_prices FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins manage product prices" ON public.product_prices;
CREATE POLICY "Admins manage product prices"
  ON public.product_prices FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ── Variant Prices ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.variant_prices (
  id              uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  price_list_id   uuid           NOT NULL REFERENCES public.price_lists(id) ON DELETE CASCADE,
  variant_id      uuid           NOT NULL REFERENCES public.product_variants(id) ON DELETE CASCADE,
  amount          numeric(12,2)  NOT NULL CHECK (amount > 0),
  compare_at      numeric(12,2)  CHECK (compare_at > 0),
  cost_price      numeric(12,2)  CHECK (cost_price > 0),
  valid_from      timestamptz,
  valid_until     timestamptz,
  created_at      timestamptz    NOT NULL DEFAULT now(),
  updated_at      timestamptz    NOT NULL DEFAULT now(),
  UNIQUE (price_list_id, variant_id)
);

CREATE INDEX IF NOT EXISTS idx_variant_prices_variant_id    ON public.variant_prices(variant_id);
CREATE INDEX IF NOT EXISTS idx_variant_prices_price_list_id ON public.variant_prices(price_list_id);

CREATE TRIGGER trg_variant_prices_updated_at
  BEFORE UPDATE ON public.variant_prices
  FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();

ALTER TABLE public.variant_prices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read variant prices" ON public.variant_prices;
CREATE POLICY "Public read variant prices"
  ON public.variant_prices FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins manage variant prices" ON public.variant_prices;
CREATE POLICY "Admins manage variant prices"
  ON public.variant_prices FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ── Brands ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.brands (
  id            uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text    NOT NULL,
  slug          text    NOT NULL UNIQUE,
  logo_url      text,
  website_url   text,
  description   text,
  is_active     boolean NOT NULL DEFAULT true,
  sort_order    int     NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_brands_slug       ON public.brands(slug);
CREATE INDEX IF NOT EXISTS idx_brands_is_active  ON public.brands(is_active);

CREATE TRIGGER trg_brands_updated_at
  BEFORE UPDATE ON public.brands
  FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();

ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read active brands" ON public.brands;
CREATE POLICY "Public read active brands"
  ON public.brands FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS "Admins manage brands" ON public.brands;
CREATE POLICY "Admins manage brands"
  ON public.brands FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ── Brand Localizations ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.brand_localizations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id     uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  locale_id    text NOT NULL REFERENCES public.locales(id) ON DELETE CASCADE,
  name         text NOT NULL,
  description  text,
  seo_title    text,
  seo_desc     text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand_id, locale_id)
);

CREATE INDEX IF NOT EXISTS idx_brand_localizations_brand_id   ON public.brand_localizations(brand_id);
CREATE INDEX IF NOT EXISTS idx_brand_localizations_locale_id  ON public.brand_localizations(locale_id);

CREATE TRIGGER trg_brand_localizations_updated_at
  BEFORE UPDATE ON public.brand_localizations
  FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();

ALTER TABLE public.brand_localizations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read brand localizations" ON public.brand_localizations;
CREATE POLICY "Public read brand localizations"
  ON public.brand_localizations FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins manage brand localizations" ON public.brand_localizations;
CREATE POLICY "Admins manage brand localizations"
  ON public.brand_localizations FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ── RBAC: Roles ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.roles (
  id           uuid  PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text  NOT NULL UNIQUE,
  display_name text  NOT NULL,
  description  text,
  is_system    boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read roles" ON public.roles;
CREATE POLICY "Admins read roles"
  ON public.roles FOR SELECT USING (public.is_admin());

-- ── RBAC: Permissions ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.permissions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text NOT NULL UNIQUE,      -- 'catalog:read','orders:manage'
  resource    text NOT NULL,             -- 'catalog','orders','cms','inventory'
  action      text NOT NULL,             -- 'read','write','delete','manage','approve'
  description text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_permissions_resource ON public.permissions(resource);
CREATE INDEX IF NOT EXISTS idx_permissions_code     ON public.permissions(code);

ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read permissions" ON public.permissions;
CREATE POLICY "Admins read permissions"
  ON public.permissions FOR SELECT USING (public.is_admin());

-- ── RBAC: Role Permissions (junction) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.role_permissions (
  role_id       uuid NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE INDEX IF NOT EXISTS idx_role_permissions_permission_id ON public.role_permissions(permission_id);

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read role permissions" ON public.role_permissions;
CREATE POLICY "Admins read role permissions"
  ON public.role_permissions FOR SELECT USING (public.is_admin());

-- ── RBAC: User Roles (junction) ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_roles (
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role_id     uuid NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  granted_by  uuid REFERENCES auth.users(id),
  granted_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz,
  PRIMARY KEY (user_id, role_id)
);

CREATE INDEX IF NOT EXISTS idx_user_roles_role_id     ON public.user_roles(role_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id     ON public.user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_expires_at  ON public.user_roles(expires_at) WHERE expires_at IS NOT NULL;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage user roles" ON public.user_roles;
CREATE POLICY "Admins manage user roles"
  ON public.user_roles FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ── RBAC: Admin Region Scopes ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.admin_region_scopes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  country_id  text NOT NULL REFERENCES public.countries(id) ON DELETE CASCADE,
  granted_by  uuid REFERENCES auth.users(id),
  granted_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, country_id)
);

CREATE INDEX IF NOT EXISTS idx_admin_region_scopes_user_id    ON public.admin_region_scopes(user_id);
CREATE INDEX IF NOT EXISTS idx_admin_region_scopes_country_id ON public.admin_region_scopes(country_id);

ALTER TABLE public.admin_region_scopes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage region scopes" ON public.admin_region_scopes;
CREATE POLICY "Admins manage region scopes"
  ON public.admin_region_scopes FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ── Checkout Sessions ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.checkout_sessions (
  id                    uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid    REFERENCES auth.users(id) ON DELETE SET NULL,
  session_token         text    NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  cart_id               uuid    REFERENCES public.carts(id) ON DELETE SET NULL,
  status                text    NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'completed', 'abandoned', 'expired')),
  currency_code         char(3) REFERENCES public.currencies(id),
  country_id            text    REFERENCES public.countries(id),
  locale_id             text    REFERENCES public.locales(id),
  subtotal              numeric(12,2),
  tax                   numeric(12,2),
  shipping              numeric(12,2),
  discount              numeric(12,2),
  total                 numeric(12,2),
  shipping_address      jsonb,
  billing_address       jsonb,
  coupon_id             uuid    REFERENCES public.coupons(id) ON DELETE SET NULL,
  coupon_code           text,
  notes                 text,
  payment_provider_ref  text,
  idempotency_key       text    UNIQUE,
  expires_at            timestamptz NOT NULL DEFAULT (now() + interval '2 hours'),
  completed_at          timestamptz,
  order_id              uuid    REFERENCES public.orders(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_checkout_sessions_user_id_status
  ON public.checkout_sessions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_checkout_sessions_session_token
  ON public.checkout_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_checkout_sessions_expires_at
  ON public.checkout_sessions(expires_at) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_checkout_sessions_order_id
  ON public.checkout_sessions(order_id);

CREATE TRIGGER trg_checkout_sessions_updated_at
  BEFORE UPDATE ON public.checkout_sessions
  FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();

ALTER TABLE public.checkout_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own checkout sessions" ON public.checkout_sessions;
CREATE POLICY "Users manage own checkout sessions"
  ON public.checkout_sessions FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Admins manage all checkout sessions" ON public.checkout_sessions;
CREATE POLICY "Admins manage all checkout sessions"
  ON public.checkout_sessions FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ── Checkout Session Items ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.checkout_session_items (
  id                    uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  checkout_session_id   uuid           NOT NULL REFERENCES public.checkout_sessions(id) ON DELETE CASCADE,
  variant_id            uuid           NOT NULL REFERENCES public.product_variants(id) ON DELETE RESTRICT,
  product_name          text           NOT NULL,
  variant_name          text,
  sku                   text,
  quantity              int            NOT NULL CHECK (quantity > 0),
  unit_price            numeric(12,2)  NOT NULL,
  tax_amount            numeric(12,2)  NOT NULL DEFAULT 0,
  discount_amount       numeric(12,2)  NOT NULL DEFAULT 0,
  total                 numeric(12,2)  NOT NULL,
  snapshot              jsonb,
  created_at            timestamptz    NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_checkout_session_items_session_id
  ON public.checkout_session_items(checkout_session_id);
CREATE INDEX IF NOT EXISTS idx_checkout_session_items_variant_id
  ON public.checkout_session_items(variant_id);

ALTER TABLE public.checkout_session_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own checkout session items" ON public.checkout_session_items;
CREATE POLICY "Users manage own checkout session items"
  ON public.checkout_session_items FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.checkout_sessions cs
      WHERE cs.id = checkout_session_id
        AND cs.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.checkout_sessions cs
      WHERE cs.id = checkout_session_id
        AND cs.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Admins manage all checkout session items" ON public.checkout_session_items;
CREATE POLICY "Admins manage all checkout session items"
  ON public.checkout_session_items FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ── Refund Requests ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.refund_requests (
  id                  uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id            uuid           NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  user_id             uuid           NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  return_request_id   uuid           REFERENCES public.return_requests(id) ON DELETE SET NULL,
  status              text           NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'processing', 'completed', 'rejected', 'cancelled')),
  reason              text           NOT NULL,
  total_amount        numeric(12,2)  NOT NULL DEFAULT 0,
  currency_code       char(3)        REFERENCES public.currencies(id),
  admin_notes         text,
  reviewed_by         uuid           REFERENCES auth.users(id),
  reviewed_at         timestamptz,
  completed_at        timestamptz,
  payment_id          uuid           REFERENCES public.payments(id) ON DELETE SET NULL,
  gateway_refund_id   text,
  created_at          timestamptz    NOT NULL DEFAULT now(),
  updated_at          timestamptz    NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_refund_requests_order_id   ON public.refund_requests(order_id);
CREATE INDEX IF NOT EXISTS idx_refund_requests_user_id    ON public.refund_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_refund_requests_status     ON public.refund_requests(status);

CREATE TRIGGER trg_refund_requests_updated_at
  BEFORE UPDATE ON public.refund_requests
  FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();

ALTER TABLE public.refund_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own refund requests" ON public.refund_requests;
CREATE POLICY "Users manage own refund requests"
  ON public.refund_requests FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Admins manage all refund requests" ON public.refund_requests;
CREATE POLICY "Admins manage all refund requests"
  ON public.refund_requests FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ── Refund Items ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.refund_items (
  id                  uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  refund_request_id   uuid           NOT NULL REFERENCES public.refund_requests(id) ON DELETE CASCADE,
  order_item_id       uuid           NOT NULL REFERENCES public.order_items(id) ON DELETE RESTRICT,
  quantity            int            NOT NULL CHECK (quantity > 0),
  unit_price          numeric(12,2)  NOT NULL,
  tax_amount          numeric(12,2)  NOT NULL DEFAULT 0,
  refund_amount       numeric(12,2)  NOT NULL,
  reason              text,
  created_at          timestamptz    NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_refund_items_refund_request_id ON public.refund_items(refund_request_id);
CREATE INDEX IF NOT EXISTS idx_refund_items_order_item_id     ON public.refund_items(order_item_id);

ALTER TABLE public.refund_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own refund items" ON public.refund_items;
CREATE POLICY "Users view own refund items"
  ON public.refund_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.refund_requests rr
      WHERE rr.id = refund_request_id
        AND rr.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Admins manage all refund items" ON public.refund_items;
CREATE POLICY "Admins manage all refund items"
  ON public.refund_items FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ── Admin Action Logs ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.admin_action_logs (
  id            uuid  PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id      uuid  NOT NULL REFERENCES auth.users(id),
  actor_role    text  NOT NULL,
  action        text  NOT NULL,   -- 'create','update','delete','status_change','bulk_update'
  entity_type   text  NOT NULL,   -- 'product','order','coupon','user','cms_page'
  entity_id     text  NOT NULL,
  before_state  jsonb,
  after_state   jsonb,
  metadata      jsonb NOT NULL DEFAULT '{}',
  ip_address    text,
  user_agent    text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_action_logs_actor_id       ON public.admin_action_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_admin_action_logs_entity         ON public.admin_action_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_admin_action_logs_created_at     ON public.admin_action_logs(created_at DESC);

ALTER TABLE public.admin_action_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read action logs" ON public.admin_action_logs;
CREATE POLICY "Admins read action logs"
  ON public.admin_action_logs FOR SELECT USING (public.is_admin());

-- ── Structural Additions to Existing Tables ───────────────────────────────────

-- Add brand_id and soft delete to products
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS brand_id    uuid        REFERENCES public.brands(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS deleted_at  timestamptz;

CREATE INDEX IF NOT EXISTS idx_products_brand_id    ON public.products(brand_id);
CREATE INDEX IF NOT EXISTS idx_products_deleted_at  ON public.products(deleted_at) WHERE deleted_at IS NULL;

-- Add soft delete to categories
ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_categories_deleted_at ON public.categories(deleted_at) WHERE deleted_at IS NULL;

-- Add tax/discount breakdown to order_items
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS tax_amount      numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_amount numeric(12,2) NOT NULL DEFAULT 0;

-- Add customer tier for future B2B pricing
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS customer_tier text DEFAULT 'standard'
    CHECK (customer_tier IN ('standard', 'vip', 'wholesale', 'employee'));

-- ── Fix RLS from migration 00005 — replace raw EXISTS with is_admin() ────────

-- order_status_history
DROP POLICY IF EXISTS "Admins manage order history" ON public.order_status_history;
CREATE POLICY "Admins manage order history"
  ON public.order_status_history FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- coupon_usage
DROP POLICY IF EXISTS "Admins view all coupon usage" ON public.coupon_usage;
CREATE POLICY "Admins view all coupon usage"
  ON public.coupon_usage FOR SELECT
  USING (public.is_admin());

-- ── Fix RLS from migration 00006 — replace raw EXISTS with is_admin() ────────

-- return_requests
DROP POLICY IF EXISTS "Admins manage all return requests" ON public.return_requests;
CREATE POLICY "Admins manage all return requests"
  ON public.return_requests FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- return_items
DROP POLICY IF EXISTS "Admins manage all return items" ON public.return_items;
CREATE POLICY "Admins manage all return items"
  ON public.return_items FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- payment_events
DROP POLICY IF EXISTS "Admins view all payment events" ON public.payment_events;
CREATE POLICY "Admins view all payment events"
  ON public.payment_events FOR SELECT
  USING (public.is_admin());

-- shipment_tracking
DROP POLICY IF EXISTS "Admins manage shipment tracking" ON public.shipment_tracking;
CREATE POLICY "Admins manage shipment tracking"
  ON public.shipment_tracking FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ── Missing updated_at triggers from migration 00007 ─────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_localized_cms_pages_updated_at'
  ) THEN
    CREATE TRIGGER trg_localized_cms_pages_updated_at
      BEFORE UPDATE ON public.localized_cms_pages
      FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_localized_homepage_sections_updated_at'
  ) THEN
    CREATE TRIGGER trg_localized_homepage_sections_updated_at
      BEFORE UPDATE ON public.localized_homepage_sections
      FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_localized_seo_updated_at'
  ) THEN
    CREATE TRIGGER trg_localized_seo_updated_at
      BEFORE UPDATE ON public.localized_seo
      FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_region_configs_updated_at'
  ) THEN
    CREATE TRIGGER trg_region_configs_updated_at
      BEFORE UPDATE ON public.region_configs
      FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();
  END IF;
END;
$$;

-- ── Seed: System Roles ────────────────────────────────────────────────────────
INSERT INTO public.roles (name, display_name, description, is_system) VALUES
  ('super_admin',       'Super Admin',       'Full system access with no restrictions',         true),
  ('admin',             'Admin',             'General admin access across all modules',          true),
  ('catalog_manager',   'Catalog Manager',   'Manages products, categories, and collections',   true),
  ('order_manager',     'Order Manager',     'Manages orders, refunds, and returns',             true),
  ('content_manager',   'Content Manager',   'Manages CMS pages, blocks, and banners',          true),
  ('regional_manager',  'Regional Manager',  'Manages operations scoped to assigned countries',  true)
ON CONFLICT (name) DO NOTHING;

-- ── Seed: Core Permissions ────────────────────────────────────────────────────
INSERT INTO public.permissions (code, resource, action, description) VALUES
  ('catalog:read',        'catalog',    'read',    'View products, categories, variants'),
  ('catalog:write',       'catalog',    'write',   'Create and update products and categories'),
  ('catalog:delete',      'catalog',    'delete',  'Delete products and categories'),
  ('orders:read',         'orders',     'read',    'View orders and order details'),
  ('orders:manage',       'orders',     'manage',  'Update, cancel, and process orders'),
  ('cms:read',            'cms',        'read',    'View CMS pages and blocks'),
  ('cms:write',           'cms',        'write',   'Create and update CMS content'),
  ('cms:publish',         'cms',        'approve', 'Publish and schedule CMS content'),
  ('inventory:read',      'inventory',  'read',    'View inventory levels and movements'),
  ('inventory:manage',    'inventory',  'manage',  'Update inventory and warehouse stock'),
  ('customers:read',      'customers',  'read',    'View customer profiles and data'),
  ('customers:manage',    'customers',  'manage',  'Update and manage customer accounts'),
  ('reports:view',        'reports',    'read',    'View analytics and reports'),
  ('settings:manage',     'settings',   'manage',  'Manage platform settings and configuration')
ON CONFLICT (code) DO NOTHING;

-- ── Seed: Role–Permission Mappings ────────────────────────────────────────────
-- super_admin → all permissions
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name = 'super_admin'
ON CONFLICT DO NOTHING;

-- admin → all permissions
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name = 'admin'
ON CONFLICT DO NOTHING;

-- catalog_manager → catalog + inventory:read
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
JOIN public.permissions p ON p.code IN (
  'catalog:read', 'catalog:write', 'catalog:delete',
  'inventory:read'
)
WHERE r.name = 'catalog_manager'
ON CONFLICT DO NOTHING;

-- order_manager → orders + customers:read + inventory:read
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
JOIN public.permissions p ON p.code IN (
  'orders:read', 'orders:manage',
  'customers:read',
  'inventory:read'
)
WHERE r.name = 'order_manager'
ON CONFLICT DO NOTHING;

-- content_manager → cms + catalog:read
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
JOIN public.permissions p ON p.code IN (
  'cms:read', 'cms:write', 'cms:publish',
  'catalog:read'
)
WHERE r.name = 'content_manager'
ON CONFLICT DO NOTHING;

-- regional_manager → read everything + orders:manage
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
JOIN public.permissions p ON p.code IN (
  'catalog:read', 'orders:read', 'orders:manage',
  'cms:read', 'inventory:read', 'customers:read', 'reports:view'
)
WHERE r.name = 'regional_manager'
ON CONFLICT DO NOTHING;

-- ── Helper Function: has_permission() ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.has_permission(p_permission_code text)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.role_permissions rp ON rp.role_id = ur.role_id
    JOIN public.permissions p ON p.id = rp.permission_id
    WHERE ur.user_id = auth.uid()
      AND p.code = p_permission_code
      AND (ur.expires_at IS NULL OR ur.expires_at > now())
  )
$$;
