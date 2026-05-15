# Dependency Graph

> Service and module dependency map. Read left-to-right: left side depends on right side.

---

## Service Dependency Tree

### CartService
```
CartService (src/lib/cart/cart-service.ts)
  ├── createServiceClient()          [src/lib/supabase/service.ts]
  ├── assertCartOwnership()          [src/domain/cart/cart-ownership.ts]
  ├── cart-state-machine.ts          [src/domain/cart/]
  ├── calculatePricing()             [src/domain/pricing/pricing-engine.ts]
  │     └── getTaxConfig()           [src/lib/tax/tax-config.ts]
  │           └── region-config.ts  [src/lib/config/region-config.ts]
  ├── validateCoupon()               [src/domain/coupon/coupon-engine.ts]
  ├── checkStock()                   [src/domain/inventory/stock-guard.ts]
  └── recordCartEvent()              [writes cart_events table]
```

### CheckoutOrchestrator
```
buildCheckoutSummary() (src/domain/checkout/checkout-orchestrator.ts)
  ├── validateCart()                 [validates prices + stock, no lock]
  │     └── createServiceClient()   [src/lib/supabase/service.ts]
  ├── validateCoupon()               [src/domain/coupon/coupon-engine.ts]
  ├── getTaxConfig()                 [src/lib/tax/tax-config.ts]
  ├── calculatePricing()             [src/domain/pricing/pricing-engine.ts]
  └── checkout-address-validator.ts  [src/lib/validators/]
        └── LocationService          [src/domain/address/location-service.ts]
              └── address_country_rules, administrative_regions, cities [DB]
```

### OrderCreation (atomic)
```
POST /api/orders/create (src/app/api/orders/create/route.ts)
  ├── buildCheckoutSummary()         [CheckoutOrchestrator]
  ├── getPaymentProvider()           [src/lib/payment/payment-factory.ts]
  │     └── StripeProvider           [src/lib/payment/stripe-provider.ts]
  │           └── stripe SDK         [external]
  └── create_order_atomic()          [PostgreSQL RPC]
        ├── inventory_levels         [SELECT FOR UPDATE, sorted by variant_id]
        ├── coupons + coupon_usage   [re-validate + consume atomically]
        ├── orders                   [INSERT]
        ├── order_items              [INSERT, with snapshot JSON]
        ├── order_address_snapshots  [INSERT, frozen from customer_addresses]
        └── order_status_history     [INSERT, order_created event]
```

### PaymentWebhook
```
POST /api/webhooks/stripe (src/app/api/webhooks/stripe/route.ts)
  ├── stripe.webhooks.constructEvent() [signature verification]
  ├── idempotency_keys                 [check + insert, prevents duplicates]
  ├── transitionOrderStatus()          [src/domain/order/order-state-machine.ts]
  │     └── orders, order_status_history [DB updates]
  ├── recordPaymentEvent()             [src/domain/payment/payment-lifecycle.ts]
  └── payment_events                   [INSERT audit]
```

### AdminOrderManagement
```
GET /api/admin/orders (src/app/api/admin/orders/route.ts)
  ├── requireAdminPermission('orders:read') [src/lib/admin/permissions.ts]
  │     ├── supabase auth.uid()
  │     ├── profiles.role check
  │     └── has_permission() PostgreSQL RPC
  ├── createServerClient()           [src/lib/supabase/server.ts]
  └── orders + order_items + profiles [JOIN query]
```

### CMSDelivery
```
GET /api/cms/[country]/[lang]/pages/[slug]
  ├── x-country, x-language headers  [set by middleware]
  ├── localized_cms_pages            [DB: exact locale lookup]
  │     └── [if null] → country default lang fallback
  ├── cms_blocks                     [DB: referenced blocks]
  └── sanitizeCmsHtml()              [src/lib/cms/sanitize.ts]
        └── sanitize-html library    [whitelist-based]
```

### InventoryAdjustment
```
PATCH /api/admin/inventory (src/app/api/admin/inventory/route.ts)
  ├── requireAdminPermission('inventory:write')
  ├── adjustInventory()              [src/domain/inventory/inventory-movement.ts]
  │     ├── inventory_levels         [UPDATE: quantity]
  │     └── inventory_movements      [INSERT: audit entry]
  └── recordAdminAction()            [admin_action_logs]
```

### LocaleMiddleware
```
src/middleware.ts
  ├── resolveLocale()                [src/lib/i18n/locale-resolver.ts]
  │     ├── URL params (/{country}/{lang}/)
  │     ├── Cookies (x-locale-pref, x-country-pref, x-lang-pref)
  │     ├── Geo headers (cf-ipcountry, x-vercel-ip-country)
  │     ├── Accept-Language header
  │     └── Default: India/English
  └── Sets request headers:
        x-country, x-language, x-locale-id, x-text-direction
```

---

## Module Import Rules

```
Allowed:
  ui/        ← (no imports from other layers)
  common/    ← ui/
  ecommerce/ ← common/, ui/
  feedback/  ← ui/
  layout/    ← common/, ui/, ecommerce/
  features/  ← components/, domain/, lib/
  app/       ← features/, components/, lib/, domain/
  domain/    ← lib/supabase/, lib/errors, lib/config  (NO Next.js deps)
  lib/       ← lib/supabase/, external packages

Forbidden:
  domain/    ← features/ or app/  (domain must be pure)
  ui/        ← domain/ or lib/    (UI components must be pure)
  domain/    ← domain/ (circular) (each domain is independent)
```

---

## External Dependencies

| Service | Used For | Auth Method |
|---------|---------|------------|
| Supabase | DB + Auth + Storage | JWT (user) + Service Key (service role) |
| Stripe | Payment processing | Secret key (server) + Publishable key (client) |
| Razorpay | Payment (disabled) | API key + Secret (when re-enabled) |
| Cloudflare | Geo IP detection | `cf-ipcountry` request header |
| Vercel | Geo IP detection | `x-vercel-ip-country` request header |

---

## Dangerous Couplings (Flagged)

| Coupling | Risk | Mitigation |
|----------|------|-----------|
| `createServiceClient()` bypasses RLS | High (if misused) | Used only in service layer, never in route handlers directly |
| `create_order_atomic()` RPC is a single point | High (if RPC fails) | PostgreSQL transaction, proper error codes (P0001, P0003, P0004) |
| `CartService` builds full `CartSummary` on every mutation | Medium (performance) | Cart expires in 30 days; summary is lightweight |
| CMS HTML output | Medium (XSS) | Always passes through `sanitizeCmsHtml()` whitelist |
| Admin permission check before service call | Medium (must never be skipped) | `requireAdminPermission()` is a server component, not optional |

---

## No Circular Dependencies

Verified by codebase analysis:
- `domain/` → `lib/` (one-way only)
- `features/` → `domain/` (one-way only)
- `app/` → `features/` (one-way only)
- CMS → Localization (one-way: CMS consumes locale from headers)
- Payment → Order (one-way: payment events update order status)
- No domain imports another domain directly

---

## Related Documents

- `docs/architecture/DOMAIN_MAP.md` — Domain ownership
- `docs/architecture/API_MAP.md` — API routes
- `docs/ecommerce-domain.md` — Domain layer principles
- `docs/rls-policies.md` — Database security (RLS)
