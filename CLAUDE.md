# ShopNest — AI Agent Context

This file is read by Claude and other AI coding assistants at the start of every session.
It describes what has been built, key architectural decisions, and what to be careful about.

---

## Architecture Knowledge System

A structured knowledge graph has been built for this project. Use it to orient yourself:

| Need | Read This |
|------|-----------|
| Full system portrait | `docs/architecture/SYSTEM_OVERVIEW.md` |
| Domain boundaries & ownership | `docs/architecture/DOMAIN_MAP.md` |
| Service dependencies | `docs/architecture/DEPENDENCY_GRAPH.md` |
| All API routes | `docs/architecture/API_MAP.md` |
| Why a decision was made | `docs/ADRs/ADR-00X-*.md` |
| All entities + state machines (JSON) | `docs/knowledge-graph/entities.json` |
| All service methods (JSON) | `docs/knowledge-graph/services.json` |
| All workflow steps (JSON) | `docs/knowledge-graph/workflows.json` |
| All API routes (JSON) | `docs/knowledge-graph/APIs.json` |
| RBAC permissions (JSON) | `docs/knowledge-graph/permissions.json` |
| Complete doc index | `docs/README.md` |

**ADRs (Architecture Decision Records):**
- ADR-001: Country-first localization
- ADR-002: Order immutability via snapshots
- ADR-003: CMS inheritance model
- ADR-004: Server-side pricing (never trust client)
- ADR-005: Service-role client pattern
- ADR-006: Atomic order creation via PostgreSQL RPC
- ADR-007: Server-authoritative cart with client cache

---

---

## Mandatory Knowledge Graph Synchronization

This repository uses canonical architecture documentation and machine-readable knowledge graph files.

Claude Code and all AI coding assistants MUST keep these files in sync with the actual codebase.

### When This Rule Applies

After implementing any major change, including:

- new feature
- refactor
- API route change
- database migration
- domain service change
- cart/checkout/order/payment/inventory change
- CMS/localization/RBAC change
- admin/backoffice change
- state machine change
- permission change
- architectural decision change
- removal of legacy code

the assistant MUST update the architecture knowledge system before considering the task complete.

### Required Sync Checklist

For every major implementation, update whichever files are affected:

| Change Type | Required Updates |
|------------|------------------|
| New/changed domain entity | `docs/knowledge-graph/entities.json` + relevant domain doc |
| New/changed service or method | `docs/knowledge-graph/services.json` + `docs/architecture/DEPENDENCY_GRAPH.md` |
| New/changed workflow | `docs/knowledge-graph/workflows.json` + relevant flow/domain doc |
| New/changed API route | `docs/knowledge-graph/APIs.json` + `docs/architecture/API_MAP.md` |
| New/changed permission | `docs/knowledge-graph/permissions.json` + `docs/architecture/RBAC.md` or relevant RBAC doc |
| New/changed DB relationship | DB relationship docs + entity graph |
| New architectural decision | New ADR under `docs/ADRs/` |
| Removed/legacy feature | Remove stale docs/graph references |

### Definition of Done

A major feature is NOT complete until:

1. implementation is complete
2. tests are added/updated
3. canonical docs are updated
4. knowledge graph JSON files are updated
5. API/dependency/domain maps are updated if affected
6. ADRs are added/updated if architecture changed
7. stale or conflicting docs are removed or archived
8. documentation matches actual code

### Important Rules

- Code is the source of truth.
- Do not trust old docs if they conflict with implementation.
- Do not create duplicate architecture docs.
- Do not leave prompt-generated planning docs as active canonical docs.
- Do not update only markdown while leaving JSON knowledge graph stale.
- Do not update only JSON while leaving canonical markdown stale.
- Prefer modifying existing canonical docs over creating new overlapping docs.
- If a doc is obsolete and confusing, merge useful content into canonical docs, then delete or archive it.
- Archived docs must clearly say: `ARCHIVED — NOT CANONICAL. DO NOT USE FOR IMPLEMENTATION.`

### Required Final Response After Major Changes

At the end of every major implementation, Claude Code must report:

- code changes completed
- tests added/updated
- docs updated
- knowledge graph files updated
- ADRs added/updated if any
- stale docs removed/archived if any
- remaining risks or manual follow-ups

If no docs or knowledge graph changes were needed, explicitly explain why.

---

## Project Summary

**ShopNest** is a production-grade, full-stack ecommerce platform.

- **Stack**: Next.js 15 App Router · TypeScript strict · Supabase (PostgreSQL + RLS + Auth) · Tailwind CSS
- **Payments**: Stripe (live) · COD (live) · Razorpay (code exists but **intentionally disabled** — see below)
- **Testing**: Vitest (unit + integration) · Playwright (E2E)
- **Migrations**: `supabase/migrations/` — numbered sequentially. Push with `supabase db push`. Never edit an already-applied migration; create a new one.

---

