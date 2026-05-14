# Returns and Refunds

## Return Window

Default return window: **30 days from delivery date** (configurable via `RETURN_WINDOW_DAYS` constant in `src/domain/returns/return-eligibility.ts`).

## Return Request Lifecycle

```
User requests return
        │
        ▼
checkReturnEligibility()
        │ checks: order belongs to user, status is delivered/partially_returned,
        │         delivery was within return window
        ▼
return_requests (status: pending)
        │
        ▼
Admin reviews
        ├── Approved → return_requests (status: approved)
        │       └── User ships items back
        │               └── Admin confirms receipt
        │                       ├── Update return_items.condition
        │                       ├── Calculate refund amount
        │                       ├── Process refund via payment provider
        │                       └── Update order status:
        │                               all items returned → order: refunded
        │                               partial return     → order: partially_returned
        └── Rejected → return_requests (status: rejected)
                └── Notify user with reason
```

## Eligibility Rules

| Rule | Implemented In |
|------|---------------|
| Order must belong to the user | `return-eligibility.ts` |
| Order status must be `delivered` or `partially_returned` | `return-eligibility.ts` |
| Delivery must be within the return window | `return-eligibility.ts` |
| Delivery date sourced from `order_status_history` | `return-eligibility.ts` |

```typescript
const result = await checkReturnEligibility(orderId, user.id);
// result.eligible — boolean
// result.windowExpiresAt — Date when window closes
// result.reason — human-readable reason if not eligible
```

## Refund Calculation

`calculateRefund()` in `src/domain/returns/refund-calculator.ts` is a **pure function** (no DB, fully testable):

```typescript
const refund = calculateRefund({
  orderSubtotal: order.subtotal,
  orderShipping: order.shipping,
  orderTaxRate: 0.18,
  orderItems: order.items,
  returnItems: [
    { orderItemId: "item-1", quantity: 1 },
  ],
  restockingFeeRate: 0,          // 0–1 decimal (e.g. 0.05 = 5%)
  refundShippingOnFullReturn: true,
});
// refund.totalRefund    — final amount to refund
// refund.isFullReturn   — whether all items are returned
// refund.shippingRefund — shipping included if full return
// refund.taxRefund      — proportional tax refund
```

## Inventory Restock Logic

When a return item has `restock: true`:
1. `release_inventory` is called for the returned quantity
2. An `inventory_movements` record is written with `type: "return"` and `source_type: "return"`
3. The item is back in available stock

This is an explicit, auditable action — inventory is never automatically restocked without admin confirmation of item condition.

## Partial Return / Refund

The schema supports both:
- `partially_returned` — some items returned, others kept
- `partially_refunded` — refund issued for returned portion only

Order transitions from `partially_returned` can go to `refunded` (final state) or `partially_refunded` (if refund is issued in steps).

## Return Item Conditions

Return items record the physical condition of received goods:

| Condition | Typically Restockable |
|-----------|----------------------|
| `new` | Yes |
| `good` | Yes (with inspection) |
| `damaged` | No (write-off) |
| `defective` | No (vendor claim / write-off) |

## Edge Cases

| Scenario | Handling |
|----------|---------|
| Return after window expires | `ReturnNotEligibleError` from eligibility check |
| Return for non-delivered order | `ReturnNotEligibleError` |
| Another user tries to return | `ReturnNotEligibleError` (access denied) |
| Partial refund then full refund | Allowed: `partially_refunded → refunded` transition |
| Return for digital product | Should be blocked — add `is_digital` check to eligibility |
