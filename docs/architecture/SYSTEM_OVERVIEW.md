# System Overview

> **Canonical entry point.** Read this first. For implementation details, follow the links to domain docs.
>
> Last updated: 2026-05-16 | Reflects migrations 00001–00018

---

## What This System Is

A **multi-country, multi-language B2C ecommerce platform** built on Next.js 15 (App Router), Supabase (PostgreSQL + Auth + Storage), and TypeScript strict mode. It is deployed as a single Next.js application serving both the storefront and the admin back-office.

**Scale targets:** 8 countries, 7 languages, 14 locales, global inventory, enterprise RBAC.

---

## Technology Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Framework | Next.js 15 (App Router) | Server Components by default |
| Database | Supabase / PostgreSQL 15 | RLS-first security model |
| Auth | Supabase Auth | JWT-based, SSR-compatible |
| State (server) | TanStack React Query | staleTime 60s, gcTime 5m |
| State (client) | Zustand | Cart drawer + user session only |
| Payments | Stripe (active), Razorpay (disabled) | Provider-agnostic interface |
| CMS | Custom (DB-backed) | Inheritance-based locale model |
| i18n | Custom (compile-time config) | 8 countries × 7 languages |
| Testing | Vitest + Playwright | 300+ unit, 30+ integration, 25+ E2E |
| Linting | ESLint + TypeScript strict | No `any` in domain code |
| Styling | Tailwind CSS + Design Tokens | RTL support via logical CSS |

---

## Application Topology

```
/
├── src/app/
│   ├── [country]/[lang]/      ← Storefront (public, locale-aware)
│   │   ├── page.tsx           ← Homepage
│   │   ├── products/          ← Product listing + detail
│   │   ├── cart/              ← Cart page
│   │   ├── checkout/          ← Checkout flow
│   │   ├── orders/            ← Order history
│   │   ├── profile/           ← User profile & addresses
│   │   ├── pages/             ← CMS-driven pages
│   │   ├── search/            ← Product search
│   │   └── categories/        ← Category listing
│   ├── admin/                 ← Back-office (RBAC, no locale prefix)
│   │   ├── products/          ← Catalog management
│   │   ├── orders/            ← Order management
│   │   ├── inventory/         ← Inventory management
│   │   ├── customers/         ← Customer management
│   │   ├── cms/               ← CMS admin (country/lang scoped)
│   │   ├── categories/        ← Category management
│   │   └── analytics/         ← Dashboard
│   ├── (auth)/                ← Auth flows (login, register, reset)
│   └── api/                   ← REST API routes (see API_MAP.md)
│
├── src/domain/                ← Pure domain logic (no Next.js deps)
│   ├── cart/                  ← Cart state machine, warnings
│   ├── checkout/              ← Checkout orchestrator
│   ├── order/                 ← Order state machine (29 states)
│   ├── payment/               ← Payment lifecycle, provider interface
│   ├── pricing/               ← Pricing engine (pure function)
│   ├── inventory/             ← Stock guard, inventory movements
│   ├── address/               ← Address validation, location service
│   ├── coupon/                ← Coupon engine
│   ├── returns/               ← Return eligibility, refund calculator
│   ├── review/                ← Review domain
│   └── shipping/              ← Shipping config
│
├── src/lib/                   ← Shared infrastructure (DB, i18n, payment, etc.)
│   ├── supabase/              ← Supabase clients (server/client/service)
│   ├── cart/                  ← CartService (server actions + API)
│   ├── cms/                   ← CMS delivery, block registry, sanitizer
│   ├── i18n/                  ← Locale config, routing, resolver
│   ├── config/                ← Region configs, query client
│   ├── admin/                 ← Admin permissions, context, audit
│   ├── payment/               ← Payment provider factory
│   ├── tax/                   ← Tax config resolver
│   └── validators/            ← Checkout address validator
│
├── src/features/              ← Feature-level UI (server + client components)
│   ├── cart/                  ← Cart UI, hooks
│   ├── checkout/              ← Checkout form, address selection
│   ├── orders/                ← Order list, detail
│   ├── products/              ← Product listing, detail, reviews
│   ├── addresses/             ← Address book management
│   ├── admin/                 ← Admin feature modules
│   ├── auth/                  ← Login/register UI
│   └── cms/                   ← CMS preview, renderer
│
└── src/components/            ← Reusable components (no business logic)
    ├── ui/                    ← Base components (Button, Input, etc.)
    ├── ecommerce/             ← Ecommerce-specific (ProductCard, etc.)
    ├── common/                ← Cross-concern (ImageWithFallback, etc.)
    ├── layout/                ← Header, Footer, Nav
    ├── cms/                   ← CMS block renderers
    ├── admin/                 ← Admin layout components
    ├── orders/                ← Order-specific components
    └── feedback/              ← Toast, skeleton, loading states
```

