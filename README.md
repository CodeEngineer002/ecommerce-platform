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
│   ├── (storefront)/        # Customer-facing pages
│   │   ├── page.tsx         # Homepage
│   │   ├── products/        # PLP + PDP
│   │   ├── categories/      # Category pages
│   │   ├── cart/            # Cart page
│   │   ├── checkout/        # Checkout
│   │   ├── orders/          # Order history + detail
│   │   ├── profile/         # User profile
│   │   ├── wishlist/        # Wishlist
│   │   └── search/          # Search results
│   ├── (auth)/              # Login, Register, Forgot Password
│   ├── admin/               # Admin dashboard
│   │   ├── page.tsx         # Dashboard overview
│   │   ├── products/        # CRUD with image upload
│   │   ├── categories/      # Category management
│   │   ├── orders/          # Order management
│   │   ├── customers/       # Customer list
│   │   ├── inventory/       # Stock management
│   │   ├── analytics/       # Revenue + stats
│   │   └── cms/             # CMS pages editor
│   └── api/
│       ├── orders/create/   # Order creation + payment init
│       ├── auth/signout/    # Sign out handler
│       └── webhooks/stripe/ # Stripe webhook
├── components/
│   ├── ui/                  # shadcn/ui base primitives
│   ├── common/              # FormField, Pagination, StatusBadge, etc.
│   ├── ecommerce/           # ProductCard, CartDrawer, PriceDisplay, etc.
│   ├── feedback/            # EmptyState, LoadingState, ErrorState
│   └── layout/              # Navbar, Footer
├── features/
│   ├── products/            # types → service → hooks → components
│   ├── auth/                # Auth service + hooks
│   ├── orders/              # Order service + hooks
│   ├── admin/               # Admin services + hooks
│   └── cms/                 # CMS service + hooks
├── lib/
│   ├── supabase/            # client, server, middleware
│   ├── payment/             # Stripe + Razorpay abstraction
│   ├── utils.ts             # Shared utilities
│   ├── constants.ts         # App constants
│   └── validators/          # Zod schemas
├── store/
│   ├── cart-store.ts        # Zustand cart (persisted)
│   ├── wishlist-store.ts    # Zustand wishlist (persisted)
│   └── ui-store.ts          # Zustand UI state
└── types/
    ├── database.types.ts    # Supabase schema types
    └── index.ts             # App domain types
```

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

The payment layer is fully abstracted. Switch providers by changing `.env.local`:

```env
NEXT_PUBLIC_PAYMENT_PROVIDER=stripe   # or "razorpay"
```

**Stripe webhook (local):**
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

- **Feature-based folder structure** — Each feature (products, orders, auth, cms) is self-contained with its own types, service, hooks, and components.
- **Server + Client components** — Homepage and product detail pages are server-rendered for SEO; interactive parts (cart, filters) are client components.
- **Payment abstraction** — `IPaymentProvider` interface makes swapping Stripe/Razorpay a single env var change.
- **Zustand with persistence** — Cart and wishlist survive page refreshes via `persist` middleware.
- **TanStack Query** — All data fetching goes through Query with proper cache keys; optimistic updates where applicable.
- **RLS on every table** — Database access control is enforced at the Postgres level, not just in application code.
