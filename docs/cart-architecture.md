# Cart Domain Architecture

## Overview

The cart domain is the central state machine connecting product discovery to checkout. It manages both **authenticated user carts** and **guest carts** with full server-side validation, pricing, coupon integration, and lifecycle management.

---

## Directory Structure

```
src/
  domain/cart/
    types.ts              # All DTOs and type definitions
    errors.ts             # Typed error classes (all extend AppError)
    cart-state-machine.ts # Cart lifecycle state transitions
    cart-events.ts        # Async audit event emitter
    cart-service.ts       # All cart business logic

  lib/cart/
    guest-session.ts      # Guest session cookie utilities
    resolve-identity.ts   # Extract CartIdentity from a request

  app/api/cart/
    route.ts                           # GET (get or create cart)
    merge/route.ts                     # POST (merge guest → user)
    [cartId]/
      items/route.ts                   # POST (add item)
      items/[variantId]/route.ts       # PATCH (update qty), DELETE (remove)
      clear/route.ts                   # DELETE (clear cart)
      coupon/route.ts                  # POST (apply), DELETE (remove)
      validate/route.ts                # GET (validate for checkout)

  store/cart-store.ts     # Zustand client cache (server cart + legacy UI)

supabase/migrations/
  00012_cart_domain.sql   # Schema hardening + DB functions
```

---

## Cart Lifecycle States

```
           ┌──────────────────────────────────────┐
           │              active                  │◄──────────────┐
           │  (normal shopping, can be mutated)   │               │
           └────────────────────┬─────────────────┘               │ re-activate
                                │                                  │
          ┌─────────────────────┼──────────────────────────────────┤
          │                     │                                  │
          ▼                     ▼                                  │
     abandoned              converted                          abandoned
  (idle 30+ min,          (order placed,                  (idle again after
   recoverable)            TERMINAL)                         re-activation)
          │
          │ after 7 days
          ▼
       expired  ──── deleted (TERMINAL)
          │              ▲
          └──────────────┘ only transition

   merged (after guest→user merge) ──── deleted (TERMINAL)
```

### State Transition Rules

| From | Allowed Next States |
|------|---------------------|
| `active` | `abandoned`, `expired`, `merged`, `converted`, `deleted` |
| `abandoned` | `active`, `expired`, `merged`, `converted`, `deleted` |
| `expired` | `deleted` only |
| `merged` | `deleted` only |
| `converted` | _(terminal — no transitions)_ |
| `deleted` | _(terminal — no transitions)_ |

**Only `active` carts can be mutated** (items added/removed, coupon applied).

---

## Guest Cart Security Model

Guest carts are identified by a **server-generated session token** stored in an `httpOnly` cookie:

- **Cookie name**: `guest_cart_session`
- **Token format**: Two UUID4s concatenated, stripped of hyphens → 256-bit entropy
- **Cookie flags**: `HttpOnly`, `Secure` (production), `SameSite=Lax`, `Max-Age: 30 days`
- **Never read from**: request body, URL params, or query strings
- **Only read from**: `Cookie` request header (server-side only)

### Why httpOnly?

If JavaScript could read the guest session cookie, an XSS attack could steal the cart session and enumerate cart contents (revealing products, addresses, coupon codes). `httpOnly` prevents this entirely.

### Guest → User Cart Merge

When a guest completes login:

1. Client sends `POST /api/cart/merge` (no body needed)
2. Server reads `guest_cart_session` cookie server-side
3. Calls `merge_guest_cart(guest_session_id, user_id)` PostgreSQL function
4. Items are merged with quantity capping at `CART_MAX_QUANTITY` per variant
5. If user cart has no coupon, guest coupon is carried over
6. Response sets `guest_cart_session=; Max-Age=0` to clear the guest cookie
7. Returns merged `CartSummary`

---

## API Routes

All routes follow the `withApiHandler` pattern for consistent error handling. Mutating routes are wrapped with `withRateLimit`.

| Method | Path | Description | Rate Limit |
|--------|------|-------------|------------|
| `GET` | `/api/cart` | Get or create active cart | — |
| `POST` | `/api/cart/[cartId]/items` | Add item to cart | 30/min |
| `PATCH` | `/api/cart/[cartId]/items/[variantId]` | Update item quantity (0 = remove) | — |
| `DELETE` | `/api/cart/[cartId]/items/[variantId]` | Remove item | — |
| `DELETE` | `/api/cart/[cartId]/clear` | Remove all items + coupon | — |
| `POST` | `/api/cart/[cartId]/coupon` | Apply coupon code | 10/min |
| `DELETE` | `/api/cart/[cartId]/coupon` | Remove applied coupon | — |
| `POST` | `/api/cart/merge` | Merge guest cart after login | — |
| `GET` | `/api/cart/[cartId]/validate` | Validate cart for checkout | — |

