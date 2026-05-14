# Production Readiness

## Status: Hardened for Production

This document describes the production-readiness profile of the ShopNest ecommerce platform and tracks each hardening concern.

---

## Architecture Overview

| Layer | Technology | Notes |
|-------|-----------|-------|
| Frontend | Next.js 15 (App Router, RSC) | Server + client components, ISR-ready |
| Database | Supabase (PostgreSQL) | RLS on all user-facing tables |
| Auth | Supabase Auth | JWT + session refresh via middleware |
| Payments | Stripe / Razorpay / COD | Provider abstraction, webhook verification |
| Localization | 8 countries, 7 languages | Middleware-level routing, fallback chain |
| CMS | Custom block-based page builder | Draft/publish, versioning, media management |
| State | Zustand (client) + React Query (server) | Persisted cart, hydration-safe |
| Observability | Custom structured logger | Correlation IDs, PII scrubbing |

---

## Security Hardening

### Authentication
- ✅ Supabase session refresh on every request (middleware)
- ✅ `server-only` guards on all service-role modules
- ✅ Service role key never exposed to client bundles (`env.server.ts`)
- ✅ JWT validated by Supabase before any DB operation

### Authorization (RBAC)
- ✅ Database-level RLS on all tables
- ✅ Application-level permission checks via `PERMISSIONS` constants
- ✅ Admin context reads permissions from DB on each session load
- ✅ CMS publish/edit/preview are separate permission codes

### API Security
- ✅ `withApiHandler` — consistent error handling, no raw error leakage
- ✅ Zod validation on all API request bodies
- ✅ Stripe webhook signature verification (`stripe.webhooks.constructEvent`)
- ✅ Webhook idempotency via `idempotency_keys` table
- ✅ Server-side price authority — client-submitted prices ignored
- ✅ Coupon validation happens server-side only

### Sensitive Data
- ✅ No sensitive env vars in client bundle (`NEXT_PUBLIC_*` only for public config)
- ✅ Logger scrubs PII fields: `password`, `token`, `secret`, `apiKey`, `credit_card`, etc.
- ✅ `sanitize-html` applied to all CMS HTML output before render

### Missing / Planned
- ⬜ Content Security Policy headers (add via `next.config.ts` headers)
- ⬜ Rate limiting on API routes (Upstash Redis or Vercel middleware)
- ⬜ CSRF protection review for server actions
- ⬜ File upload MIME type validation on media uploads

---

## Observability

### Structured Logging (`src/lib/logger.ts`)
- **Channels**: `app`, `audit`, `payment`, `cms`, `order`, `inventory`
- **Correlation IDs**: Injected in middleware, propagated to all handlers
- **PII Scrubbing**: Automatic for all known sensitive field names
- **Audit Log**: Separate channel for admin actions, CMS publishing, payment events
- **Production**: JSON output (ingest to Datadog/Papertrail/CloudWatch)
- **Development**: Human-readable prefixed format

### Planned Integrations
- [ ] Sentry for error tracking (add `@sentry/nextjs`)
- [ ] Datadog APM for request tracing
- [ ] Supabase audit log table for RLS-level events

---

## Testing

| Category | Count | Coverage |
|----------|-------|---------|
| Unit tests | 350+ | Domain logic, utilities, CMS, i18n, RBAC |
| Integration tests | 30+ | Checkout flow, RBAC enforcement, CMS delivery |
| E2E tests (Playwright) | 25+ | Storefront, auth, checkout, admin guards |

### Key Test Factories
Located in `src/tests/factories/index.ts`:
- `makeLineItem`, `makeLineItems` — pricing tests
- `makePercentageCoupon`, `makeFixedCoupon` — coupon tests
- `makeRefundInput`, `makeReturnItem` — refund tests
- `makeCartItemWithProduct` — cart store tests

### Test Infrastructure
- **Vitest** for unit + integration tests
- **Playwright** for E2E tests
- **E2E excluded from Vitest** (separate runner)
- **State reset** in `beforeEach` for all stateful store tests

---

## Performance

### Rendering Strategy
- Server Components (RSC) for all data-fetching paths
- Client Components only where browser APIs or interactivity required
- `"use client"` boundary at leaf components (cart drawer, checkout form)

### Caching Strategy
- Route-level caching via Next.js `cache` + `revalidate`
- CMS pages: ISR with `revalidatePath` on publish events
- Product pages: tag-based revalidation on catalog updates
- Locale-aware: cache keys include `{country}/{lang}` prefix

### Bundle Optimization
- Admin routes split from storefront (separate layout trees)
- Dynamic imports for admin tables and CMS editor
- Images: Next.js Image component with lazy loading

### Database
- All frequently-queried columns indexed (see `00004_missing_functions_and_indexes.sql`)
- RLS policies designed to not cause recursive joins (see `00003_fix_rls_recursion.sql`)
- `create_order_atomic` DB function for transactional order creation

---

## Scalability

### Multi-Region Readiness
- All locale config is compile-time (`src/lib/i18n/config.ts`) — no DB calls in middleware
- Middleware is Edge-compatible (pure JS, no Node.js APIs)
- Supabase can be deployed regionally or replaced with Neon/PlanetScale

### High-Traffic Patterns
- Stateless API handlers — horizontally scalable
- Cart persisted in localStorage (no session server needed)
- Auth via JWT — no session store required

### Inventory
- `create_order_atomic` uses DB-level row locking to prevent oversell
- Pre-flight `checkStock` provides fast early rejection
- Separate `reserved` column prevents race conditions

---

## Deployment Guide

### Environment Variables

**Required (all environments)**:
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

**Required for payments**:
```
STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

**Optional**:
```
RAZORPAY_KEY_SECRET=
RESEND_API_KEY=
NEXT_PUBLIC_APP_URL=https://your-domain.com
NEXT_PUBLIC_APP_NAME=ShopNest
```

### Pre-Deploy Checklist
- [ ] All environment variables set in deployment platform
- [ ] Supabase migrations applied (`supabase db push`)
- [ ] Seed data loaded for test environments (`npm run db:seed`)
- [ ] Stripe webhook endpoint registered with correct events
- [ ] `NEXT_PUBLIC_APP_URL` set to production domain (affects hreflang/sitemap)
- [ ] CSP headers configured in `next.config.ts`

### Database Migration Safety
- Migrations are numbered and sequential (`00001_` → `00010_`)
- Never edit existing migration files — create a new one
- Test migrations locally: `supabase db reset && supabase db push`
- CI validates naming convention and no duplicate numbers

---

## Known Limitations / Future Work

| Item | Priority | Notes |
|------|----------|-------|
| CSP headers | High | Add via `next.config.ts` headers() |
| Rate limiting | High | Upstash Redis on `/api/*` routes |
| Redis caching | Medium | Replace in-memory for CMS delivery cache |
| Search engine | Medium | Algolia/Meilisearch abstraction layer |
| Real-time inventory | Medium | Supabase Realtime for stock updates |
| Audit log table | Low | Persist audit events to DB for compliance |
| Multi-vendor marketplace | Future | Domain extension point defined |
