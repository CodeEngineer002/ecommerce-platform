# ADR-004: Server-Side Pricing (Never Trust Client Prices)

**Status:** Accepted  
**Date:** 2026-05-16  
**Deciders:** Architecture team  
**Supersedes:** —  
**Superseded by:** —

---

## Context

In ecommerce, pricing calculation is a security-critical operation. Customers (or attackers) can manipulate client-side values — including product prices, tax amounts, discount values, and totals — before submitting an order.

The platform needed a clear policy for where pricing calculations happen and which values are authoritative.

---

## Decision

**All authoritative pricing is calculated server-side. Client-submitted prices are never trusted.**

**The pricing engine (`calculatePricing()`) is:**
1. A pure function (no DB calls, no side effects)
2. Called server-side in all authoritative contexts
3. The same function used in cart, checkout, and order creation

**Price sources (all server-side):**
- `product_variants.price` or `products.base_price` — fetched directly from DB
- `region-config.ts` — compile-time tax rates, shipping thresholds, currencies
- `coupons` table — discount values fetched server-side

**Client role:**
- Displays prices for UX only
- Sends `variant_id` and `quantity` to server (never prices)
- Server re-fetches authoritative prices, recalculates, and returns the result

---

## Problem Being Solved

**Attack vector 1:** An attacker intercepts the checkout form and submits `unitPrice: 0.01` for all items. Without server-side pricing, the order is placed at manipulated prices.

**Attack vector 2:** A sophisticated user edits the JS Fetch call to send a modified cart summary with a 100% coupon discount. Server must re-validate coupon terms.

**Attack vector 3:** A race condition between price update and checkout. Customer saw ₹999, but price changed to ₹1,299 before checkout completed. Server detects the change and emits a `PRICE_CHANGED` warning, requiring customer re-confirmation.

---

## Alternatives Considered

| Alternative | Why Rejected |
|------------|-------------|
| Trust client prices, audit server-side | No — fraud occurs before the audit; damages already done |
| Client calculates, server spot-checks | Inconsistency; race conditions between client and server pricing |
| Pricing in DB functions | Possible, but loses pure-function testability and makes unit tests harder |
| Third-party pricing service | Latency, dependency, cost — not justified at this scale |

---

## Tradeoffs

**Benefits:**
- Impossible to manipulate prices via client (server always re-calculates from DB)
- Single source of truth: `calculatePricing()` function is identical everywhere
- Pure function is trivially testable and auditable
- Detects price changes between cart add and checkout (warns customer)
- Consistent floating-point handling (`round2()`) everywhere

**Costs:**
- Extra DB reads on every cart mutation (fetch current prices)
- Slightly higher latency per cart operation
- Client-side "estimated total" may differ from server-side (by design — displayed as estimate)
- Refactoring UI to show estimates requires clear labeling to avoid customer confusion

---

## Implementation

```typescript
// src/domain/pricing/pricing-engine.ts
export function calculatePricing(
  lineItems: LineItem[],          // { variantId, quantity, unitPrice } — unitPrice from DB
  coupon: CouponData | null,      // from DB, never from client
  shippingConfig?: ShippingConfig, // from region-config.ts
  taxConfig?: TaxConfig            // from region-config.ts via getTaxConfig(countryCode)
): PriceBreakdown { ... }

// Called in:
// 1. CartService.addItem/updateQuantity/applyCoupon (every cart mutation)
// 2. buildCheckoutSummary() (pre-order validation)
// 3. create_order_atomic() RPC (final snapshot)
```

**Price change detection in CartService:**
```typescript
const PRICE_CHANGE_TOLERANCE = 0.01; // ₹0.01 / $0.01 / €0.01
if (Math.abs(currentPrice - snapshot) > PRICE_CHANGE_TOLERANCE) {
  warnings.push({ type: 'PRICE_CHANGED', oldPrice: snapshot, newPrice: currentPrice });
}
```

---

## Future Implications

- Multi-currency orders: server must fetch exchange rates server-side (never trust client exchange rate)
- Dynamic pricing (e.g., flash sales): pricing engine can accept override config — still server-side
- B2B pricing tiers: pass customer tier to `calculatePricing()` — pure function remains testable
- External tax provider (Avalara, TaxJar): replace `getTaxConfig()` with API call — same interface

---

## Related

- `docs/business-rules.md` — Pricing rules
- `docs/cart-architecture.md` — Cart warnings system (PRICE_CHANGED)
- `docs/checkout-flow.md` — Checkout pricing validation
- ADR-002: Order Immutability (pricing snapshot is downstream of this decision)
- ADR-006: Atomic Order Creation (final server-side pricing happens inside RPC)