## What Has Been Implemented (Hardening Phase)

The following production-readiness steps were completed in this order. Do not re-implement these.

### Step 1 — Data Integrity Fixes (migrations 00017, 00018)

**Inventory dual-table bug fixed.**
Two tables existed: `inventory` (legacy) and `inventory_levels` (multi-warehouse). They diverged silently.
- `inventory_levels` is now the **single source of truth**.
- `create_order_atomic` RPC locks `inventory_levels` rows with `SELECT FOR UPDATE` (deadlock-safe: ordered by `variant_id`).
- `release_inventory_reservation(p_order_id uuid)` — releases reserved stock when an order is cancelled or failed.
- `update_order_status` automatically calls `release_inventory_reservation` on `cancelled`/`failed` transitions.
- The legacy `inventory` table is retained in the DB but no longer written to.

**Key files:**
- `supabase/migrations/00017_inventory_unification.sql` — data migration + function rewrites
- `src/domain/inventory/stock-guard.ts` — reads from `inventory_levels`, joins `warehouses` for `is_active`
- `src/domain/inventory/inventory-movement.ts` — writes to `inventory_levels` via default warehouse

**Razorpay intentionally disabled.**
Razorpay is removed from the `paymentProvider` enum in the order creation API.
The `getPaymentProvider("razorpay")` call throws a user-facing error.
Do NOT re-enable until the Razorpay webhook handler is implemented.
- `src/app/api/orders/create/route.ts` — enum: `z.enum(["stripe", "cod"])`
- `src/lib/payment/index.ts` — `case "razorpay": throw new Error(...)`

**Idempotency keys for order creation.**
`POST /api/orders/create` checks the `Idempotency-Key` header. If a response for that key already exists in `idempotency_keys`, it returns the cached response immediately (prevents duplicate orders on client retry).
Uses Supabase upsert with `{ onConflict: "key", ignoreDuplicates: true }` — NOT `.onConflict().ignore()` (Supabase JS v2 does not support that chaining pattern).

---

### Step 3 — Per-Country Tax Calculation

**Tax is always calculated server-side.** Client-submitted prices and tax figures are ignored.

**How it works:**
- `src/lib/i18n/region-config.ts` — `REGION_CONFIGS` has `taxRate` + `taxLabel` for 8 countries (IN, DE, AE, GB, US, FR, SA, SG).
- `src/lib/tax/tax-service.ts` — `getTaxConfig(countryCode: string): TaxConfig` — synchronous, no DB, falls back to default `TAX_RATE` constant if country not found.
- `calculatePricing()` accepts a `TaxConfig` (optional, defaults to `TAX_RATE` constant).
- `PriceBreakdown` now includes `taxRate: number` and `taxLabel: string` — these are **required fields** (not optional).
- `TaxConfig.label` is **optional** (to not break test factories that omit it).

**Key files:**
- `src/lib/tax/tax-service.ts` — getTaxConfig()
- `src/domain/pricing/pricing-engine.ts` — calculatePricing() + calculateDiscount()
- `src/domain/pricing/types.ts` — PriceBreakdown (taxRate, taxLabel required), TaxConfig (label optional)
- `src/domain/checkout/checkout-orchestrator.ts` — accepts `countryCode?`, passes TaxConfig to calculatePricing
- `src/app/api/orders/create/route.ts` — calls getTaxConfig(shippingAddress.country)

**Do not:** hardcode `TAX_RATE` constant directly in pricing paths. Always go through `getTaxConfig()`.

---

### Step 4 — Admin API Permission Enforcement

**All admin API routes now use fine-grained RBAC instead of coarse role checks.**

Previously every admin route manually checked `profiles.role IN ('admin', 'super_admin')`. This allowed a `catalog_manager` to call the refund endpoint.

**New pattern — use this in every admin route:**
```typescript
const ctx = await requireAdminPermission(PERMISSIONS.ORDERS_MANAGE);
const { user, db } = ctx;
// ... route logic ...
await logAdminAction(ctx, request, { action: "...", entityType: "order", entityId: id });
```

**`requireAdminPermission(permission)` flow:**
1. Auth check via user client (throws `AuthError` if not logged in)
2. Coarse role check via service client (throws `ForbiddenError` if not admin/super_admin)
3. `super_admin` → bypass fine-grained check (always allowed)
4. `admin` → calls `has_permission(p_permission_code)` via **user client** (not service client — `has_permission` uses `auth.uid()` which returns NULL with service role)
5. Legacy fallback: if `has_permission` returns false AND the user has zero `user_roles` entries → allow-all (transition period for admins who predate RBAC)

**`logAdminAction(ctx, request, params)` writes to `admin_action_logs`.**
Errors are swallowed — audit failures must never break the main request.

