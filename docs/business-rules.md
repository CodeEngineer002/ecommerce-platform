# Business Rules

## Pricing Rules

All pricing calculations run through `calculatePricing()` in `src/domain/pricing/pricing-engine.ts`.

| Rule | Implementation |
|------|---------------|
| Subtotal = sum of (unitPrice × quantity) | pricing-engine.ts |
| Discount cannot exceed subtotal | `Math.min(discount, subtotal)` in calculateDiscount() |
| Tax is calculated on (subtotal − discount) | taxableAmount = subtotal - discount |
| Shipping is free above `FREE_SHIPPING_THRESHOLD` (₹999) | constants.ts + pricing-engine.ts |
| Flat shipping rate below threshold (₹99) | constants.ts + pricing-engine.ts |
| Total can never be negative | `Math.max(0, total)` |
| Percentage coupon: `value`% of subtotal, capped at `maxDiscount` | calculateDiscount() |
| Fixed coupon: flat `value`, capped at subtotal | calculateDiscount() |

### Money
All monetary values are in major currency units (Indian Rupees). Never store or compute in paise. Round to 2 decimal places using `Math.round(n * 100) / 100`.

## Cart Rules

| Rule | Implementation |
|------|---------------|
| Max quantity per item: `CART_MAX_QUANTITY` (10) | cart-validator.ts |
| Price changed since added → warn user, use new price | cart-validator.ts |
| Variant unavailable → hard error, cannot checkout | cart-validator.ts |
| Stock below requested → hard error | cart-validator.ts |
| Available ≤ requested + 2 → low stock warning | cart-validator.ts |

## Coupon Rules

| Rule | Implementation |
|------|---------------|
| Code must exist and be active | coupon-engine.ts |
| `valid_from` must be in the past | coupon-engine.ts |
| `valid_until` must be in the future | coupon-engine.ts |
| `used_count < usage_limit` (if set) | coupon-engine.ts |
| `subtotal ≥ min_order_value` (if set) | coupon-engine.ts |
| One use per user (enforced by `coupon_usage` table) | coupon-engine.ts + DB |
| Re-validated under transaction lock (prevents race condition) | create_order_atomic |
| Coupon consumption is atomic with order creation | create_order_atomic |

## Inventory Rules

| Rule | Implementation |
|------|---------------|
| Available = quantity - reserved | DB computed / available_inventory() |
| Inventory locked before reservation (prevents oversell) | create_order_atomic |
| Locks acquired in variant_id sort order (prevents deadlocks) | create_order_atomic |
| Reservation released on order cancellation | update_order_status side-effect |
| Stock deducted only on delivery confirmation | commit_inventory_for_order() |
| Every change recorded in inventory_movements | record_inventory_movement() |

## Order Rules

| Rule | Implementation |
|------|---------------|
| All order creation steps are atomic | create_order_atomic RPC |
| Order number is generated inside the transaction | generate_order_number() |
| Delivered orders cannot be directly cancelled | order-state-machine.ts |
| Cancellation after delivery → must use return flow | order-state-machine.ts |
| Every status change is audited | order_status_history table |
| Invalid transitions are rejected at DB level (P0006) | update_order_status RPC |

## Payment Rules

| Rule | Implementation |
|------|---------------|
| Order status only set to `confirmed` by server-side webhook | webhooks/stripe/route.ts |
| Webhook signatures verified before processing | stripe.webhooks.constructEvent() |
| Duplicate webhooks are no-ops (idempotency_keys) | webhooks/stripe/route.ts |
| Payment status machine enforced | payment-lifecycle.ts |
| Failed payment → order cancelled → inventory released | update_order_status side-effect |

## Return/Refund Rules

| Rule | Implementation |
|------|---------------|
| Only delivered orders can be returned | return-eligibility.ts |
| Return window: 30 days from delivery | RETURN_WINDOW_DAYS constant |
| Return window calculated from order_status_history delivery entry | return-eligibility.ts |
| Refund cannot exceed amount paid | calculateRefund() max logic |
| Shipping refunded only on full return | refundShippingOnFullReturn flag |
| Tax refunded proportionally on returned items | calculateRefund() |
| Inventory restock is explicit, requires admin confirmation | Manual restock action |

## Review Rules

| Rule | Implementation |
|------|---------------|
| Only verified purchasers can review | review-eligibility.ts |
| Order must be in `delivered` status | review-eligibility.ts |
| One review per user per product | `UNIQUE(product_id, user_id)` constraint |

## Security Rules

| Rule | Implementation |
|------|---------------|
| Never trust client-submitted prices | Order creation re-fetches all prices from DB |
| Never trust client-submitted totals | All totals recalculated server-side |
| Users can only access their own orders | RLS on orders table |
| Users cannot modify finalized orders | RLS: only INSERT allowed for customers |
| Inventory can only be modified by admins (manual) | RLS on inventory + only DB functions from service role |
| Coupons can only be managed by admins | RLS on coupons |
