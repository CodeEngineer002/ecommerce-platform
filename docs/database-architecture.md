# Database Architecture

Enterprise PostgreSQL/Supabase schema for a global, multi-region, CMS-driven ecommerce platform.

---

## Schema Philosophy

- **Additive migrations only** — each migration extends, never breaks, prior tables
- **Default deny RLS** — every table has RLS enabled; no row is accessible without an explicit policy
- **No trust in frontend** — all price mutations, inventory changes, payment status updates happen server-side via PostgreSQL functions or service-role API calls
- **Immutable order snapshots** — `order_items.snapshot` captures product data at purchase time; orders never depend on mutable catalog data
- **Audit first** — status transitions produce history rows; admin mutations produce action log rows

---

## Domain Map

| Domain | Tables | Migration |
|---|---|---|
| Identity | `profiles` | 00001 |
| Auth/RBAC | `roles`, `permissions`, `role_permissions`, `user_roles`, `admin_region_scopes` | 00008 |
| Globalization | `languages`, `countries`, `locales`, `region_configs`, `currencies` | 00007, 00008 |
| Catalog Core | `products`, `product_variants`, `product_images`, `categories` | 00001 |
| Catalog Localizations | `product_localizations`, `category_localizations`, `brand_localizations`, `collection_localizations` | 00009 |
| Catalog Options | `product_options`, `product_option_values`, `variant_option_values` | 00009 |
| Catalog Attributes | `product_attributes`, `product_attribute_values` | 00009 |
| Catalog Taxonomy | `product_categories`, `brands`, `collections`, `collection_products` | 00008, 00009 |
| Pricing | `price_lists`, `product_prices`, `variant_prices` | 00008 |
| Inventory | `inventory` (simple), `inventory_levels` (multi-warehouse), `inventory_movements`, `warehouses` | 00001, 00008 |
| Cart | `carts`, `cart_items` | 00001 |
| Checkout | `checkout_sessions`, `checkout_session_items` | 00008 |
| Orders | `orders`, `order_items`, `order_status_history` | 00001, 00005 |
| Payments | `payments`, `payment_events`, `payment_refunds`, `idempotency_keys` | 00001, 00006 |
| Fulfillment | `shipment_tracking` | 00006 |
| Returns | `return_requests`, `return_items` | 00006 |
| Refunds | `refund_requests`, `refund_items` | 00008 |
| Promotions | `coupons`, `coupon_usage` | 00001, 00005 |
| Reviews | `reviews`, `review_votes` | 00001, 00009 |
| Wishlist | `wishlists` | 00001 |
| CMS | `localized_cms_pages`, `localized_homepage_sections`, `cms_page_versions`, `cms_blocks`, `cms_navigation_menus`, `cms_navigation_items`, `cms_banners` | 00007, 00010 |
| Media | `media_assets`, `media_folders` | 00010 |
| Shipping | `shipping_methods`, `shipping_zones`, `shipping_zone_methods` | 00010 |
| Audit | `admin_action_logs` | 00008 |

---

## Key Architectural Decisions

### 1. Inventory Strategy — `inventory_levels` is the Single Source of Truth

> **⚠️ IMPORTANT (migration 00017):** The legacy `inventory` table still exists in the DB for historical data but **must not be read or written by application code**. `inventory_levels` is the authoritative source.

**Active mode** (`inventory_levels` table): One row per `(warehouse_id, variant_id)`. Available stock = `quantity - reserved`. The `create_order_atomic` RPC locks rows with `SELECT FOR UPDATE ORDER BY variant_id` (deadlock-safe). `release_inventory_reservation(p_order_id)` releases reserved stock on cancellation.

**Legacy table** (`inventory`): Retained for historical reference only. Do not use in new code — see CLAUDE.md Step 1 for full context.

### 2. Pricing Strategy — Price Lists

All prices live in `price_lists → product_prices / variant_prices`. The existing `products.base_price` is kept for backwards compatibility but **new code should read from `variant_prices` via the applicable price list**.

Price resolution order (server-side):
1. Active `variant_prices` row for the user's price_list + country
2. Active `product_prices` row for the same
3. Country-level default price list
4. Global default price list (`is_default = true`)
5. `products.base_price` as ultimate fallback

### 3. Localized Content — Locale-first

