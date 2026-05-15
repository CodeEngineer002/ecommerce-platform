# Domain Map

> Canonical reference for domain boundaries, ownership, and responsibilities.
> Each domain has a clear owner, bounded context, and defined interfaces to other domains.

---

## Domain Overview

| Domain | Owner Layer | Core Responsibility | DB Tables |
|--------|------------|--------------------|-----------| 
| **Cart** | `src/domain/cart/` + `src/lib/cart/` | Session-scoped shopping basket | `carts`, `cart_items`, `cart_events` |
| **Checkout** | `src/domain/checkout/` | Pre-order validation & orchestration | (no own tables) |
| **Order** | `src/domain/order/` | Order lifecycle, fulfillment | `orders`, `order_items`, `order_status_history`, `order_address_snapshots` |
| **Payment** | `src/domain/payment/` + `src/lib/payment/` | Payment processing & lifecycle | `payments`, `payment_events`, `idempotency_keys` |
| **Inventory** | `src/domain/inventory/` | Stock tracking, reservations | `inventory_levels`, `inventory_movements`, `warehouses` |
| **Pricing** | `src/domain/pricing/` | Price calculation (pure) | (no own tables) |
| **Coupon** | `src/domain/coupon/` | Discount validation & application | `coupons`, `coupon_usage` |
| **Address** | `src/domain/address/` | Address book, validation | `customer_addresses`, `address_country_rules`, `administrative_regions`, `cities` |
| **Shipping** | `src/domain/shipping/` | Shipping config (embedded in pricing) | (config-only, no own tables) |
| **Returns** | `src/domain/returns/` | Return eligibility, refund calculation | (uses `orders`, `order_items`) |
| **Review** | `src/domain/review/` | Product reviews | `reviews` |
| **CMS** | `src/lib/cms/` | Content delivery, block management | `cms_pages`, `cms_page_versions`, `localized_cms_pages`, `cms_blocks`, `cms_navigation_menus`, `cms_navigation_items`, `cms_banners`, `media_assets`, `media_folders` |
| **Localization** | `src/lib/i18n/` | Locale routing, translation | (compile-time config) |
| **Auth / RBAC** | `src/lib/admin/` + `src/lib/supabase/` | Identity, roles, permissions | `profiles`, `roles`, `permissions`, `role_permissions`, `user_roles`, `admin_action_logs` |
| **Catalog** | `src/app/admin/products/` | Product catalog management | `products`, `product_variants`, `product_images`, `categories` |
| **Observability** | `src/lib/logger.ts` | Structured logging, audit trails | `admin_action_logs` (shared) |

---

## Domain Boundaries

### Cart Domain
**Bounded context:** A cart exists per customer session (authenticated or guest). It holds items, applies coupons, and tracks pricing warnings. A cart never crosses to another user.

**Entry points:**
- `GET /api/cart` — get or create
- `POST /api/cart/[cartId]/items` — add item
- `PATCH /api/cart/[cartId]/items/[variantId]` — update quantity
- `DELETE /api/cart/[cartId]/items/[variantId]` — remove item
- `POST /api/cart/merge` — guest → authenticated merge

**Dependencies:**
- Inventory domain: reads `inventory_levels` for stock warnings
- Pricing domain: calls `calculatePricing()` on every mutation
- Coupon domain: validates coupon freshness on every summary recalculation

**Invariants:**
- Only `active` status carts are mutable
- Guest carts use `session_id` (httpOnly cookie, 256-bit entropy)
- Ownership enforced by `assertCartOwnership()` at service layer (not RLS)
- `unit_price_snapshot` captures price at item add time; divergence triggers `PRICE_CHANGED` warning

---

### Checkout Domain
**Bounded context:** Stateless orchestration layer between cart and order. Has no own tables. Validates cart freshness, recalculates pricing, and prepares the immutable pricing snapshot.

**Entry points:**
- Called internally by `/api/orders/create`
- `POST /api/coupons/validate` — preview coupon discount

**Dependencies:**
- Cart domain: receives validated cart items
- Pricing domain: `calculatePricing()` for server-authoritative pricing
- Coupon domain: `validateCoupon()` soft check
- Address domain: `checkout-address-validator.ts` for shipping address validation
- Inventory domain: `validateCart()` checks real-time stock

**Invariants:**
- Never trusts any price from the client
- `buildCheckoutSummary()` is the single entry point
- Produces `CheckoutSummary` with immutable `pricingSnapshot` for order creation

---

### Order Domain
**Bounded context:** Manages the full lifecycle of a placed order. An order is **immutable by design** — pricing, address, and line items are frozen at creation.

