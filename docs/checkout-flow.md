# Checkout Flow

## High-Level Flow

```
Cart Display
    │
    ▼
buildCheckoutSummary()          ← validates cart + pricing + coupon server-side
    │                             returns warnings (price changed, low stock)
    │
    ▼
Checkout Page (with summary)
    │
    ▼
POST /api/orders/create
    │
    ├── Authenticate user
    ├── Validate request schema (Zod)
    ├── Fetch authoritative prices from DB
    ├── Validate coupon (soft pre-flight)
    ├── Calculate pricing (server-side)
    ├── Call create_order_atomic RPC
    │       ├── Lock inventory rows (sorted, deadlock-safe)
    │       ├── Validate stock for each item
    │       ├── Re-validate coupon under lock
    │       ├── Generate order number
    │       ├── Insert order (status: pending_payment)
    │       ├── Insert order items (bulk)
    │       ├── Reserve inventory + record movements
    │       ├── Consume coupon (increment + coupon_usage)
    │       └── Insert status history entry
    ├── Create payment record
    └── Route by payment provider:
            COD → auto-confirm order + payment, return orderId
            Stripe/Razorpay → create payment intent, return clientSecret
```

## Checkout Orchestrator

`src/domain/checkout/checkout-orchestrator.ts` — `buildCheckoutSummary()`

Call this from the checkout page server component or API route to:
1. Validate all cart items (availability, stock, price changes)
2. Validate coupon against live state
3. Calculate the final pricing breakdown
4. Return warnings for the UI (price changed since added, low stock)
5. Produce an `OrderPricingSnapshot` to pass to order creation

```typescript
const summary = await buildCheckoutSummary({
  items: cartItems.map(i => ({
    variantId: i.variant.id,
    quantity: i.quantity,
    clientUnitPrice: i.variant.price,
  })),
  couponCode: appliedCoupon,
  userId: user.id,
});
// summary.warnings — show price change alerts
// summary.pricing  — display updated total
// summary.items    — use serverUnitPrice for actual charges
```

## Cart Validation Rules

| Check | Type | Result |
|-------|------|--------|
| Variant inactive/not found | Hard error | Cannot checkout |
| Insufficient stock | Hard error | Cannot checkout |
| Quantity > CART_MAX_QUANTITY | Hard error | Cannot checkout |
| Price changed since added | Warning | User shown new price |
| Low stock (≤ requested + 2) | Warning | User shown stock alert |

## Idempotency

The `create_order_atomic` RPC is safe to retry:
- Inventory locks prevent double-reservation
- Coupon consumption is inside the same transaction
- If the RPC fails, no partial state is left

For webhook-level idempotency, the `idempotency_keys` table deduplicates Stripe retries.

## Trust Boundary

| Trusted | Not Trusted |
|---------|------------|
| DB variant/product prices | Client-submitted prices |
| Server-calculated subtotal/tax/shipping/total | Client-submitted totals |
| Server-validated coupon | Client-submitted discount amount |
| DB-verified inventory | Client-submitted availability |

## Edge Cases

| Scenario | Handling |
|----------|---------|
| Item becomes unavailable mid-checkout | `VARIANT_UNAVAILABLE` error from cart validator |
| Stock drops below requested qty mid-checkout | `INSUFFICIENT_STOCK` from `create_order_atomic` |
| Coupon reaches limit between validate and create | `P0003` from RPC, mapped to `CouponError` |
| Same user submits checkout twice simultaneously | Second call fails at `create_order_atomic` (inventory lock) |
| Payment intent created but webhook not received | Order stays in `pending_payment`; Stripe retries webhook |