Product content (`name`, `description`, `seo_*`) lives in `product_localizations`. The base `products.name` is English and used as a fallback when no localization exists.

Fallback chain: `exact locale → country default locale → English`

### 4. Order Immutability

Once an order is created:
- `order_items.snapshot` contains the full product/variant snapshot as JSONB
- `order_items.product_name`, `sku`, `unit_price` are denormalized at creation time
- Status changes only happen via `update_order_status()` which enforces the state machine
- No UPDATE is allowed on price/quantity columns after insertion

### 5. RBAC

The platform uses a hybrid auth model:
- `profiles.role` enum (`customer | admin | super_admin`) — legacy, maintained for backwards compat
- New fine-grained: `user_roles` → `roles` → `role_permissions` → `permissions`
- `is_admin()` function checks `profiles.role` (fast, cached path for RLS)
- `has_permission(code)` function checks the new RBAC tables

System roles and their permissions:
| Role | Permissions |
|---|---|
| `super_admin` | All (bypasses per-permission checks) |
| `admin` | Only explicitly granted permissions (fine-grained via `role_permissions`) |
| `customer` | None (storefront access only) |

> **Note:** Unlike early design, `admin` does NOT automatically have all permissions. Permissions are granted per-admin via `role_permissions`. Legacy admins who predate RBAC have an allow-all fallback during transition. See `docs/admin-architecture.md` and `docs/knowledge-graph/permissions.json` for the full 25-permission code list.

---

## Table Reference

### profiles
Extends `auth.users`. One row per registered user. `role` drives `is_admin()`.

Added in 00008: `customer_tier` (standard/vip/wholesale/employee) for future B2B pricing.

### products
Core catalog entity. `slug` is unique. `category_id` is the primary category (maintained by trigger from `product_categories`). `brand_id` FK to `brands`.

Soft delete via `deleted_at` (added in 00008) — filter `WHERE deleted_at IS NULL` in queries.

### product_variants
Each variant has a `sku`, optional `price` override (legacy), and `options` JSONB (legacy). New code should use `variant_option_values` for structured options.

### inventory_levels
Multi-warehouse inventory. `available = quantity - reserved`. Always use `FOR UPDATE` when reading before writing to prevent over-selling.

### price_lists
Currency-specific pricing tiers. `is_default = true` identifies the global fallback list. Country-specific lists have `country_id` set.

### orders
Immutable after creation. `status` managed by `update_order_status()` state machine. `shipping_address` and `billing_address` are JSONB snapshots of the address at checkout time.

### checkout_sessions
Ephemeral checkout state. `expires_at = now() + 2h`. `idempotency_key` prevents duplicate submissions. `order_id` is populated when checkout completes.

### refund_requests
Distinct from `return_requests`. A refund can exist without a return (e.g., wrong item sent, price match refund). Links optionally to a `return_request_id`.

### admin_action_logs
Append-only audit log. No UPDATE/DELETE policies — once written, immutable. `before_state`/`after_state` JSONB store the diff.

---

## Migration Order

```
00001 — Initial schema (profiles, catalog, inventory, orders, payments, reviews, CMS)
00002 — Storage buckets
00003 — RLS recursion fix (is_admin() function)
00004 — Missing functions + indexes
00005 — Business logic (order_status_history, coupon_usage, atomic order creation)
00006 — Enterprise domain (returns, payment events, shipment tracking)
00007 — Globalization (languages, countries, locales, region_configs, localized CMS)
00008 — Enterprise core (currencies, warehouses, pricing, RBAC, checkout, refunds, audit)
00009 — Catalog v2 (localizations, options, attributes, collections, m2m categories)
00010 — CMS v2 + media + shipping (versioning, blocks, navigation, banners, media, shipping)
00011 — Order management (order_address_snapshots, cart_events, order_events)
00012 — Cart domain (guest cart, cart_events full schema, session_id support)
00013 — Address domain (customer_addresses, address_country_rules)
00014 — Location domain (administrative_regions, cities)
00015 — CMS inheritance (cms_inheritance_audit, inheritance states)
00016 — Country product scope
00017 — Inventory unification (inventory_levels → single source of truth; legacy inventory retired)
00018 — Scheduled jobs (pg_cron: expire_abandoned_carts, cancel_unpaid_orders; restored update_order_status state machine)
```

> See `docs/architecture/SYSTEM_OVERVIEW.md` for a full migration summary table.
