# ShopNest — Production-Grade Ecommerce Platform

A complete, full-stack ecommerce platform built with Next.js 15, Supabase, TypeScript, and Tailwind CSS.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15 App Router, TypeScript strict, Tailwind CSS |
| UI Components | Custom library built on shadcn/ui + Radix UI |
| Database & Auth | Supabase (PostgreSQL + RLS + Auth) |
| File Storage | Supabase Storage |
| Client State | Zustand (cart, wishlist, UI) |
| Server State | TanStack Query v5 |
| Forms | React Hook Form + Zod |
| Payments | Stripe / Razorpay (abstracted, swappable) |
| Testing | Vitest + Playwright |
| Code Quality | ESLint, Prettier, Husky, lint-staged |

---

## Project Structure

```
src/
├── app/
│   ├── [country]/[lang]/        # Storefront (locale-aware: /in/hi/, /de/de/, /ae/ar/)
│   │   ├── page.tsx             # Homepage
│   │   ├── products/            # PLP + PDP
│   │   ├── categories/          # Category pages
│   │   ├── cart/                # Cart page
│   │   ├── checkout/            # Checkout
│   │   ├── orders/              # Order history + detail
│   │   ├── profile/             # User profile + addresses
│   │   ├── pages/               # CMS-driven pages
│   │   ├── search/              # Search results
│   │   └── categories/          # Category listing
│   ├── (auth)/                  # Login, Register, Forgot Password
│   ├── admin/                   # Admin dashboard (RBAC)
│   │   ├── page.tsx             # Dashboard overview
│   │   ├── products/            # CRUD with image upload
│   │   ├── categories/          # Category management
│   │   ├── orders/              # Order management
│   │   ├── customers/           # Customer list
│   │   ├── inventory/           # Stock management
│   │   ├── analytics/           # Revenue + stats
│   │   └── cms/                 # CMS editor (country/language scoped)
│   └── api/                     # REST API routes
├── domain/                      # Pure business logic (no Next.js deps)
│   ├── cart/, checkout/, order/, payment/, pricing/
│   ├── inventory/, address/, coupon/, returns/, review/
├── components/
│   ├── ui/                      # Base primitives (shadcn/ui + Radix UI)
│   ├── common/                  # FormField, Pagination, StatusBadge, etc.
│   ├── ecommerce/               # ProductCard, CartDrawer, PriceDisplay, etc.
│   ├── feedback/                # EmptyState, LoadingState, ErrorState
│   └── layout/                  # Navbar, Footer
├── features/                    # Feature-level UI (cart, checkout, orders, cms, auth, etc.)
├── lib/                         # Shared infrastructure (supabase, i18n, payment, admin)
├── store/                       # Zustand (cart display cache, user session)
└── types/
    ├── database.types.ts          # Supabase schema types
    └── index.ts                   # App domain types
```

> **URL structure:** `/{country}/{lang}/{path}` — e.g. `/in/hi/products`, `/de/de/checkout`, `/ae/ar/cart`
> Supports 8 countries × 7 languages = 14 locales. See `docs/globalization-architecture.md`.

---

## Quick Start

### Prerequisites

- Node.js 20+
- A [Supabase](https://supabase.com) project
- (Optional) Stripe or Razorpay account

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env.local
```

Fill in all required values in `.env.local`:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

### 3. Set up database

```bash
# Push migrations (requires Supabase CLI)
npx supabase db push

# Or run manually in Supabase SQL editor:
# supabase/migrations/00001_initial_schema.sql
# supabase/migrations/00002_storage_buckets.sql
```

### 4. Seed data

```bash
npm run db:seed
```

### 5. Start development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## Admin Access

To make a user an admin, run in Supabase SQL Editor:

```sql
update public.profiles
set role = 'admin'
where email = 'your@email.com';
```

Then visit `/admin` after signing in.

---

## Payment Setup

The payment layer uses an `IPaymentProvider` interface. **Stripe is the active provider.** Razorpay code exists but is intentionally disabled (no webhook handler — see `CLAUDE.md`).

**Stripe webhook (local):
```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

---

## Testing

```bash
# Unit tests
npm test

# Unit tests with UI
npm run test:ui

# Coverage report
npm run test:coverage

# E2E tests (requires running dev server)
npm run test:e2e
```

---

## Deployment (Vercel + Supabase)

1. Push to GitHub
2. Import repo in [Vercel](https://vercel.com)
3. Add all env vars from `.env.example` to Vercel project settings
4. Deploy — Vercel auto-detects Next.js

**Production checklist:**
- [ ] Set `NEXT_PUBLIC_APP_URL` to your production URL
- [ ] Configure Supabase Auth redirect URLs
- [ ] Set Stripe webhook to `https://yourdomain.com/api/webhooks/stripe`
- [ ] Enable Supabase email confirmations
- [ ] Review and tighten RLS policies
- [ ] Set `NODE_ENV=production`

---

## Key Design Decisions

- **Multi-country localization** — URL structure `/{country}/{lang}/{path}`. 8 countries, 7 languages, country-first business context (pricing/tax/shipping per country).
- **Feature-based folder structure** — Each feature (products, orders, auth, cms) is self-contained with its own types, service, hooks, and components.
- **Server + Client components** — Storefront pages are server-rendered for SEO; interactive parts (cart, filters) are client components.
- **Server-authoritative cart** — Cart lives in Supabase DB; Zustand is a display cache only. Every mutation hits the server and returns fresh pricing.
- **Stripe payments** — `IPaymentProvider` interface; Razorpay exists but is disabled pending webhook implementation.
- **TanStack Query** — All data fetching goes through Query with proper cache keys.
- **RLS on every table** — Database access control enforced at the PostgreSQL level, not just in application code.
- **Atomic order creation** — Single PostgreSQL RPC (`create_order_atomic`) handles inventory, coupons, and order creation in one transaction.

## Architecture Documentation

See `docs/` for the full architecture knowledge system:
- `docs/README.md` — Documentation index and reading order
- `docs/architecture/SYSTEM_OVERVIEW.md` — Full system portrait
- `docs/ADRs/` — Architecture Decision Records
- `CLAUDE.md` — AI agent context and hardening status
