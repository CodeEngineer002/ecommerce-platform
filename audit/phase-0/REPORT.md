# Phase 0 — Foundation Audit Report

**Project:** ShopNest ecommerce (`ecommerce-platform` Supabase project, ref `wneovifyoihnlymyvfwh`, region eu-west-1)
**Audit date:** 2026-05-23
**Method:** `supabase db query --linked` (Management API, runs as `postgres` superuser, bypasses RLS — gives true counts)
**Scope:** Data state only. No schema changes.

---

## TL;DR

| # | Finding | Severity | Status |
|---|---|---|---|
| F1 | 3 orders frozen in `confirmed` for **96–151 hours** — `auto_queue_confirmed_orders` cron NOT running on this deployment | **P0** | Open |
| F2 | `idempotency_keys` has RLS **disabled** and full grants to `anon`+`authenticated` — table is wide-open to any web visitor | **P0** | Open |
| F3 | `order_events` INSERT policy is `WITH CHECK true` — any authenticated user can poison the audit log of any order | **P1** | Open |
| F4 | 2 historical orders missing `inventory_movements` audit rows (1 cancelled, 1 replacement-delivered) — `inventory_levels` data is consistent so no stock loss, only audit-trail gaps | **P2** | Open |
| F5 | Inventory invariants PASS: no negative `quantity`/`reserved`, no over-reservation, no orphaned reservations | ✅ Healthy | — |
| F6 | RLS correctly enabled on every other order-domain table; customers cannot UPDATE orders/payments via PostgREST | ✅ Healthy | — |
| F7 | Single warehouse in DB → multi-warehouse concern (audit item M8) is moot until a 2nd warehouse is added | Info | — |

Two of these (F1, F2) are **P0 blockers that change the production-readiness story significantly**. They were not visible from code reading alone — only data inspection caught them.

---

## Findings

### F1 — Automation backbone is dead (P0)

3 orders sitting in `confirmed` state for 4–6 days without progressing. `vercel.json` schedules `auto_queue_confirmed_orders` every 5 min with a 2-min grace window; expected lag ≤ 7 min. Observed lag: **96.4 → 150.8 hours**.

```
order_number          | status    | hours_since_update | outbound_fulfillments
----------------------+-----------+--------------------+----------------------
ORD-20260516-92660D   | confirmed | 150.79             | 0
ORD-20260517-D6FF0D   | confirmed | 121.49             | 0
ORD-20260518-DA7504   | confirmed | 96.41              | 0
```

**What this means:** the COD happy-path which everything else (shipment, COD collection, delivery) depends on is broken. Customers placed orders, got the confirmation email, but admin sees them parked in `confirmed` — no fulfillment row, no tracking number, no cron heartbeat.

**Possible root causes (need to verify):**
1. Vercel project deployed but crons not enabled (free tier or `--prod` not used)
2. `CRON_SECRET` env var mismatch between Vercel and the job route — every cron fires but every job returns 401
3. Edge runtime / route handler error preventing the RPC call
4. RPC `auto_queue_confirmed_orders` raising an error and the job swallowing it

**Action to confirm root cause:**
- Check Vercel project → Cron Logs for the 5 routes
- Check route logs for 401/500 on `/api/jobs/auto-queue-orders` over last 7 days
- Run RPC manually: `SELECT public.auto_queue_confirmed_orders();` — should return a count > 0 today

**Recovery (when root cause fixed):** the 3 stuck orders will be auto-queued on the next successful cron run. No manual action needed beyond that.

### F2 — `idempotency_keys` is publicly exposed (P0)

```
table_name        | rls_enabled
------------------+------------
idempotency_keys  | false       ← only table in entire order domain with RLS off
```

Grants (`information_schema.role_table_grants`):

```
grantee       | privileges
--------------+--------------------------------------------------------
anon          | SELECT INSERT UPDATE DELETE TRUNCATE TRIGGER REFERENCES
authenticated | SELECT INSERT UPDATE DELETE TRUNCATE TRIGGER REFERENCES
service_role  | SELECT INSERT UPDATE DELETE TRUNCATE TRIGGER REFERENCES
```

**Exploit paths:**
- **Read all idempotency keys** → reveals order IDs + cached response payloads
- **UPDATE cached response** → poison a legit retry so the customer's second-tap returns a fake order confirmation (or hides a real one)
- **DELETE / TRUNCATE** → wipe the idempotency cache so retries create duplicate orders + duplicate inventory reservations
- All of the above accessible to anon (no auth needed) via `https://<project>.supabase.co/rest/v1/idempotency_keys`

