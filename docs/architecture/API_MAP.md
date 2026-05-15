# API Map

> Complete inventory of all API routes. Grouped by domain. Each entry shows method, auth requirement, rate-limited status, and ownership.

---

## Legend

| Symbol | Meaning |
|--------|---------|
| 🔓 | Public (no auth required) |
| 🔐 | Authenticated (Supabase JWT required) |
| 🛡️ | Admin + specific permission required |
| ⚡ | Rate-limited |
| 🔗 | Webhook (verified by signature) |

---

## Cart API

| Method | Route | Auth | Rate | Purpose |
|--------|-------|------|------|---------|
| GET | `/api/cart` | 🔓 | ⚡ | Get or create cart (sets guest session cookie if new) |
| DELETE | `/api/cart/[cartId]` | 🔓 | — | Abandon/delete cart |
| POST | `/api/cart/[cartId]/items` | 🔓 | ⚡ | Add item to cart |
| PATCH | `/api/cart/[cartId]/items/[variantId]` | 🔓 | ⚡ | Update item quantity |
| DELETE | `/api/cart/[cartId]/items/[variantId]` | 🔓 | — | Remove item |
| POST | `/api/cart/merge` | 🔐 | — | Merge guest cart into authenticated cart on login |

**Notes:**
- Cart ownership verified by `assertCartOwnership()` (checks `user_id` or `session_id` cookie)
- Guest carts use `guest_cart_session` httpOnly cookie (256-bit entropy, 30-day TTL)
- All cart mutations return full `CartSummary` with warnings

---

## Order API

| Method | Route | Auth | Rate | Purpose |
|--------|-------|------|------|---------|
| POST | `/api/orders/create` | 🔐 | ⚡ | Create order (calls `create_order_atomic()` RPC) |
| GET | `/api/orders/[id]` | 🔐 | — | Fetch order by ID (RLS: own orders only) |
| GET | `/api/orders` | 🔐 | — | List customer's orders |

**Request schema for POST `/api/orders/create`:**
```json
{
  "cartItems": [{ "variant_id": "uuid", "quantity": 1 }],
  "shippingAddress": { /* AddressSchema */ },
  "billingAddress": { /* AddressSchema, optional */ },
  "couponCode": "SAVE20",
  "paymentProvider": "stripe | cod",
  "notes": "Leave at door"
}
```

---

## Payment API

| Method | Route | Auth | Rate | Purpose |
|--------|-------|------|------|---------|
| POST | `/api/payments/create-intent` | 🔐 | ⚡ | Create Stripe PaymentIntent, returns `clientSecret` |
| POST | `/api/webhooks/stripe` | 🔗 | — | Stripe webhook (HMAC-SHA256 signature verified) |

**Notes:**
- `clientSecret` is returned to client; actual charge happens client-side via Stripe.js
- Order status transitions to `confirmed` only via webhook — never via client confirmation
- Idempotency keys stored in `idempotency_keys` table to prevent duplicate charges

---

## Address API

| Method | Route | Auth | Rate | Purpose |
|--------|-------|------|------|---------|
| POST | `/api/address/validate` | 🔓 | ⚡ | Validate address for checkout (country rules, region, postal code) |
| GET | `/api/addresses` | 🔐 | — | List customer's saved addresses |
| POST | `/api/addresses` | 🔐 | — | Save new address to address book |
| PATCH | `/api/addresses/[id]` | 🔐 | — | Update saved address |
| DELETE | `/api/addresses/[id]` | 🔐 | — | Archive address (soft delete) |
| PATCH | `/api/addresses/[id]/set-default` | 🔐 | — | Set as default shipping or billing |

---

## Location API

| Method | Route | Auth | Rate | Purpose |
|--------|-------|------|------|---------|
| GET | `/api/locations/[country]/regions` | 🔓 | ⚡ | List administrative regions (states/provinces) for country |
| GET | `/api/locations/[country]/[region]/cities` | 🔓 | ⚡ | Search cities within region (autocomplete) |

