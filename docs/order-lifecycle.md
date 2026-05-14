# Order Lifecycle

## Order Status Machine

```
               ┌─────────┐
               │  draft  │ ─────────────────────────────────────────┐
               └────┬────┘                                          │
                    │                                               │
          ┌─────────▼──────────┐                                   │
          │  pending_payment   │ ─────────────────────────────────┐ │
          └─────────┬──────────┘                                  │ │
                    │ (payment confirmed)                          │ │
          ┌─────────▼──────────┐                                  │ │
          │    confirmed       │ ──────────────────────────────┐  │ │
          └─────────┬──────────┘                               │  │ │
                    │                                          │  │ │
          ┌─────────▼──────────┐                               │  │ │
          │    processing      │ ──────────────────────────┐   │  │ │
          └─────────┬──────────┘                           │   │  │ │
                    │                                      │   │  │ │
          ┌─────────▼──────────┐                           │   │  │ │
          │      shipped       │ ──────────────────────┐   │   │  │ │
          └─────────┬──────────┘                       │   │   │  │ │
                    │                                  ▼   ▼   ▼  ▼ ▼
          ┌─────────▼──────────┐              ┌─────────────────────┐
          │     delivered      │              │      cancelled      │
          └───┬────────────────┘              └──────────┬──────────┘
              │                                          │
     ┌────────┼────────────────────┐                    │
     ▼        ▼                    ▼                    ▼
  refunded  partially_refunded  partially_returned    refunded
               │                    │
               └──────────┬─────────┘
                           ▼
                        refunded (terminal)
```

## Status Descriptions

| Status | Description | Entry Condition |
|--------|-------------|----------------|
| `draft` | Checkout initiated | User starts checkout |
| `pending_payment` | Order created, awaiting payment | After `create_order_atomic` RPC |
| `pending` | Legacy — treated as pending_payment | Backward compat |
| `confirmed` | Payment confirmed | Stripe webhook / COD auto-confirm |
| `processing` | Being packed/prepared | Admin action |
| `shipped` | Handed to carrier | Admin action + tracking added |
| `delivered` | Confirmed delivery | Admin action or auto-confirm |
| `cancelled` | Order cancelled | Before/during shipping; triggers inventory release |
| `partially_returned` | Some items returned | After return request approved |
| `partially_refunded` | Partial refund issued | After partial return processed |
| `refunded` | Full refund issued (terminal) | After full return / cancellation refund |

## Fulfillment Status (parallel tracking)

Tracks the physical goods lifecycle independently:

```
unfulfilled → processing → partially_fulfilled → fulfilled → shipped → delivered
                                                                    → failed (retryable to processing)
```

## State Machine Enforcement

All transitions are validated at two levels:

**TypeScript level** (domain/order/order-state-machine.ts):
- `canTransitionOrder(from, to)` — boolean check
- `assertOrderTransition(from, to)` — throws `AppError` on invalid

**Database level** (PL/pgSQL in update_order_status):
- Same transition table enforced in SQL
- Raises `P0006` error on invalid transition
- Writes `order_status_history` entry atomically
- Triggers side-effects (inventory release on cancel, stock commit on deliver)

## Lifecycle Side-Effects

| Transition | Side-Effect |
|-----------|------------|
| `→ cancelled` | Releases inventory reservation for all order items |
| `→ delivered` | Commits inventory (deducts actual stock, releases reservation) |
| `→ shipped` or `→ processing` | Updates `fulfillment_status` to match |

## Payment Status (separate from order status)

```
unpaid → pending → authorized → paid → refunded
                           └──→ failed → pending (retry)
                                         paid → partially_refunded → refunded
```

## Key Business Rules

1. Delivered orders cannot be directly cancelled → must go through return flow
2. Refund requires valid payment state (`paid`)
3. Every transition is logged with timestamp, actor, and reason
4. Admin cancellation of a shipped order releases inventory
5. COD orders auto-transition to `confirmed` at creation
