# Indexing Strategy

## Principles

1. **Index what you query, not what you store** — every index is justified by a specific query pattern
2. **Partial indexes over full indexes** for boolean flags — `WHERE is_active = true` halves the index size
3. **Composite indexes** follow column selectivity order — high cardinality first
4. **GIN indexes** only for `text[]` arrays and JSONB that are searched with `@>` or `@@`
5. **FTS index** on `products` using `to_tsvector` — never do full-table `LIKE '%...'` searches

---

## Critical Indexes by Query Pattern

### Storefront product listing
```sql
idx_products_is_active            -- WHERE is_active = true
idx_products_category_id          -- WHERE category_id = ?
idx_products_is_featured          -- WHERE is_featured = true
idx_products_tags (GIN)           -- WHERE tags @> '{tag}'
idx_products_fts (GIN)            -- Full-text search on name + description
idx_product_categories_category   -- JOIN product_categories WHERE category_id = ?
```

### Product detail page
```sql
idx_products_slug                 -- WHERE slug = ?
idx_product_variants_product_id   -- WHERE product_id = ?
idx_product_images_product_id     -- WHERE product_id = ?
idx_inventory_levels_variant_id   -- WHERE variant_id = ?
idx_variant_prices_variant_id     -- WHERE variant_id = ? AND price_list_id = ?
```

### Locale/region queries
```sql
idx_locales_country_id            -- WHERE country_id = ?
idx_product_localizations_locale  -- WHERE product_id = ? AND locale_id = ?
idx_localized_cms_pages_locale_id -- WHERE locale_id = ? AND slug = ?
```

### Cart & checkout
```sql
idx_carts_user_id                 -- WHERE user_id = ?
idx_carts_session_id              -- WHERE session_id = ? (guest carts)
idx_cart_items_cart_id            -- WHERE cart_id = ?
idx_checkout_sessions_user_status -- WHERE user_id = ? AND status = 'active'
```

### Order lookup
```sql
idx_orders_user_id                -- Customer order history
idx_orders_status                 -- Admin order management filters
idx_orders_created_at DESC        -- Time-range queries, recent orders first
idx_orders_order_number           -- Order lookup by number
idx_order_items_order_id          -- All items for an order
idx_order_items_variant_id        -- Analytics: what sold
```

### Payment & webhook processing
```sql
idx_payments_order_id             -- Get payment for an order
idx_payments_provider_payment_id  -- Webhook lookup by provider reference
idx_idempotency_keys_key          -- Deduplication: O(1) by idempotency key
idx_payment_events_payment_id     -- Event history for a payment
```

### Inventory management
```sql
idx_inventory_variant_id          -- Available stock check
idx_inventory_levels_variant_id   -- Multi-warehouse available
idx_inventory_movements_variant_id -- Movement history for a variant
idx_inventory_movements_source_id -- Movements for an order/return
```

### Coupon validation
```sql
idx_coupons_code (unique, upper())  -- Case-insensitive lookup by code
idx_coupon_usage_coupon_id          -- How many times used
idx_coupon_usage_user_id            -- Has this user used this coupon?
```

### CMS rendering
```sql
idx_localized_cms_pages_slug        -- Page by slug
idx_localized_cms_pages_locale_id   -- All pages for a locale
idx_localized_hp_sections_locale    -- Homepage sections for a locale
idx_cms_banners_locale_active       -- Active banners for a locale
idx_cms_navigation_menus_locale     -- Nav menu by locale + handle
```

### Admin dashboard
```sql
idx_profiles_email                  -- User search by email
idx_reviews_product_approved        -- Approved reviews per product
idx_admin_action_logs_entity        -- Audit trail for an entity
idx_admin_action_logs_created_at    -- Recent admin actions
```

---

## What NOT to Index

- Low-cardinality booleans on large tables without a WHERE predicate filter (use partial index instead)
- JSONB columns unless using `@>` containment operators at high frequency
- Columns that are almost never queried directly
- `created_at` on small tables (< 10k rows)

---

## Full-Text Search

Products use a GIN index over `to_tsvector('english', name || ' ' || coalesce(description, ''))`.

For multi-language FTS (e.g., German product names), create language-specific tsvector columns on `product_localizations`:

```sql
ALTER TABLE public.product_localizations
  ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (
    to_tsvector('german', coalesce(name, '') || ' ' || coalesce(description, ''))
  ) STORED;

CREATE INDEX idx_product_localizations_fts ON public.product_localizations
  USING GIN (search_vector);
```