### Response Shape

All routes return `CartSummary`:

```typescript
interface CartSummary {
  id: string;
  status: CartStatus;
  currency_code: string;
  country_id: string;
  items: CartItemDetail[];
  coupon_code: string | null;
  pricing: CartPricing;       // subtotal, discount, shipping, tax, total
  warnings: CartWarning[];    // PRICE_CHANGED, LOW_STOCK, ITEM_UNAVAILABLE, etc.
  item_count: number;
  expires_at: string;
  updated_at: string;
}
```

---

## Cart Warnings

Warnings are non-blocking notifications surfaced to the customer. They do not throw errors — instead the cart is adjusted automatically and the warning describes what happened.

| Warning Type | Trigger | Action |
|---|---|---|
| `PRICE_CHANGED` | `|snapshot_price - current_price| > 0.01` | Price updated, customer informed |
| `LOW_STOCK` | `available_qty <= 5` | Informational only |
| `ITEM_UNAVAILABLE` | Product/variant deactivated | Item removed from cart |
| `QUANTITY_ADJUSTED` | Cart quantity exceeds available stock | Quantity clamped to max available |
| `COUPON_REMOVED` | Coupon expired/deactivated since last visit | Coupon cleared from cart |
| `CART_EXPIRED` | Cart `expires_at` passed | Surface to user in UI |

---

## Pricing Flow

Every cart mutation ends with `buildCartSummary()`:

```
1. Fetch cart + items from DB (single query with join)
2. For each item: fetch current variant price
   a. If |snapshot - current| > 0.01 → emit PRICE_CHANGED warning
   b. Update snapshot
3. Fetch coupon if applied
   a. If coupon invalid/expired → emit COUPON_REMOVED warning, clear coupon
4. Build LineItems[] from current prices
5. calculatePricing(lineItems, currency, country) → CartPricing
   - Applies coupon discount
   - Estimates shipping
   - Estimates tax
6. Return CartSummary
```

---

## Database Schema

Migrations: `supabase/migrations/00012_cart_domain.sql`

### Key Additions

```sql
-- One active cart per user per currency
CREATE UNIQUE INDEX ON carts(user_id, currency_code)
  WHERE status = 'active' AND user_id IS NOT NULL;

-- Cart events for audit trail
CREATE TABLE cart_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id     UUID NOT NULL REFERENCES carts(id),
  event_type  TEXT NOT NULL,
  actor_id    UUID,
  metadata    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### DB Functions

| Function | Purpose |
|---|---|
| `get_or_create_user_cart(user_id, currency, country)` | Atomic upsert — creates or returns existing active cart |
| `expire_abandoned_carts()` | Scheduled: moves carts abandoned > 7 days to `expired` |
| `merge_guest_cart(guest_session_id, user_id, max_qty)` | Merges guest items into user cart, respects qty cap |

---

## Zustand Store

`src/store/cart-store.ts` is a **client-side cache**, not the source of truth.

```
Server cart (API) ──► setServerCart(CartSummary) ──► Zustand store
                                                         │
                                                         ▼
                                              UI reads from store
                                         (itemCount, subtotal, warnings)
```

- `serverCart: CartSummary | null` — populated by `useServerCart` hook on mount
- `serverCartId: string | null` — used as the `cartId` path parameter in all API calls
- `serverCartWarnings: CartWarning[]` — surfaced in cart UI components
- Legacy `items` / `persistedItems` — still used by existing UI components during migration
- `itemCount()` and `subtotal()` prefer server cart values when available

---

## Checkout Handoff

Before redirecting to checkout:

1. Call `GET /api/cart/[cartId]/validate`
2. If `warnings` contains `PRICE_CHANGED` → show price change modal, require user acknowledgement
3. If any `ITEM_UNAVAILABLE` → show removed items list
4. If cart is empty → disable checkout button
5. On proceed → pass `cart.id` to checkout session creation endpoint

The checkout session snapshots all prices from the cart, ensuring the price shown at checkout matches what the customer sees.