**Why this is P0:** the idempotency mechanism is the only thing preventing duplicate orders on network retry. Removing it = network retries spawn duplicate orders = duplicate inventory holds = customer charged twice (when real payments come in).

**Fix direction** (Phase 1):
1. Enable RLS: `ALTER TABLE idempotency_keys ENABLE ROW LEVEL SECURITY;`
2. REVOKE all from anon + authenticated; only service_role should touch this table.
3. Optionally: scope policy so a user can SELECT only rows they own (`user_id = auth.uid()`), but easier to keep service-role-only.

### F3 — `order_events` audit log can be poisoned (P1)

```
table         | policy_name                | command | with_check
--------------+----------------------------+---------+-----------
order_events  | System insert order events | INSERT  | true       ← any authenticated user
order_events  | Admins manage order events | ALL     | is_admin()
order_events  | Users view own order events| SELECT  | (own order)
```

`WITH CHECK true` on INSERT + INSERT grant to `authenticated` means:

> Any logged-in user can call `POST /rest/v1/order_events` with an arbitrary `order_id` and `event_type`, and the row will be accepted.

**Exploit paths:**
- Fake "delivery confirmed" or "refund processed" events on someone else's order to confuse admin timeline
- Insert massive volume of fake events to DoS the admin order-detail page
- Insert events with malicious metadata that gets rendered downstream

**Why P1 (not P0):** doesn't directly produce financial loss because real state lives in `orders.status` and `payments.status`, which the user cannot mutate. But audit integrity is gone, which is a regulatory + ops nightmare in COD where cash-trail proof matters.

**Fix direction (Phase 1):**
- Change to `WITH CHECK (auth.role() = 'service_role')` so only the server can insert via service role
- Or `WITH CHECK (auth.uid() = actor_id AND actor_type = 'customer' AND EXISTS (own order))` if customers genuinely need to write events

### F4 — Audit-trail gaps for 2 historical orders (P2)

Two orders have inventory movements missing from `inventory_movements`. **`inventory_levels` data is consistent** — `reserved` columns match active orders, no negative values — so no stock was lost. Only the audit/movement log is incomplete.

| order_id | order_number | order_type | status | total | variant_id | gap |
|---|---|---|---|---|---|---|
| `947f58c7-…` | ORD-20260515-960734 | purchase | cancelled | 10,618.82 | `5bd32f5b-…` | No `adjustment` row for release |
| `96d15822-…` | ORD-20260518-7D2816 | replacement | delivered | 0.00 (child) | `5bd32f5b-…` | No `sale` row for commit |

