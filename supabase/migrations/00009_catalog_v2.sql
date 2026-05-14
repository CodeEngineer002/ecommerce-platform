-- ============================================================
-- MIGRATION 00009 — CATALOG V2
-- Product & category localizations, normalized variant options,
-- product attributes, multi-category m2m, collections,
-- and review enhancements.
-- ============================================================

-- ── Product Localizations ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.product_localizations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id    uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  locale_id     text NOT NULL REFERENCES public.locales(id) ON DELETE CASCADE,
  name          text NOT NULL,
  description   text,
  short_desc    text,
  seo_title     text,
  seo_desc      text,
  seo_image_url text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, locale_id)
);

CREATE INDEX IF NOT EXISTS idx_product_localizations_product_locale
  ON public.product_localizations(product_id, locale_id);
CREATE INDEX IF NOT EXISTS idx_product_localizations_locale_id
  ON public.product_localizations(locale_id);

CREATE TRIGGER trg_product_localizations_updated_at
  BEFORE UPDATE ON public.product_localizations
  FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();

ALTER TABLE public.product_localizations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read product localizations" ON public.product_localizations;
CREATE POLICY "Public read product localizations"
  ON public.product_localizations FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins manage product localizations" ON public.product_localizations;
CREATE POLICY "Admins manage product localizations"
  ON public.product_localizations FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ── Category Localizations ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.category_localizations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id  uuid NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  locale_id    text NOT NULL REFERENCES public.locales(id) ON DELETE CASCADE,
  name         text NOT NULL,
  description  text,
  seo_title    text,
  seo_desc     text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (category_id, locale_id)
);

CREATE INDEX IF NOT EXISTS idx_category_localizations_category_locale
  ON public.category_localizations(category_id, locale_id);
CREATE INDEX IF NOT EXISTS idx_category_localizations_locale_id
  ON public.category_localizations(locale_id);

CREATE TRIGGER trg_category_localizations_updated_at
  BEFORE UPDATE ON public.category_localizations
  FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();

ALTER TABLE public.category_localizations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read category localizations" ON public.category_localizations;
CREATE POLICY "Public read category localizations"
  ON public.category_localizations FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins manage category localizations" ON public.category_localizations;
CREATE POLICY "Admins manage category localizations"
  ON public.category_localizations FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ── Product Options ──────────────────────────────────────────────────────────
-- Normalized variant option axes: Size, Color, Material, etc.
CREATE TABLE IF NOT EXISTS public.product_options (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id      uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  name            text NOT NULL,           -- 'size', 'color', 'material'
  display_name    text NOT NULL,           -- 'Size', 'Color', 'Material'
  display_type    text NOT NULL DEFAULT 'dropdown'
    CHECK (display_type IN ('dropdown', 'radio', 'color_swatch', 'button')),
  sort_order      int  NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, name)
);

CREATE INDEX IF NOT EXISTS idx_product_options_product_id ON public.product_options(product_id);

ALTER TABLE public.product_options ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read product options" ON public.product_options;
CREATE POLICY "Public read product options"
  ON public.product_options FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins manage product options" ON public.product_options;
CREATE POLICY "Admins manage product options"
  ON public.product_options FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ── Product Option Values ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.product_option_values (
  id                uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  product_option_id uuid    NOT NULL REFERENCES public.product_options(id) ON DELETE CASCADE,
  value             text    NOT NULL,          -- 'small', 'red'
  display_value     text    NOT NULL,          -- 'Small', 'Red'
  hex_color         char(7),                   -- '#FF0000' for color swatches
  sort_order        int     NOT NULL DEFAULT 0,
  is_active         boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_option_id, value)
);

CREATE INDEX IF NOT EXISTS idx_product_option_values_option_id
  ON public.product_option_values(product_option_id);

ALTER TABLE public.product_option_values ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read product option values" ON public.product_option_values;
CREATE POLICY "Public read product option values"
  ON public.product_option_values FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins manage product option values" ON public.product_option_values;
CREATE POLICY "Admins manage product option values"
  ON public.product_option_values FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ── Variant Option Values ────────────────────────────────────────────────────
-- Maps each variant to its combination of chosen option values.
CREATE TABLE IF NOT EXISTS public.variant_option_values (
  variant_id       uuid NOT NULL REFERENCES public.product_variants(id) ON DELETE CASCADE,
  option_value_id  uuid NOT NULL REFERENCES public.product_option_values(id) ON DELETE CASCADE,
  PRIMARY KEY (variant_id, option_value_id)
);

CREATE INDEX IF NOT EXISTS idx_variant_option_values_variant_id
  ON public.variant_option_values(variant_id);
