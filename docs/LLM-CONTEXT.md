# LLM Context — Reading Order and Trusted Sources

> **For Claude Code, GitHub Copilot, Cursor, and all AI agents working in this codebase.**

This document prevents common AI mistakes by specifying which files to trust, which to skip, and what invariants must never be violated.

---

## 1. Canonical Reading Order

Read these files **first**, in order:

| Step | File | Why |
|------|------|-----|
| 1 | `CLAUDE.md` | Architecture rules, hardened invariants, critical "never do" list |
| 2 | `docs/architecture/SYSTEM_OVERVIEW.md` | Full system portrait: stack, URL structure, migrations, data flow |
| 3 | `docs/architecture/DOMAIN_MAP.md` | All 16 domains: their tables, entry points, and invariants |
| 4 | `docs/knowledge-graph/entities.json` | DB tables, DTOs, and state machines — the canonical schema reference |
| 5 | `docs/knowledge-graph/services.json` | All 14 domain services with method signatures and invariants |
| 6 | `docs/knowledge-graph/ADR-index.json` | Summaries of all 7 ADRs — check before proposing architecture changes |

For full detail on a specific domain, continue to:
- `docs/architecture/DEPENDENCY_GRAPH.md` — service dependency trees
- `docs/architecture/API_MAP.md` — all 28 routes with auth and rate limits
- `docs/knowledge-graph/workflows.json` — 8 end-to-end workflow definitions
- `docs/knowledge-graph/permissions.json` — 25 RBAC permission codes and 3 enforcement layers

---

## 2. Source of Truth Hierarchy

When files conflict, apply this order:

```
1. CLAUDE.md             ← Highest authority (hardened invariants)
2. Source code (src/)    ← Code is always current
3. Supabase migrations   ← DB schema ground truth
4. docs/architecture/    ← Canonical architecture docs (Phase 1 build)
5. docs/knowledge-graph/ ← Canonical machine-readable reference
6. docs/ADRs/            ← Architectural decisions (immutable once Accepted)
7. Other docs/           ← Domain guides (accurate but may lag code)
8. README.md             ← Developer onboarding; may not reflect all architecture
```

---

## 3. Critical Invariants — DO NOT Violate

These rules are hard constraints enforced by code, DB triggers, or RLS. Violating them breaks production.

### 3.1 Inventory
- **NEVER** read from or write to the `inventory` table — it is legacy, not the source of truth.
- **ALWAYS** use `inventory_levels` for stock operations.
- See: `CLAUDE.md` Step 1, migration `00017_inventory_unification.sql`

### 3.2 Pricing
- **NEVER** trust client-submitted prices. Recalculate server-side on every cart/checkout operation.
- **ALWAYS** call `calculatePricing()` with `variant_id + quantity`. Return the price to the client; do not read it from the client.
- See: `CLAUDE.md` Step 2, `ADR-004-server-side-pricing.md`

### 3.3 Permissions
- **NEVER** use Supabase service client to call `has_permission()`. Service role sets `auth.uid() = NULL` which causes incorrect results.
- **ALWAYS** call `has_permission()` from within an authenticated user context (regular client) or use `requireAdminPermission()`.
- See: `CLAUDE.md` Step 3, `ADR-005-service-role-client-pattern.md`

### 3.4 Payment Provider
- **NEVER** re-enable Razorpay without implementing its webhook handler and idempotency logic.
- Razorpay code exists at `src/lib/payment/providers/razorpay.ts` but the `IPaymentProvider` factory will throw if `NEXT_PUBLIC_PAYMENT_PROVIDER=razorpay` is set.
- Stripe is the only active provider.
- See: `CLAUDE.md` Step 4

### 3.5 Order Creation
- **NEVER** create orders outside the `create_order_atomic()` PostgreSQL RPC.
- All inventory reservation, coupon validation, and order insertion must be atomic.
- Error codes: `P0001` = insufficient stock, `P0003` = coupon usage limit, `P0004` = coupon reuse.
- See: `ADR-006-atomic-order-creation.md`

