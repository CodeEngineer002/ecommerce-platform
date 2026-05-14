# Payment Flow

## Architecture

Payments are provider-agnostic. The `getPaymentProvider()` factory (`src/lib/payment.ts`) returns a provider interface. Currently supports: Stripe, Razorpay, COD.

```typescript
interface PaymentProvider {
  createIntent(params: CreateIntentParams): Promise<PaymentIntent>;
}
```

## Flow by Provider

### Online Payment (Stripe / Razorpay)

```
POST /api/orders/create
    │
    └── Returns { orderId, clientSecret, providerOrderId }
                │
                ▼
    Client completes payment in browser (Stripe Elements / Razorpay SDK)
                │
                ▼
    Stripe fires webhook → POST /api/webhooks/stripe
                │
                ├── Verify signature (HMAC)
                ├── Check idempotency_keys (deduplicate retries)
                ├── payment_intent.succeeded:
                │       ├── Update payment.status → succeeded
                │       └── Call update_order_status → confirmed
                │           (records status history atomically)
                └── payment_intent.payment_failed:
                        ├── Update payment.status → failed
                        └── Call update_order_status → cancelled
                            (triggers inventory release)
```

### Cash on Delivery (COD)

```
POST /api/orders/create (paymentProvider: "cod")
    │
    ├── create_order_atomic RPC → order created (pending_payment)
    ├── Insert payment record (status: pending)
    ├── Call update_order_status → confirmed
    └── Update payment.status → succeeded
        Returns { orderId }
```

## Payment Status Machine

```
unpaid → pending → authorized → paid → refunded
                └──────────────────→ failed → pending (retry)
                                     paid → partially_refunded → refunded
```

## Idempotency

Every Stripe webhook event has an `event.id`. Before processing:
1. Query `idempotency_keys` for this event ID
2. If found → return cached response (early exit)
3. If not found → process event, then insert key

This ensures replayed webhook deliveries are no-ops.

## Payment Verification Rule

**Never mark an order as paid based on a client callback alone.**

The correct flow:
1. Client completes payment → receives `payment_intent.succeeded` confirmation
2. Stripe fires webhook → server verifies and updates order

Even if a client claims payment succeeded, the order status only changes when the server-side webhook fires. This prevents:
- Forged payment success signals
- Race conditions between client redirect and webhook

## Payment Event Log

Every payment status change is recorded in `payment_events`:

```typescript
await recordPaymentEvent({
  paymentId: payment.id,
  orderId: order.id,
  eventType: "webhook_received",
  provider: "stripe",
  payload: event.data.object,
});
```

## Refund Architecture

Refunds are initiated through:
1. Admin approves return request → calls refund via payment provider API
2. Provider processes refund → fires webhook
3. Webhook updates payment status and order status

```typescript
// Refund calculation (pure, no side effects)
const refund = calculateRefund({
  orderItems: order.items,
  returnItems: approvedReturnItems,
  orderShipping: order.shipping,
  orderTaxRate: TAX_RATE,
  refundShippingOnFullReturn: true,
});
// refund.totalRefund → amount to send to payment provider
```

## Security Checklist

- [x] Stripe signature verification (`constructEvent`)
- [x] Service-role DB client (bypasses RLS for webhook handler)
- [x] Idempotency key deduplication
- [x] No client-submitted prices trusted
- [x] Payment status only set via webhook, not client callback