CREATE INDEX IF NOT EXISTS idx_variant_option_values_option_value_id
  ON public.variant_option_values(option_value_id);

ALTER TABLE public.variant_option_values ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read variant option values" ON public.variant_option_values;
CREATE POLICY "Public read variant option values"
  ON public.variant_option_values FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins manage variant option values" ON public.variant_option_values;
CREATE POLICY "Admins manage variant option values"
  ON public.variant_option_values FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ── Product Attributes ───────────────────────────────────────────────────────
-- Spec axes: Material, Weight, Care Instructions, etc.
CREATE TABLE IF NOT EXISTS public.product_attributes (
  id              uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text    NOT NULL UNIQUE,    -- 'material', 'weight_kg', 'care_instructions'
  display_name    text    NOT NULL,
  attribute_type  text    NOT NULL DEFAULT 'text'
    CHECK (attribute_type IN ('text', 'number', 'boolean', 'url', 'list', 'rich_text')),
  unit            text,                       -- 'kg','cm','ml'
  is_filterable   boolean NOT NULL DEFAULT false,
  is_searchable   boolean NOT NULL DEFAULT false,
  sort_order      int     NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_attributes_filterable
  ON public.product_attributes(is_filterable) WHERE is_filterable = true;

ALTER TABLE public.product_attributes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read product attributes" ON public.product_attributes;
CREATE POLICY "Public read product attributes"
  ON public.product_attributes FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins manage product attributes" ON public.product_attributes;
CREATE POLICY "Admins manage product attributes"
  ON public.product_attributes FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ── Product Attribute Values ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.product_attribute_values (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id    uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  attribute_id  uuid NOT NULL REFERENCES public.product_attributes(id) ON DELETE CASCADE,
  value         text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, attribute_id)
);

CREATE INDEX IF NOT EXISTS idx_product_attribute_values_product_id
  ON public.product_attribute_values(product_id);
CREATE INDEX IF NOT EXISTS idx_product_attribute_values_attribute_id
  ON public.product_attribute_values(attribute_id);

ALTER TABLE public.product_attribute_values ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read product attribute values" ON public.product_attribute_values;
CREATE POLICY "Public read product attribute values"
  ON public.product_attribute_values FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins manage product attribute values" ON public.product_attribute_values;
CREATE POLICY "Admins manage product attribute values"
  ON public.product_attribute_values FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ── Product Categories (proper m2m) ──────────────────────────────────────────
-- Replaces the single category_id FK with a full many-to-many join table.
-- is_primary=true rows keep products.category_id in sync (backwards compat).
CREATE TABLE IF NOT EXISTS public.product_categories (
  product_id   uuid    NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  category_id  uuid    NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  is_primary   boolean NOT NULL DEFAULT false,
  sort_order   int     NOT NULL DEFAULT 0,
  PRIMARY KEY (product_id, category_id)
);

CREATE INDEX IF NOT EXISTS idx_product_categories_category_id
  ON public.product_categories(category_id);
CREATE INDEX IF NOT EXISTS idx_product_categories_primary
  ON public.product_categories(product_id, is_primary);

ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read product categories" ON public.product_categories;
CREATE POLICY "Public read product categories"
  ON public.product_categories FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins manage product categories" ON public.product_categories;
CREATE POLICY "Admins manage product categories"
  ON public.product_categories FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Trigger: when a product_categories row with is_primary=true is inserted,
-- sync products.category_id for backwards compatibility.
CREATE OR REPLACE FUNCTION public.sync_primary_category()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.is_primary = true THEN
    UPDATE public.products
       SET category_id = NEW.category_id
     WHERE id = NEW.product_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_primary_category ON public.product_categories;
CREATE TRIGGER trg_sync_primary_category
  AFTER INSERT OR UPDATE OF is_primary ON public.product_categories
  FOR EACH ROW EXECUTE PROCEDURE public.sync_primary_category();