**Entry points:**
- `POST /api/orders/create` → calls `create_order_atomic()` RPC
- `GET /api/orders/[id]` — fetch order (RLS: customer sees own orders)
- `GET /api/admin/orders` — admin list with filters

**Dependencies:**
- Inventory domain: reserves stock on creation, releases on cancellation
- Payment domain: order status driven by payment webhook
- Coupon domain: coupon usage recorded atomically in order creation
- Address domain: `order_address_snapshots` frozen from `customer_addresses`

**Invariants:**
- All order mutations go through `order-state-machine.ts` (29 states)
- `pricing_snapshot` JSON column is never updated after creation
- `order_items[].snapshot` JSON is never updated after creation
- `create_order_atomic()` is the only valid order creation path

**State machine summary:**
```
draft → pending → pending_payment → confirmed → processing
     → packed → shipped → out_for_delivery → delivered
     → [cancellation path] → cancelled → refunded
     → [return path] → return_requested → ... → refunded
     → [replacement path] → replacement_requested → ... → replacement_delivered
```

---

### Payment Domain
**Bounded context:** Manages the interaction with payment providers and the payment lifecycle. Provider-agnostic via `IPaymentProvider` interface.

**Entry points:**
- `POST /api/payments/create-intent` — create Stripe PaymentIntent
- `POST /api/webhooks/stripe` — Stripe webhook (signature verified)

**Dependencies:**
- Order domain: updates order status on payment events
- Returns domain: issues refunds via provider on approved returns

**Providers:**
- Stripe: active, webhook-driven confirmation
- Razorpay: disabled (no webhook handler)
- COD: auto-confirms order on creation

**Invariants:**
- Payment confirmation only via webhook — never trust client
- Webhook signature verified: `stripe.webhooks.constructEvent()`
- Idempotency keys prevent duplicate charges on retry

---

### Inventory Domain
**Bounded context:** Tracks physical stock across warehouses. Inventory is a ledger (movements), not just a number.

**Entry points:**
- `PATCH /api/admin/inventory` — admin stock adjustment

**Dependencies:**
- Order domain: stock reserved on order creation, released on cancellation, committed on delivery
- Cart domain: stock checked on cart operations (no lock — soft check only)

**Invariants:**
- `available_stock = quantity - reserved` (always computed, never stored)
- **Only `inventory_levels` table is the source of truth** (legacy `inventory` table must not be used)
- Row-level locking inside `create_order_atomic()` sorted by `variant_id` (deadlock prevention)
- `checkStock()` = soft pre-flight (no lock); `SELECT FOR UPDATE` = hard lock inside transaction

---

### Pricing Domain
**Bounded context:** A pure-function calculation engine. No DB access. Called from cart, checkout, and order creation.

**Entry points:**
- Internal only: `calculatePricing(lineItems, coupon, shippingConfig, taxConfig)`

**Dependencies:**
- None (pure function — no DB, no network)
- Consumed by: Cart domain, Checkout domain, Order domain

**Invariants:**
- All monetary values rounded with `round2()` = `Math.round(n * 100) / 100`
- Tax rates, shipping thresholds, and currency come from `region-config.ts` (compile-time)
- Never called client-side for authoritative pricing (only for display estimates)

---

### Coupon Domain
**Bounded context:** Validates and applies discount coupons. Two-phase: soft validation (checkout preview) and hard validation (inside order transaction).

**Entry points:**
- `POST /api/coupons/validate` — preview
- Internal: `validateCoupon()` called by Checkout and `create_order_atomic()`

**Dependencies:**
- Order domain: coupon usage atomically recorded in order creation RPC

**Invariants:**
- Per-user usage tracked in `coupon_usage` (unique constraint `(coupon_id, user_id)`)
- Coupon re-validated inside `create_order_atomic()` transaction to prevent race conditions
- Usage increment is atomic (inside transaction)

---

### Address Domain
**Bounded context:** Customer address book + shipping address validation. Country-specific rules (postal code format, required fields, state validity).

**Entry points:**
- `POST /api/address/validate` — validate checkout address
- `GET /api/locations/[country]/regions` — regions list
- `GET /api/locations/[country]/[region]/cities` — city autocomplete
- `GET /api/addresses` — customer address book
- `POST /api/addresses` — save new address
- `PATCH /api/addresses/[id]` — update address
- `DELETE /api/addresses/[id]` — archive address (soft delete)

**Dependencies:**
- Order domain: addresses snapshotted into `order_address_snapshots` at order time
- Checkout domain: `checkout-address-validator.ts` called before order creation