---

## URL Architecture

```
Storefront:   /{country}/{lang}/{path}
              e.g., /in/hi/products, /de/de/checkout, /ae/ar/cart

Admin:        /admin/{module}
              e.g., /admin/orders, /admin/cms

API:          /api/{resource}
              e.g., /api/cart, /api/orders/create, /api/webhooks/stripe
```

**Country codes** (path segment): `us`, `uk`, `de`, `fr`, `it`, `es`, `in`, `ae`
**Language codes** (path segment): `en`, `de`, `fr`, `it`, `es`, `hi`, `ar`

---

## Core Domain Model

```
[Customer] ─── places ───► [Order]
                               │
[Cart] ─── converts to ───► [Order]
  │                            │
  ├── CartItems               ├── OrderItems (snapshot)
  ├── Coupon                  ├── AddressSnapshot (immutable)
  └── Warnings                ├── PricingSnapshot (immutable)
                              └── Payment

[Product] ─── has ───► [ProductVariant]
                              │
                    [InventoryLevel] (warehouse)
                    [InventoryMovement] (audit)

[Order] ─── triggers ───► [Payment]
                              │
                    [PaymentEvent] (audit)

[Order] ─── can have ───► [Return]
                              │
                    [Refund] (via payment provider)

[Country] ─── configures ───► [CMSPage]
                                   │
                           [LocalizedCMSPage] (per country+lang)
                                   │
                           [CMSBlocks] (reusable content units)

[Country] ─── configures ───► [AddressRules]
                            ─► [RegionConfig] (tax, shipping, currency)
                            ─► [AdminRegions] (states/provinces)

[Profile] ─── has role ───► [Role]
                               │
                       [Permission] (25 codes, fine-grained)
```

---

## Critical Architecture Invariants

These rules are enforced across the entire codebase. Violating them breaks the system.

| # | Rule | Where Enforced |
|---|------|---------------|
| 1 | **Never trust client prices** — all pricing recalculated server-side | `pricing-engine.ts`, `checkout-orchestrator.ts` |
| 2 | **Never use `inventory` table** — only `inventory_levels` | `stock-guard.ts`, `inventory-movement.ts` |
| 3 | **Order creation is atomic** — single PostgreSQL RPC, never split | `create_order_atomic()` RPC |
| 4 | **Order snapshots are immutable** — pricing/address captured at order time | `pricing_snapshot` JSON column |
| 5 | **Payment confirmation via webhook only** — never trust client payment status | `/api/webhooks/stripe` |
| 6 | **Coupon re-validated inside transaction** — prevents race condition | `create_order_atomic()` |
| 7 | **Inventory locked in variantId sort order** — prevents deadlocks | `SELECT FOR UPDATE ORDER BY variant_id` |
| 8 | **Guest cart ownership enforced at service layer** — RLS cannot check session cookie | `assertCartOwnership()` in `CartService` |
| 9 | **Admin routes require explicit permission check** — no implicit roles | `requireAdminPermission()` server component |
| 10 | **Tax config always from `getTaxConfig(countryCode)`** — never hardcode | `region-config.ts` |

---

## Supabase Client Usage Rules

| Client | Purpose | Used In |
|--------|---------|---------|
| `createServerClient()` | SSR, respects RLS, uses user JWT | Server Components, Route Handlers |
| `createBrowserClient()` | CSR, respects RLS, uses user JWT | Client Components |
| `createServiceClient()` | Service role, bypasses RLS | Domain services (CartService, AddressService, etc.) |

> **Security note:** `createServiceClient()` is used when guest operations (no auth.uid()) are needed, or when cross-user operations are required. Security is enforced at the application service layer, not the DB. Never expose service client to client-side code.

---

## Data Flow: Order Placement