-- ── Collections ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.collections (
  id               uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  name             text    NOT NULL,
  slug             text    NOT NULL UNIQUE,
  description      text,
  image_url        text,
  type             text    NOT NULL DEFAULT 'manual'
    CHECK (type IN ('manual', 'automatic')),
  condition_match  text    DEFAULT 'all'
    CHECK (condition_match IN ('all', 'any')),
  rules            jsonb   DEFAULT '{}',
  is_active        boolean NOT NULL DEFAULT true,
  sort_order       int     NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_collections_slug            ON public.collections(slug);
CREATE INDEX IF NOT EXISTS idx_collections_active_sort     ON public.collections(is_active, sort_order);

CREATE TRIGGER trg_collections_updated_at
  BEFORE UPDATE ON public.collections
  FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();

ALTER TABLE public.collections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read active collections" ON public.collections;
CREATE POLICY "Public read active collections"
  ON public.collections FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS "Admins manage collections" ON public.collections;
CREATE POLICY "Admins manage collections"
  ON public.collections FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ── Collection Localizations ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.collection_localizations (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id  uuid NOT NULL REFERENCES public.collections(id) ON DELETE CASCADE,
  locale_id      text NOT NULL REFERENCES public.locales(id) ON DELETE CASCADE,
  name           text NOT NULL,
  description    text,
  seo_title      text,
  seo_desc       text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (collection_id, locale_id)
);

CREATE INDEX IF NOT EXISTS idx_collection_localizations_collection_id
  ON public.collection_localizations(collection_id);
CREATE INDEX IF NOT EXISTS idx_collection_localizations_locale_id
  ON public.collection_localizations(locale_id);

CREATE TRIGGER trg_collection_localizations_updated_at
  BEFORE UPDATE ON public.collection_localizations
  FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();

ALTER TABLE public.collection_localizations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read collection localizations" ON public.collection_localizations;
CREATE POLICY "Public read collection localizations"
  ON public.collection_localizations FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins manage collection localizations" ON public.collection_localizations;
CREATE POLICY "Admins manage collection localizations"
  ON public.collection_localizations FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ── Collection Products (junction) ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.collection_products (
  collection_id  uuid        NOT NULL REFERENCES public.collections(id) ON DELETE CASCADE,
  product_id     uuid        NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  sort_order     int         NOT NULL DEFAULT 0,
  added_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (collection_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_collection_products_product_id
  ON public.collection_products(product_id);
CREATE INDEX IF NOT EXISTS idx_collection_products_collection_sort
  ON public.collection_products(collection_id, sort_order);

ALTER TABLE public.collection_products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read collection products" ON public.collection_products;
CREATE POLICY "Public read collection products"
  ON public.collection_products FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins manage collection products" ON public.collection_products;
CREATE POLICY "Admins manage collection products"
  ON public.collection_products FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ── Review Enhancements ──────────────────────────────────────────────────────
ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS order_item_id      uuid REFERENCES public.order_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS helpful_count      int  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS not_helpful_count  int  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS media_urls         text[] DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_reviews_order_item_id ON public.reviews(order_item_id)
  WHERE order_item_id IS NOT NULL;

-- ── Review Votes ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.review_votes (
  id          uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id   uuid    NOT NULL REFERENCES public.reviews(id) ON DELETE CASCADE,
  user_id     uuid    NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  is_helpful  boolean NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (review_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_review_votes_review_id ON public.review_votes(review_id);
CREATE INDEX IF NOT EXISTS idx_review_votes_user_id   ON public.review_votes(user_id);

ALTER TABLE public.review_votes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own review votes" ON public.review_votes;
CREATE POLICY "Users manage own review votes"
  ON public.review_votes FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Admins read all review votes" ON public.review_votes;
CREATE POLICY "Admins read all review votes"
  ON public.review_votes FOR SELECT USING (public.is_admin());

-- Trigger: keep helpful/not_helpful counters in sync on review_votes insert/delete.
CREATE OR REPLACE FUNCTION public.update_review_vote_counts()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.is_helpful THEN
      UPDATE public.reviews SET helpful_count = helpful_count + 1 WHERE id = NEW.review_id;
    ELSE
      UPDATE public.reviews SET not_helpful_count = not_helpful_count + 1 WHERE id = NEW.review_id;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.is_helpful THEN
      UPDATE public.reviews SET helpful_count = GREATEST(0, helpful_count - 1) WHERE id = OLD.review_id;
    ELSE
      UPDATE public.reviews SET not_helpful_count = GREATEST(0, not_helpful_count - 1) WHERE id = OLD.review_id;
    END IF;
  ELSIF TG_OP = 'UPDATE' AND OLD.is_helpful IS DISTINCT FROM NEW.is_helpful THEN
    -- Flip: decrement old bucket, increment new bucket
    IF NEW.is_helpful THEN
      UPDATE public.reviews
         SET helpful_count     = helpful_count + 1,
             not_helpful_count = GREATEST(0, not_helpful_count - 1)
       WHERE id = NEW.review_id;
    ELSE
      UPDATE public.reviews
         SET not_helpful_count = not_helpful_count + 1,
             helpful_count     = GREATEST(0, helpful_count - 1)
       WHERE id = NEW.review_id;
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_review_vote_counts ON public.review_votes;
CREATE TRIGGER trg_review_vote_counts
  AFTER INSERT OR UPDATE OF is_helpful OR DELETE ON public.review_votes
  FOR EACH ROW EXECUTE PROCEDURE public.update_review_vote_counts();