**Invariants:**
- Addresses are soft-deleted (archived), never hard-deleted
- `order_address_snapshots` are immutable copies — changes to `customer_addresses` don't affect orders
- Postal code validation is country-specific (regex from `address_country_rules`)

---

### CMS Domain
**Bounded context:** Content management and delivery. Content is locale-specific (not translated). Uses inheritance: country-level content → locale-level override.

**Entry points:**
- `GET /api/cms/[country]/[lang]/pages/[slug]` — content delivery
- Admin routes: `/admin/cms/[country]/[lang]/...`

**Dependencies:**
- Localization domain: `[country]/[lang]` params from middleware headers
- Auth/RBAC domain: CMS publish requires `cms:publish` permission

**Invariants:**
- Fallback chain: `{lang}-{country}` → country default lang → 404 (never global fallback)
- Inheritance: locale content `null` = inherit from country level
- `break_inheritance` and `restore_inheritance` require explicit `cms:break_inheritance` permission
- HTML content sanitized by `sanitizeCmsHtml()` (whitelist-based, never raw HTML from DB)

---

### Localization Domain
**Bounded context:** Country and language routing, locale detection, translation files. Entirely compile-time — no DB queries.

**Entry points:**
- Middleware: enforces `/{country}/{lang}/` prefix, sets request headers
- `src/lib/i18n/locale-resolver.ts` — locale detection logic

**Dependencies:**
- None (compile-time config only)
- Consumed by: all storefront routes, CMS domain, internationalized metadata

**Invariants:**
- URL structure is `/{country}/{lang}/{path}` — always two-segment locale prefix
- Locale detection priority: URL → cookie → geo/IP → Accept-Language → default (India/English)
- Request headers set by middleware: `x-country`, `x-language`, `x-locale-id`, `x-text-direction`

---

### Auth / RBAC Domain
**Bounded context:** Identity (Supabase Auth), roles, and fine-grained permissions. Three-layer enforcement.

**Entry points:**
- Supabase Auth endpoints (managed by Supabase)
- `requireAdminPermission(code)` — server component guard
- `has_permission(p_permission_code)` — PostgreSQL RPC

**Dependencies:**
- All admin operations depend on this domain
- DB RLS policies depend on `is_admin()` and `has_permission()` functions

**Permission domains:** `catalog`, `inventory`, `orders`, `customers`, `cms` (9 sub-permissions), `analytics`

**Invariants:**
- `super_admin` bypasses all permission checks
- `admin` role requires explicit per-permission grant
- Three layers: Server Component check → Client UX gate → DB RLS (all three must hold)
- Audit log (`admin_action_logs`) written on every privileged action

---

## Domain Interaction Matrix

| From \ To | Cart | Checkout | Order | Payment | Inventory | Pricing | Coupon | Address | CMS | Auth |
|-----------|------|----------|-------|---------|-----------|---------|--------|---------|-----|------|
| **Cart** | — | reads | — | — | reads | calls | validates | — | — | reads |
| **Checkout** | reads | — | → creates | → initiates | validates | calls | validates | validates | — | — |
| **Order** | → converts | — | — | → triggers | → reserves | — | → consumes | → snapshots | — | — |
| **Payment** | — | — | → updates | — | — | — | — | — | — | — |
| **Inventory** | — | — | ← driven | — | — | — | — | — | — | — |
| **Returns** | — | — | reads | → refunds | → restocks | calls | — | — | — | — |
| **Admin** | — | — | manages | manages | manages | — | manages | — | manages | enforces |

---

## Domain Coupling Assessment

| Coupling | Type | Risk |
|----------|------|------|
| Checkout → Pricing | Clean call (pure function) | ✅ Low |
| Checkout → Inventory | Read-only soft check | ✅ Low |
| Order → Inventory | Atomic RPC (not service call) | ✅ Low |
| Cart → Pricing | Clean call (pure function) | ✅ Low |
| Payment → Order | Event-driven (webhook) | ✅ Low |
| CMS → Localization | Header injection (middleware) | ✅ Low |
| Admin → All domains | Permission-gated server components | ⚠️ Medium (cross-cutting concern) |
| Checkout → Coupon | Two-phase (soft + hard) | ✅ Intentional, safe |

**No circular dependencies detected.**

---

## Related Documents

- `docs/architecture/DEPENDENCY_GRAPH.md` — Service-level dependency detail
- `docs/database-architecture.md` — Table schema reference
- `docs/business-rules.md` — Business rules per domain
- `docs/ecommerce-domain.md` — Domain layer principles
