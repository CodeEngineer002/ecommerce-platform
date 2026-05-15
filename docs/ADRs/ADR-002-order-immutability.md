# ADR-002: Order Immutability via Snapshot Pattern

**Status:** Accepted  
**Date:** 2026-05-16  
**Deciders:** Architecture team  
**Supersedes:** —  
**Superseded by:** —

---

## Context

Orders represent legal and financial commitments. Once placed, an order must accurately reflect what was purchased: which products, at which prices, with which shipping address, under which tax rates.

However, the underlying data these orders reference changes over time:
- Product prices are updated frequently
- Tax rates change (government policy)
- Shipping rates change
- Products are discontinued
- Customers update their addresses

If an order holds foreign keys to mutable data, the historical record becomes unreliable.

---

## Decision

**All order data is captured as an immutable snapshot at order creation time.**

Three types of snapshots are captured:

**1. Pricing Snapshot** (`orders.pricing_snapshot` — JSON column):
```json
{
  "currency": "INR",
  "subtotal": 2999.00,
  "discount": 300.00,
  "tax": 486.18,
  "taxRate": 0.18,
  "shipping": 0,
  "total": 3185.18,
  "couponCode": "SAVE10",
  "lineItems": [
    { "variantId": "...", "productName": "Widget Pro", "quantity": 2, "unitPrice": 1499.50, "lineTotal": 2999.00 }
  ]
}
```

**2. Order Item Snapshot** (`order_items.snapshot` — JSON column):
```json
{
  "productName": "Widget Pro",
  "variantOptions": { "color": "black", "size": "M" },
  "sku": "WP-BLK-M",
  "imageUrl": "...",
  "categoryName": "Accessories"
}
```

**3. Address Snapshot** (`order_address_snapshots` — separate table):
- Complete address record frozen at order time
- Includes `country_name` (resolved, not just code)
- References original `customer_addresses.id` (for traceability only)
- Changes to customer's address book do not affect this record

---

## Problem Being Solved

**Example 1:** A product's price changes from ₹1,499 to ₹1,799 after a customer places an order. The order history must still show ₹1,499. With snapshot, `order_items.unit_price` and `pricing_snapshot.lineItems[].unitPrice` are frozen.

**Example 2:** Tax rate changes (e.g., GST reform). Historical orders must reflect the tax rate at purchase time for accounting/compliance.

**Example 3:** Customer moves and updates their shipping address. Their order history should show the address where the item was actually shipped, not their current address.

**Example 4:** A product is discontinued and removed from the database. Order history must still show what was purchased.

---

## Alternatives Considered

| Alternative | Why Rejected |
|------------|-------------|
| FK to `product_variants` only | Mutable reference — price/name can change, breaking historical accuracy |
| Soft delete mutable entities | Doesn't solve price history; complicates queries |
| Versioning all mutable entities | Extremely complex; every entity needs version history |
| Event sourcing for orders | Overkill for this scale; increases operational complexity significantly |
| Audit tables for price changes | Querying historical prices becomes complex joins |

---

## Tradeoffs

**Benefits:**
- Historical orders are accurate regardless of catalog/price changes
- Simpler queries — order data is self-contained
- Reduced legal/compliance risk
- Enables accurate refund calculations (uses original prices, not current)
- No complex joins to reconstruct order at-a-point-in-time

**Costs:**
- Duplicate data (product name stored in both `products` and `order_items.snapshot`)
- JSON columns require application-level parsing (not directly queryable via SQL WHERE)
- Slightly larger storage per order
- Must remember to capture snapshots atomically with order creation

---

## Implementation

```
create_order_atomic() PostgreSQL RPC:
  - Captures pricing snapshot from checkout summary
  - Inserts order_items with unit_price (at purchase time)
  - Inserts order_items with snapshot JSON (product details at purchase time)
  - Inserts order_address_snapshots (full address at purchase time)

src/domain/checkout/checkout-orchestrator.ts:
  - buildCheckoutSummary() returns pricingSnapshot
  - This is passed directly to create_order_atomic() without modification
```

**Critical invariant:** `orders.pricing_snapshot` and `order_items.snapshot` columns must never be updated after row insertion. No migration should add UPDATE triggers on these columns.

---

## Future Implications

- Refund calculations always use `order_items.unit_price`, never current product prices
- Order display (storefront + admin) reads from snapshot columns when product data is unavailable
- Tax reporting uses `pricing_snapshot.taxRate` and `pricing_snapshot.tax` — consistent with legal requirements
- Multi-currency orders (future): snapshot must include exchange rate used

---

## Related

- `docs/order-lifecycle.md` — Order status machine
- `docs/refund-return-flow.md` — Uses snapshot pricing for refund calculation
- ADR-006: Atomic Order Creation (implementation mechanism)
