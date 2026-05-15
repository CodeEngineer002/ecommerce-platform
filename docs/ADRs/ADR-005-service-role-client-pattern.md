# ADR-005: Service-Role Client Pattern

**Status:** Accepted  
**Date:** 2026-05-16  
**Deciders:** Architecture team  
**Supersedes:** —  
**Superseded by:** —

---

## Context

Supabase's Row Level Security (RLS) ties authorization to `auth.uid()` — the authenticated user's JWT. This works perfectly for operations performed on behalf of a logged-in user.

However, several platform operations cannot use `auth.uid()`:

1. **Guest carts** — Guest users have no `auth.uid()`. A guest's cart has a `session_id` (from a secure cookie), not a `user_id`.
2. **Order creation** — The `create_order_atomic()` RPC must modify inventory, coupons, and orders in a single transaction. These span multiple tables with conflicting RLS policies.
3. **Cart merge** — When a guest logs in, their guest cart must be merged into their authenticated cart. This requires reading both carts simultaneously.
4. **Admin operations** — An admin adjusting inventory for any product needs to bypass per-user RLS.

---

## Decision

**Domain services use `createServiceClient()` (Supabase service role, bypasses RLS). Security is enforced at the application service layer.**

**Three-client strategy:**

| Client | Auth | RLS | Used In |
|--------|------|-----|---------|
| `createServerClient()` | User JWT | ✅ Enforced | Server Components, Route Handlers (user data reads) |
| `createBrowserClient()` | User JWT | ✅ Enforced | Client Components (user-facing reads) |
| `createServiceClient()` | Service key | ❌ Bypassed | Domain services (CartService, AddressService, etc.) |

**Application-layer security in service classes:**
- `assertCartOwnership(cartId, identity)` — verifies `user_id` OR `session_id` matches
- `assertAddressOwnership(addressId, userId)` — verifies address belongs to user
- `assertOrderOwnership(orderId, userId)` — verifies order belongs to user

---

## Problem Being Solved

**Problem 1:** Guest cart operations. A guest's cart has `session_id = 'abc123'`. There is no `auth.uid()`. Supabase RLS can only check `auth.uid()`. Without service client, guest carts require either (a) disabling RLS on carts table (dangerous) or (b) no guest carts (poor UX).

**Problem 2:** Atomic order creation across tables. `create_order_atomic()` writes to `orders`, `order_items`, `order_address_snapshots`, `inventory_levels`, `coupon_usage`, and `order_status_history` in one transaction. Each table has different RLS policies. Service role bypasses all of them — the RPC itself enforces correctness.

**Problem 3:** Admin cross-user operations. An admin listing all orders needs to see all users' orders. RLS normally restricts each user to their own rows. Service client + application-layer admin check enables this.

---

## Alternatives Considered

| Alternative | Why Rejected |
|------------|-------------|
| Disable RLS on guest-accessible tables | Dangerous — any auth bypass exposes all rows |
| Store guest session in `auth.users` as anonymous | Adds complexity, Supabase anonymous auth has different behavior |
| Per-table RLS policies for session_id | Complex, fragile, hard to audit |
| Separate "guest" service with own DB user | Excessive complexity for marginal benefit |

---

## Tradeoffs

**Benefits:**
- Enables guest carts without compromising RLS on other tables
- Enables atomic operations across multiple tables
- Simplifies admin queries (no complex cross-user RLS policies needed)
- Clear separation: service layer owns security, DB RLS is a backup layer

**Costs:**
- `createServiceClient()` is powerful — if used incorrectly it bypasses all DB security
- Application-layer ownership checks must be correct and thorough
- Developers must know which operations require service client vs server client
- Code review must verify service-client usage is always paired with ownership assertion

**Mitigation:**
- `createServiceClient()` is only imported in `src/lib/` (not in `src/app/api/` route handlers)
- All service methods accept `identity: CartIdentity` or `userId: string` — ownership is always parameter-driven
- No route handler should call `createServiceClient()` directly

---

## Implementation

```typescript
// src/lib/supabase/service.ts
export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!, // Server-only env var
    { auth: { persistSession: false } }
  );
}

// Usage: src/lib/cart/cart-service.ts
class CartService {
  private db = createServiceClient(); // Bypasses RLS

  async addItem(cartId: string, variantId: string, qty: number, identity: CartIdentity) {
    await assertCartOwnership(this.db, cartId, identity); // ← Security at app layer
    // ... proceed with DB operations
  }
}
```

---

## Security Rules

1. `SUPABASE_SERVICE_ROLE_KEY` must be a **server-only** env var (not `NEXT_PUBLIC_`)
2. Never pass `createServiceClient()` to client-side code
3. Every service method using service client must call an ownership assertion before any write
4. Never create a service client in a route handler — instantiate in service class instead
5. This pattern does **not** replace DB RLS for user-facing endpoints — those still use `createServerClient()`

---

## Future Implications

- When anonymous auth (Supabase) is adopted, guest carts could migrate to JWT-based RLS — this pattern can be retired for the cart use case
- Multi-tenant additions: service client pattern scales naturally (tenant isolation at app layer)
- Auditing: all service client operations should be logged (admin actions already are via `admin_action_logs`)

---

## Related

- `docs/rls-policies.md` — Full RLS policy matrix
- `docs/admin-architecture.md` — Admin permission model
- `docs/cart-architecture.md` — Guest cart security model
