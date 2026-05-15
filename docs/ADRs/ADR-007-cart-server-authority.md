# ADR-007: Server-Authoritative Cart with Client Cache

**Status:** Accepted  
**Date:** 2026-05-16  
**Deciders:** Architecture team  
**Supersedes:** —  
**Superseded by:** —

---

## Context

Cart state management in ecommerce involves a tension between:
- **Performance**: Client-side state is instant (no network roundtrip)
- **Correctness**: Server-side state is authoritative (accurate prices, stock)
- **Security**: Guest sessions need cart persistence without authentication
- **Consistency**: Cart across devices/sessions must be synchronized

The platform needed to decide whether the cart lives primarily client-side (localStorage/cookies with server sync) or server-side (DB as source of truth with client cache).

---

## Decision

**The cart is server-authoritative. The Supabase `carts` table is the single source of truth. The Zustand client store is a display cache only.**

**Architecture:**
- Every cart mutation (add, update, remove, coupon) calls an API route
- API route calls `CartService` which modifies the DB and returns `CartSummary`
- Client receives `CartSummary` and updates its Zustand `serverCart` field
- Client never calculates prices or stock independently
- Cart warnings (PRICE_CHANGED, LOW_STOCK, etc.) come from server

**Guest cart handling:**
- Guest users get a `guest_cart_session` httpOnly cookie (256-bit entropy, 30-day TTL)
- Generated via `generateGuestSessionToken()`: two UUID4s concatenated
- Cookie: httpOnly, SameSite=Lax (CSRF protection), Secure in production
- Session ID stored in `carts.session_id` column
- On login, guest cart is merged into authenticated cart via `POST /api/cart/merge`

---

## Problem Being Solved

**Problem 1 — Price accuracy:** A customer adds an item to their cart. Before checkout, the price changes. A client-side cart would show the old price. Server-authoritative cart recalculates on every access and emits a `PRICE_CHANGED` warning.

**Problem 2 — Stock accuracy:** An item sells out after being added to the cart. Client-side cart can't detect this until checkout. Server-authoritative cart checks stock on every summary fetch and emits `ITEM_UNAVAILABLE` or `QUANTITY_ADJUSTED` warnings.

**Problem 3 — Cross-device sync:** A customer adds items on mobile, then opens desktop. localStorage is device-local. DB-backed cart is available everywhere.

**Problem 4 — Guest security:** An httpOnly cookie cannot be read by JavaScript (XSS protection). The session token has 256-bit entropy (brute-force resistant). Ownership is enforced server-side via `assertCartOwnership()`.

---

## Alternatives Considered

| Alternative | Why Rejected |
|------------|-------------|
| localStorage-only cart | No cross-device sync; prices/stock stale; lost on browser clear |
| Cookie-only cart (serialized items) | Limited size; prices still client-side; no server validation |
| Optimistic updates with server sync | Complex conflict resolution; stale data window during sync |
| Real-time subscription (Supabase Realtime) | Overkill for cart; adds WebSocket connection overhead |

---

## Tradeoffs

**Benefits:**
- Price and stock always accurate (server recalculates on every operation)
- Cart persists across devices and sessions
- Guest carts are secure (httpOnly cookie, server-enforced ownership)
- Cart merge on login is straightforward (two DB rows, merge logic in service)
- Server can detect and warn about coupon invalidation, price changes, stock issues

**Costs:**
- Every cart operation requires a network request (add, update, remove)
- No instant optimistic UI without a client-side cache layer
- More complex than client-side cart for simple use cases
- `CartSummary` is rebuilt from DB on every mutation (small performance cost)

**Mitigation:**
- Zustand `serverCart` field caches the last `CartSummary` for instant UI display between operations
- Loading states shown during mutations
- React Query handles background refetch for stale data

---

## Client Store Design

```typescript
// src/store/cart-store.ts
interface CartStore {
  // Server-authoritative state
  serverCart: CartSummary | null;       // From last API response
  serverCartId: string | null;
  serverCartWarnings: CartWarning[];

  // Legacy client-side items (display only, not authoritative)
  items: CartItemWithProduct[];         // Populated from serverCart
  persistedItems: PersistedCartItem[];  // localStorage fallback for offline display

  // UI state
  isOpen: boolean;

  // Actions (all trigger API calls)
  setServerCart(cart: CartSummary): void;
  openCart(): void;
  closeCart(): void;
}
```

**Rule:** `serverCart` is always populated from a server response. Local mutations to `items` array are for display only and must never be used as authoritative data.

---

## Cart State Machine

```
active ──────────────► abandoned (inactive for N hours, still mutable)
  │                        │
  ├──► expired (TTL passed, read-only)
  ├──► merged (guest cart merged into auth cart, terminal)
  ├──► converted (order placed, terminal)
  └──► deleted (admin/user action, terminal)
```

**Invariant:** Only `active` status carts allow item mutations. All terminal states are immutable.

---

## Security Model

```
Guest cart security:
  - Cookie: name=guest_cart_session, httpOnly=true, sameSite=Lax, maxAge=30 days
  - Value: two concatenated UUID4s (256-bit entropy)
  - Ownership check: carts.session_id === cookie value
  - No auth.uid() required — ownership is session-based

Authenticated cart security:
  - Ownership check: carts.user_id === auth.uid()
  - Session cookie retired on login (after merge)
```

---

## Future Implications

- **Offline support:** If offline cart is needed, `persistedItems` array can be used as a local queue, synced on reconnect
- **Real-time price updates:** Currently warns on next cart access; could add periodic polling or WebSocket for live price change notifications
- **Wishlist:** Same server-authoritative model should be applied
- **Multi-cart (future):** Current model assumes one active cart per user; multi-cart would require significant changes to `CartService` and client store

---

## Related

- `docs/cart-architecture.md` — Full cart system documentation
- `docs/checkout-flow.md` — Cart → Checkout transition
- ADR-005: Service-Role Client Pattern (enables guest carts)
- ADR-004: Server-Side Pricing (pricing always from server, not cart state)