Order 1 is the **real cancellation pattern** (a `00041`-era cancel where the inventory_movements insert failed but the reserved counter still got decremented — or, the cancel happened before `00043`'s insert path was wired). Order 2 is a **replacement order** (`order_type='replacement'`, `total=0`, has parent) where the delivery path didn't write a `sale` movement — replacement-order delivery may not be wired to `commit_inventory_for_order` (need code verification).

**Why P2 not P0:** stock is correct today; only the movement journal is missing entries. Fix is to backfill 2 `inventory_movements` rows with `note='reconciliation: phase-0-audit-2026-05-23'`. Trivial.

But also: **investigate whether `commit_inventory_for_order` and `release_inventory_reservation` are actually called for replacement-order deliveries** — if not, all future replacement deliveries will silently skip the audit log. This is more important than backfilling the 2 historical rows.

### F5 — Inventory invariants healthy (✅)

```
issue                                | n
-------------------------------------+---
reserved_negative                    | 0
quantity_negative                    | 0
reserved_gt_quantity                 | 0
reserved_orphaned (no active order)  | 0
```

No data corruption from the `00041`/`00038`-era bugs. The `00043`/`00044` fixes appear to have caught up before any visible damage occurred (or the dataset is small enough that none happened). The CHECK constraints proposed in Phase 1.2 will lock this in at the DB level.

### F6 — RLS otherwise correctly configured (✅)

Every order-domain table except `idempotency_keys` has RLS enabled. Customer policies are scoped to `auth.uid() = user_id` (orders) or join-based ownership for child tables (`order_items`, `payments`, `refunds`, etc.). Admin policies use `is_admin()` USING + WITH CHECK.

**Customer cannot UPDATE/DELETE any order or payment** via PostgREST — no UPDATE policy exists for non-admins. Confirmed via policy dump (`audit/phase-0/results/02b_rls_policies.txt`).

Service-role-only tables: `payment_events`, `tracking_events` — correctly scoped (`auth.role() = 'service_role'`).

### F7 — Single warehouse (info, not a finding)

```
warehouse_id                         | inventory_levels rows
-------------------------------------+-----------------------
6e9f4427-7bda-41d6-9a11-2cbadae289a2 | 153 (= number of variants × 1)
```

Original audit item M8 (multi-warehouse reservation silently ignoring other warehouses) is **inert until a 2nd warehouse is created**. Decision deferred.

---

## Updated Risk Picture (vs main audit)

Item U1/U2 in the main audit speculated about historical inventory drift. **Drift exists but only as missing audit rows, not as stock corruption.** Down-rate U1/U2 from P0 → P2.

Item M7 (admin marks delivered without fulfillment) — **no historical occurrence found** (0 rows in `01b3_delivered_no_fulfillment`). The DB guard proposed in Phase 1.3 is still needed (it's a future-proofing guard), but it's not an active incident.

Two NEW P0s surfaced that were invisible from code review:
- **F1 — automation backbone dead.** Without this, COD ops cannot proceed past `confirmed`. Has to be fixed before Phase 1.
- **F2 — idempotency_keys wide open.** A real exploit path. Has to be fixed before Phase 1 also.

---

## Updated Phase 1 Plan (P0 reshuffle)

The original Phase 1 had: data reconciliation, CHECK constraints, "delivered without fulfillment" guard, refund-without-collection block, idempotent commit. Updated order:

| Step | Original priority | New priority | Reason |
|---|---|---|---|
| **Diagnose + fix cron auth/auth — restore automation** | — | **Step 1.0 (P0)** | F1 |
| **Lock down `idempotency_keys` (RLS + REVOKE)** | — | **Step 1.0a (P0)** | F2 |
| **Tighten `order_events` INSERT policy** | — | **Step 1.0b (P1)** | F3 |
| Inventory reconciliation script | P0 | **P2, can skip — only backfill 2 rows + verify replacement-delivery path** | F4, F5 |
| DB CHECK constraints (`quantity >= 0`, `reserved >= 0`, `reserved <= quantity`) | P1 | P1 | F5 (preserves healthy state) |
| Guard "delivered without fulfillment" | P0 | P1 (no live incidents) | F7 |
| Block refund on uncollected COD | P1 | P1 | unchanged |
| Idempotent `commit_inventory_for_order` | P1 | P1 | unchanged + investigate replacement-delivery path (from F4) |

**Net effect:** Phase 1 now starts with three security/ops fixes (1.0, 1.0a, 1.0b), not data reconciliation. Time impact: minimal — these are 1-day fixes each.

---

## Files Generated

```
audit/phase-0/
├── REPORT.md                                  ← this file
├── queries/
│   ├── 00_baseline.sql
│   ├── 01_inventory_drift.sql                 ← exact counts
│   ├── 01b1_inv_invariants.sql                ← passed
│   ├── 01b2_orders_no_payment.sql             ← 1 row (replacement, by design)
│   ├── 01b3_delivered_no_fulfillment.sql      ← 0 rows
│   ├── 01b4_delivered_no_commit.sql           ← 1 row (replacement)
│   ├── 01b5_cancelled_no_release.sql          ← 1 row (real cancel)
│   ├── 02a_rls_enabled.sql                    ← idempotency_keys OFF
│   ├── 02b_rls_policies.sql                   ← full policy dump
│   ├── 02c_rls_gaps.sql                       ← gap classification
│   ├── 02d_grants.sql                         ← grant table for suspicious 2
│   ├── 03_stuck_orders.sql                    ← 3 confirmed + 1 replacement_delivered
│   ├── 04_verify_drift_orders.sql             ← order details
│   └── 05_variant_5bd32f5b.sql                ← affected variant's movements
└── results/
    └── (matching .txt files with table output)
```

---

## Three Decisions Needed Before Phase 1 Starts

1. **Cron platform** — is this Supabase project served by Vercel cron, Supabase pg_cron, or external cron? Need to know to debug F1. Suspicion: Vercel cron not actually firing.
2. **`idempotency_keys` ownership column** — current schema not inspected for `user_id` field. If absent, we can only enable RLS + revoke — no per-user scoping possible. (That's still fine; service-role-only is enough.)
3. **Replacement order delivery semantics** — should a replacement order delivery decrement physical stock? Probably yes (warehouse parts with the unit). Today it apparently doesn't (F4). Confirm intended behavior before fixing.

Bata kya start kare next — F1 cron diagnostic, F2 idempotency lockdown, ya F3 order_events tighten?
