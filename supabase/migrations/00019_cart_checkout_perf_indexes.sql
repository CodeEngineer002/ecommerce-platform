-- Migration 00019: Cart & Checkout Performance Indexes
--
-- These indexes address the N+1 / full-table-scan queries identified in the
-- cart → checkout performance audit. Each index is explained below.
--
-- ALL indexes use `IF NOT EXISTS` so this migration is safe to re-run.

-- ── carts ────────────────────────────────────────────────────────────────────

-- Primary cart lookup: getOrCreateCart() filters by user_id + status='active'.
-- Without this index Postgres scans all carts per user on every page load.
create index if not exists idx_carts_user_id_status
  on public.carts (user_id, status)
  where user_id is not null;

-- Guest cart lookup: same query but keyed by anonymous session token.
create index if not exists idx_carts_session_id_status
  on public.carts (session_id, status)
  where session_id is not null;

-- Expired/abandoned cart cleanup job (pg_cron, migration 00018).
create index if not exists idx_carts_expires_at
  on public.carts (expires_at)
  where status = 'active';

-- ── cart_items ───────────────────────────────────────────────────────────────

-- All item reads and writes filter by cart_id.
-- Critical for CartService.getOrCreateCart() which joins items to every cart.
create index if not exists idx_cart_items_cart_id
  on public.cart_items (cart_id);

-- ── checkout_sessions ────────────────────────────────────────────────────────

-- Lookup by cart_id + status when creating/resuming a checkout session.
create index if not exists idx_checkout_sessions_cart_id_status
  on public.checkout_sessions (cart_id, status);

-- Expiry cleanup (active sessions expire after 2h).
create index if not exists idx_checkout_sessions_expires_at
  on public.checkout_sessions (expires_at)
  where status = 'active';

-- ── customer_addresses ───────────────────────────────────────────────────────

-- Address panel on checkout page: fetches all active addresses for a user.
-- Filters by user_id + archived_at IS NULL (active addresses only).
create index if not exists idx_customer_addresses_user_active
  on public.customer_addresses (user_id, archived_at)
  where archived_at is null;

-- Country-scoped address filtering (checkout shows country-matching addresses first).
create index if not exists idx_customer_addresses_user_country
  on public.customer_addresses (user_id, country_code)
  where archived_at is null;

-- ── inventory_levels ─────────────────────────────────────────────────────────

-- Stock lookup in addCartItem() and validateCartForCheckout().
-- Joins inventory_levels by variant_id on every cart add/validate.
-- (variant_id alone is sufficient; warehouse_id is not filtered in most queries)
create index if not exists idx_inventory_levels_variant_id
  on public.inventory_levels (variant_id);

-- ── product_variants ─────────────────────────────────────────────────────────

-- CartService and order creation look up multiple variants by id + is_active.
-- The (id, is_active) composite index supports IN (variantIds) with filter.
create index if not exists idx_product_variants_id_active
  on public.product_variants (id, is_active);

-- ── order_status_history ─────────────────────────────────────────────────────

-- Order detail page fetches status history for a given order_id.
create index if not exists idx_order_status_history_order_id
  on public.order_status_history (order_id);
