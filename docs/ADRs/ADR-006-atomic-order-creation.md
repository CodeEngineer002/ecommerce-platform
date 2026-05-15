# ADR-006: Atomic Order Creation via PostgreSQL RPC

**Status:** Accepted  
**Date:** 2026-05-16  
**Deciders:** Architecture team  
**Supersedes:** —  
**Superseded by:** —

---

## Context

Creating an order involves 7 operations that must all succeed or all fail:

1. Lock inventory rows for purchased variants
2. Validate coupon usage limits (re-check under lock)
3. Reserve inventory (`reserved += quantity` per variant)
4. Generate unique order number
5. Create `orders` row
6. Create `order_items` rows (with price snapshot)
7. Create `order_address_snapshots` rows
8. Record `coupon_usage` (increment `coupons.used_count`)
9. Insert `order_status_history` entry

If any step fails (e.g., stock runs out after validation, coupon just used by another user), all preceding steps must roll back.

---

## Decision

**All order creation logic is encapsulated in a single PostgreSQL stored function (`create_order_atomic()`) executed as a single transaction.**

The application layer:
1. Validates and builds a `CheckoutSummary` (pre-flight, no locks)
2. Calls `create_order_atomic()` RPC with the checkout data
3. Receives `order_id` or a specific error code
4. Never does partial order creation in application code

---

## Problem Being Solved

**Race condition 1 — Overselling:**
Without locking, two customers can both see "5 items in stock", both pass validation, and both place orders — resulting in -5 actual inventory.

With `SELECT FOR UPDATE` in sorted variantId order, only one transaction can hold the lock. The second waits, then re-checks stock and fails cleanly.

**Race condition 2 — Coupon abuse:**
Two customers simultaneously apply the last use of a 100-use coupon. Without atomic consumption, both could succeed.

With re-validation inside the transaction + `UNIQUE(coupon_id, user_id)` constraint + `used_count` increment under lock, only one succeeds.

**Deadlock prevention:**
Acquiring row locks in random order can cause deadlocks (A locks variant 1, B locks variant 2; A waits for variant 2, B waits for variant 1).

The RPC sorts all variant_ids and acquires locks in that order — all transactions see variants in the same order, preventing circular wait.

---

## Alternatives Considered

| Alternative | Why Rejected |
|------------|-------------|
| Application-level transaction (Supabase JS) | Supabase JS does not support multi-statement transactions via REST API |
| Optimistic concurrency (retry on conflict) | Doesn't prevent inventory oversell; retry logic is complex and fragile |
| Queue-based order processing (async) | Adds latency; customer doesn't get immediate confirmation |
| Saga pattern (distributed transactions) | Massive complexity for a single-DB system; rollback logic is fragile |
| Separate service for each step, manual rollback | Error-prone; application code must know DB internals to compensate |

---

## Tradeoffs

**Benefits:**
- Single unit of atomicity — order creation is always complete or nothing
- Oversell prevention guaranteed by DB-level locking
- Coupon race conditions eliminated by re-validation under lock
- Clean error codes (P0001: stock, P0003: coupon limit, P0004: coupon reuse)
- Application code stays simple — just one RPC call

**Costs:**
- Business logic in PostgreSQL is harder to test in isolation (requires DB test environment)
- Stored function must be maintained alongside application code
- Schema changes require updating both the function and application DTOs
- Long-held row locks during the RPC (typically < 100ms) increase DB connection time
- Debugging requires PostgreSQL logs + application logs correlation

**Mitigation:**
- Tests use a real Supabase instance for integration tests of order creation
- Migration `00011_order_management.sql` contains the function — versioned with schema
- Lock duration is minimized by pre-validating in application layer before calling RPC

---

## Error Codes

| Code | Meaning | Application Response |
|------|---------|---------------------|
| P0001 | Insufficient stock for one or more variants | Return 409, show which items have stock issues |
| P0003 | Coupon usage limit exceeded | Return 409, remove coupon, show message |
| P0004 | Coupon already used by this user | Return 409, remove coupon, show message |

---

## Implementation

```sql
-- supabase/migrations/00011_order_management.sql
CREATE OR REPLACE FUNCTION create_order_atomic(
  p_user_id UUID,
  p_checkout_data JSONB,
  p_address_data JSONB
) RETURNS JSONB AS $$
DECLARE
  v_order_id UUID;
  v_order_number TEXT;
  v_variant_ids UUID[];
BEGIN
  -- 1. Extract variant IDs
  SELECT ARRAY(SELECT (item->>'variant_id')::UUID FROM jsonb_array_elements(p_checkout_data->'items') item)
  INTO v_variant_ids;

  -- 2. Lock inventory rows in sorted order (deadlock prevention)
  PERFORM * FROM inventory_levels
  WHERE variant_id = ANY(v_variant_ids)
  ORDER BY variant_id
  FOR UPDATE;

  -- 3. Validate stock sufficiency (under lock)
  -- ... raise exception 'P0001' if any variant has insufficient stock

  -- 4. Re-validate coupon (under lock)
  -- ... raise exception 'P0003' or 'P0004' if coupon invalid

  -- 5. Reserve inventory
  UPDATE inventory_levels SET reserved = reserved + qty WHERE variant_id = ...;

  -- 6. Create order
  INSERT INTO orders (...) VALUES (...) RETURNING id INTO v_order_id;

  -- 7. Create order items (with snapshot)
  INSERT INTO order_items (...) ...;

  -- 8. Create address snapshots
  INSERT INTO order_address_snapshots (...) ...;

  -- 9. Record coupon usage
  INSERT INTO coupon_usage (...) ...;
  UPDATE coupons SET used_count = used_count + 1 WHERE id = ...;

  -- 10. Record status history
  INSERT INTO order_status_history (...) ...;

  RETURN jsonb_build_object('order_id', v_order_id, 'order_number', v_order_number);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

## Future Implications

- When adding new order creation side effects (e.g., trigger email, update loyalty points), evaluate whether to add to the RPC (DB-level) or handle in application layer post-RPC
- Multi-warehouse inventory allocation: add warehouse selection logic inside the RPC (still atomic)
- Order splitting (separate orders per warehouse): requires multiple RPC calls or a higher-level saga — current design does not support splitting

---

## Related

- `docs/order-lifecycle.md` — Order state machine
- `docs/inventory-management.md` — Inventory locking strategy
- ADR-002: Order Immutability (what the RPC captures as snapshots)
- ADR-004: Server-Side Pricing (pricing snapshot passed to RPC)