```
1. Customer fills cart (CartService, server-authoritative)
         │
2. Guest/session reconciliation (cart merge on login)
         │
3. Checkout: buildCheckoutSummary()
   ├── validateCart() — re-fetches prices from DB, checks stock
   ├── validateCoupon() — soft check (usage, dates, minimum order)
   ├── getTaxConfig(countryCode) — region-specific tax rates
   └── calculatePricing() — pure function, server-side
         │
4. Payment intent created (Stripe PaymentIntent → clientSecret returned)
         │
5. Customer pays via Stripe.js (client-side, PCI handled by Stripe)
         │
6. Stripe webhook → /api/webhooks/stripe
   └── create_order_atomic() PostgreSQL RPC:
       ├── Lock inventory rows (sorted by variantId)
       ├── Re-validate coupon (hard check under lock)
       ├── Deduct inventory (reserved += qty)
       ├── Create order + order_items + address_snapshots
       ├── Record coupon usage
       └── Emit order_created event
         │
7. Order status: pending_payment → confirmed
   Cart status: active → converted
```

---

## Database Migration Sequence

| Migration | Domain | Key Changes |
|-----------|--------|------------|
| 00001 | Core | Initial schema (profiles, products, orders, basic tables) |
| 00002 | Storage | Supabase storage buckets |
| 00003 | Security | Fix RLS recursion (`is_admin()` SECURITY DEFINER) |
| 00004 | Performance | Missing functions and indexes |
| 00005 | Business | Business logic functions |
| 00006 | Enterprise | Enterprise domain extensions |
| 00007 | G11N | Globalization (countries, languages, locales) |
| 00008 | Core | Enterprise core tables |
| 00009 | Catalog | Product catalog v2 (variants, images) |
| 00010 | CMS | CMS tables, media, shipping |
| 00011 | Orders | Order management (full order domain) |
| 00012 | Cart | Cart domain (carts, cart_items, cart_events) |
| 00013 | Addresses | Address domain (customer_addresses, rules) |
| 00014 | Locations | Location domain (regions, cities) |
| 00015 | CMS | CMS inheritance model |
| 00016 | Catalog | Country product scope |
| 00017 | Inventory | Inventory unification (`inventory_levels` as single source) |
| 00018 | Jobs | Scheduled jobs (pg_cron stubs) |

---

## What Is NOT Yet Implemented

From `CLAUDE.md` — tracked known gaps:

| Feature | Status | Priority |
|---------|--------|---------|
| Transactional email (order confirmation, etc.) | Not implemented | High |
| Sentry / error monitoring | Not implemented | High |
| CSP headers (Content-Security-Policy) | Planned | Medium |
| Redis caching layer | Planned | Medium |
| Razorpay webhook handler | Disabled intentionally | Low |
| Full-text product search (pg_trgm) | Stub only | Medium |
| Email notification for returns | Not implemented | Medium |

---

## Key Files Reference

| Concern | Key File |
|---------|---------|
| Region/tax/shipping config | `src/lib/config/region-config.ts` |
| Locale/country/language config | `src/lib/i18n/config.ts` |
| Pricing engine (pure function) | `src/domain/pricing/pricing-engine.ts` |
| Cart state machine | `src/domain/cart/cart-state-machine.ts` |
| Order state machine | `src/domain/order/order-state-machine.ts` |
| Checkout orchestrator | `src/domain/checkout/checkout-orchestrator.ts` |
| CartService (mutations) | `src/lib/cart/cart-service.ts` |
| Admin permissions | `src/lib/admin/permissions.ts` |
| Middleware (locale routing) | `src/middleware.ts` |
| CMS block registry | `src/lib/cms/block-registry.ts` |
| Supabase clients | `src/lib/supabase/` |
| Error types | `src/lib/errors.ts` |
| API helpers | `src/lib/api.ts` |

---

## Related Documents

- `CLAUDE.md` (root) — AI context, hardening status, architecture rules
- `docs/architecture/DOMAIN_MAP.md` — Domain boundaries
- `docs/architecture/DEPENDENCY_GRAPH.md` — Service dependencies
- `docs/architecture/API_MAP.md` — All API routes
- `docs/database-architecture.md` — Schema master doc
- `docs/business-rules.md` — Business rule reference
- `docs/production-readiness.md` — Status and roadmap