### 3.6 Cart Authority
- **NEVER** treat the Zustand cart store as the source of truth for prices or totals.
- The Zustand store is a **display cache** populated from server responses.
- The server recalculates and returns fresh pricing on every cart mutation.
- See: `ADR-007-cart-server-authority.md`

### 3.7 Tax
- **NEVER** hardcode a tax rate. Always call `getTaxConfig(countryCode)` which returns the rate from `region_configs`.
- See: `CLAUDE.md` Step 6, `src/lib/tax/tax-service.ts`

### 3.8 Admin Routes
- **NEVER** check `profiles.role === 'admin'` manually in admin API routes.
- **ALWAYS** call `requireAdminPermission(supabase, permissionCode)` from `src/lib/admin/permissions.ts`.
- See: `CLAUDE.md` Step 5

### 3.9 Migrations
- **NEVER** renumber or backfill migrations.
- The next migration must be `00019_`. Write forward-only migrations.
- See: `docs/architecture/SYSTEM_OVERVIEW.md` migration table

### 3.10 Supabase `.onConflict()` syntax
- **NEVER** use `.onConflict('key').ignore()` in Supabase JS v2 — this is broken.
- **ALWAYS** use `.upsert(data, { onConflict: 'key', ignoreDuplicates: true })`.

---

## 4. Stale Sections to Ignore

Some documentation files contain sections that were accurate at an earlier phase of development and have not been fully rewritten. Apply code as the override:

| File | Section to Treat with Caution | Why |
|------|------------------------------|-----|
| `docs/database-architecture.md` | Any mention of `inventory` table as active | `inventory_levels` is the current SoT (migration 00017) |
| `README.md` | Payment section (Razorpay references) | Razorpay is disabled |

> **Note:** These files have been partially updated but older surrounding context may still reference legacy patterns. Always cross-reference `CLAUDE.md` and source code.

---

## 5. What Is NOT Implemented

The following items are explicitly out of scope and should not be generated unless a new ADR approves them:

- Razorpay webhook handler (disabled, not just commented out)
- Wishlist persistence to DB (currently in-memory only if it exists)
- Product reviews submission (schema exists, UI endpoint may not)
- B2B pricing tiers (schema foundation exists, logic not implemented)
- Multi-currency (all prices are in the country's default currency only)
- External tax provider integration (using `getTaxConfig()` static DB config)

See: `docs/architecture/SYSTEM_OVERVIEW.md` → "What Is NOT Implemented"

---

## 6. Routing Architecture

URL structure is **country-first**: `/{country}/{lang}/{path}`

```
/in/hi/products       → India, Hindi
/de/de/checkout       → Germany, German
/ae/ar/cart           → UAE, Arabic (RTL layout)
/us/en/orders/123     → USA, English
```

- Country determines: pricing, tax, available products, CMS content, coupon scope
- Language determines: UI labels, CMS text, text direction (RTL for Arabic)
- `src/middleware.ts` enforces this structure on every request
- Route params: `params.country` and `params.lang` in all storefront Server Components

See: `ADR-001-country-first-localization.md`, `docs/locale-routing.md`

---

## 7. Knowledge Graph Maintenance

After any major feature addition or architecture change, update in this order:

1. Update the relevant domain doc in `docs/` (e.g., `docs/cart-architecture.md`)
2. Update `docs/knowledge-graph/entities.json` if tables changed
3. Update `docs/knowledge-graph/services.json` if a service method changed
4. Update `docs/knowledge-graph/workflows.json` if a flow changed
5. Update `docs/knowledge-graph/APIs.json` if a route was added/removed
6. Create or update an ADR in `docs/ADRs/` if an architectural decision was made
7. Update `docs/knowledge-graph/ADR-index.json` with the new ADR summary
8. Update `CLAUDE.md` if a new hard invariant was introduced

---

## 8. Documentation Governance Rules

- **Do not create duplicate documentation.** Check `docs/README.md` before creating a new doc.
- **Do not split a domain across multiple docs.** One topic = one canonical file.
- **Do not modify ADRs.** They are immutable records. Supersede with a new ADR.
- **Do not add architecture docs outside `docs/`** (except CLAUDE.md at root).
- **Do not reference the `inventory` table** as active in any documentation.
- **Trust code over docs** when they conflict — update the doc to match the code.