**Key files:**
- `src/lib/admin/with-admin-permission.ts` — `requireAdminPermission()` + `logAdminAction()`
- `src/lib/admin/permissions.ts` — `PERMISSIONS` constants + `PermissionCode` type
- `src/app/api/admin/orders/[id]/status/route.ts` — ORDERS_MANAGE + audit
- `src/app/api/admin/orders/[id]/refund/route.ts` — ORDERS_MANAGE + audit
- `src/app/api/admin/orders/[id]/notes/route.ts` — GET: ORDERS_READ, POST: ORDERS_MANAGE + audit
- `src/app/api/admin/returns/[id]/route.ts` — GET: ORDERS_READ, PATCH: ORDERS_MANAGE + audit
- `src/app/api/admin/orders/[id]/fulfillment/route.ts` — GET: ORDERS_READ, POST/PATCH: ORDERS_MANAGE + audit

**Tests:** `src/tests/integration/admin-permission.test.ts` — 14 tests covering all auth/permission paths.

---

### Step 5 — Scheduled Cleanup Jobs (pg_cron)

**Two cron jobs run automatically in the database. Do not schedule them manually.**

| Job | Schedule | What it does |
|-----|----------|--------------|
| `shopnest:expire-abandoned-carts` | `0 * * * *` (hourly) | Marks carts as `expired` when `expires_at < now()` |
| `shopnest:cancel-unpaid-orders` | `*/10 * * * *` (every 10 min) | Cancels `pending_payment` orders > 30 min old and `pending` orders > 24 hours old |

**`cancel_unpaid_orders()` design:**
- Uses `FOR UPDATE SKIP LOCKED` — concurrent runs are safe, no deadlocks
- Each order in its own `BEGIN/EXCEPTION` subtransaction — one failure never aborts the batch
- Calls `release_inventory_reservation()` for every cancelled order
- `changed_by = NULL` in `order_status_history` = system-generated action
- Returns integer count of cancelled orders

**`update_order_status` state machine (IMPORTANT):**
Migration 00018 restored the full 20+ transition state machine that migration 00017 had accidentally stripped. The complete machine is now in `supabase/migrations/00018_scheduled_jobs.sql`. If you ever need to modify order status transitions, edit migration 00018's `update_order_status` function (or create 00019).

**Key files:**
- `supabase/migrations/00018_scheduled_jobs.sql` — cancel_unpaid_orders() + full update_order_status + cron scheduling
- `supabase/migrations/00012_cart_domain.sql` — expire_abandoned_carts() (original, unchanged)

**pg_cron is enabled** on the production Supabase project. Jobs are live and verified running.
Check job history: `SELECT j.jobname, r.status, r.start_time FROM cron.job_run_details r JOIN cron.job j ON j.jobid = r.jobid ORDER BY r.start_time DESC LIMIT 20;`

---

## Architecture Rules — Do Not Violate

| Rule | Why |
|------|-----|
| Never read prices from client request body | Server always fetches from `product_variants` table |
| Never use `inventory` table for reads/writes | Use `inventory_levels` only — `inventory` is legacy |
| Never call `has_permission()` via service client | It uses `auth.uid()` which returns NULL with service role |
| Never re-enable Razorpay without a webhook handler | Orders would get stuck in `pending_payment` forever |
| Never use `.onConflict().ignore()` in Supabase JS v2 | Use `upsert({ ... }, { onConflict: "key", ignoreDuplicates: true })` |
| Admin routes must use `requireAdminPermission()` | Not manual profile.role checks |
| Tax must go through `getTaxConfig(countryCode)` | Never hardcode TAX_RATE in pricing paths |
| New migrations must be sequentially numbered | `00019_`, `00020_`, etc. Never edit applied migrations |

---

## What Is NOT Yet Implemented

| Item | Notes |
|------|-------|
| **Email (Step 2)** | Order confirmation, shipping notification, return update. Resend + React Email. `RESEND_API_KEY` env var is already defined but unused. |
| **Sentry** | Error tracking. Add `@sentry/nextjs`. ~30 min task. |
| **CSP headers** | Add via `next.config.ts` headers() |
| **Redis caching** | Replace in-memory cache for CMS delivery |

---

## Testing

```bash
npm run test          # Vitest — unit + integration
npm run test:coverage # With coverage report
npm run test:e2e      # Playwright E2E
```

**Test factories** are in `src/tests/factories/index.ts` — use these, don't create ad-hoc fixtures.
`makePriceBreakdown()` includes `taxRate` and `taxLabel` — required fields as of Step 3.

---

## Database Migration Workflow

```bash
supabase db push --dry-run   # Preview what will be applied
supabase db push             # Apply pending migrations
```

Migrations are tracked in `supabase_migrations.schema_migrations`. Applied migrations cannot be rolled back automatically — write a new migration to undo.

---

## Supabase Project

- **Project ref**: `wneovifyoihnlymyvfwh`
- **Region**: West EU (Ireland)
- **Plan**: Free
- **pg_cron**: Enabled, jobs active
- **CLI**: Linked — `supabase db push` works from project root