**Notes:**
- Used for address form dropdowns
- Cached in-process (per cold-start) by `LocationService`

---

## Coupon API

| Method | Route | Auth | Rate | Purpose |
|--------|-------|------|------|---------|
| POST | `/api/coupons/validate` | 🔐 | ⚡ | Preview coupon discount (soft validation, does not consume) |

---

## Auth API

| Method | Route | Auth | Notes |
|--------|-------|------|-------|
| POST | `/api/auth/callback` | — | Supabase OAuth callback handler |
| GET | `/api/auth/confirm` | — | Email confirmation handler |

**Notes:**
- Auth flows are handled primarily by Supabase SSR client (`@supabase/ssr`)
- Custom route handlers wrap Supabase's code exchange

---

## CMS API

| Method | Route | Auth | Purpose |
|--------|-------|------|---------|
| GET | `/api/cms/[country]/[lang]/pages/[slug]` | 🔓 | Deliver CMS page content (public storefront) |
| GET | `/api/cms/[country]/[lang]/navigation/[key]` | 🔓 | Deliver navigation menu |
| GET | `/api/cms/banners` | 🔓 | Deliver active banners |

**Notes:**
- Content sanitized by `sanitizeCmsHtml()` before delivery (XSS protection)
- Locale resolution: exact `{lang}-{country}` → country default lang → 404
- `null` content in `localized_cms_pages` = inherit from country-level content

---

## Admin API

| Method | Route | Auth | Permission | Purpose |
|--------|-------|------|-----------|---------|
| GET | `/api/admin/orders` | 🛡️ | `orders:read` | List all orders with filters |
| PATCH | `/api/admin/orders/[id]/status` | 🛡️ | `orders:manage` | Update order status |
| GET | `/api/admin/inventory` | 🛡️ | `inventory:read` | List inventory levels |
| PATCH | `/api/admin/inventory` | 🛡️ | `inventory:write` | Adjust stock levels |
| GET | `/api/admin/customers` | 🛡️ | `customers:read` | List customers |
| GET | `/api/admin/analytics` | 🛡️ | `analytics:read` | Dashboard analytics |

---

## Webhook API

| Method | Route | Auth | Provider |
|--------|-------|------|---------|
| POST | `/api/webhooks/stripe` | 🔗 | Stripe |

**Stripe webhook events handled:**
- `payment_intent.succeeded` → order `confirmed`
- `payment_intent.payment_failed` → order `cancelled`, inventory released
- `charge.refunded` → order `refunded`

---

## API Response Format

All API routes use a consistent response format via `src/lib/api.ts`:

```typescript
// Success
apiSuccess(data, statusCode = 200)
// → { data: T, success: true }

// Error
apiError(message, statusCode, code?, fieldErrors?)
// → { error: { message, code, fieldErrors? }, success: false }
```

---

## Rate Limiting

Rate limits applied via `withRateLimit()` wrapper from `src/lib/rate-limit.ts`.

| Endpoint Class | Limit |
|---------------|-------|
| Cart mutations | 30 req/min per IP |
| Order creation | 5 req/min per user |
| Address validation | 20 req/min per IP |
| Coupon validation | 10 req/min per user |
| Location lookups | 60 req/min per IP |

---

## Security Notes

1. **Cart routes are public** — ownership is checked by `assertCartOwnership()` (not RLS) to support guest carts
2. **Admin routes always call `requireAdminPermission()`** before any DB operation
3. **Webhook routes verify signatures** — `stripe.webhooks.constructEvent()` before processing
4. **Service-role client** never used in route handlers directly — only in service layer
5. **Input validation** via Zod schemas on all POST/PATCH bodies

---

## Related Documents

- `docs/architecture/DEPENDENCY_GRAPH.md` — How services connect
- `docs/cart-architecture.md` — Cart API detail
- `docs/payment-flow.md` — Payment API detail
- `docs/order-lifecycle.md` — Order API detail
- `docs/rls-policies.md` — DB-level security
