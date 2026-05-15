# Ecommerce Domain Architecture

## Overview

This document describes the domain model, service boundaries, and architectural principles of the ecommerce platform.

## Domain Layer Structure

```
src/domain/
├── pricing/
│   ├── types.ts            — LineItem, CouponData, PriceBreakdown, Money, OrderPricingSnapshot
│   └── pricing-engine.ts   — Pure pricing calculation (no DB, no side effects)
├── coupon/
│   └── coupon-engine.ts    — Coupon validation against live DB state
├── order/
│   └── order-state-machine.ts — Order, payment, and fulfillment state machines
├── inventory/
│   ├── stock-guard.ts      — Pre-flight stock validation
│   └── inventory-movement.ts — Movement ledger service
├── cart/
│   └── cart-validator.ts   — Server-side cart validation
├── checkout/
│   └── checkout-orchestrator.ts — Checkout summary builder
├── returns/
│   ├── return-eligibility.ts — Return window and eligibility
│   └── refund-calculator.ts  — Pure refund amount calculation
├── payment/
│   └── payment-lifecycle.ts — Payment status management and audit
└── review/
    └── review-eligibility.ts — Verified purchase check
```

## Layer Boundaries

| Layer | Responsibility | Can Import From |
|-------|---------------|----------------|
| `src/domain/` | Pure business logic, domain rules | `src/lib/` (errors, constants) |
| `src/features/` | Feature-level services and hooks | `src/domain/`, `src/lib/` |
| `src/app/api/` | Route handlers, HTTP interface | `src/domain/`, `src/features/`, `src/lib/` |
| `src/components/` | UI rendering | `src/features/` hooks, `src/types/` |

**Rule**: Domain services do not import from features or components. Features do not import from API routes.

## Core Domain Entities

### Products and Catalog
- `products` — core product data (name, slug, pricing, SEO)
- `product_variants` — SKU-level variants (size, color, etc.)
- `product_images` — ordered images per product
- `inventory_levels` — multi-warehouse stock per variant (quantity, reserved); `available = quantity - reserved`
- `inventory_movements` — full audit ledger of every stock change

### Orders and Fulfillment
- `orders` — order record with immutable `pricing_snapshot` JSON
- `order_items` — line items with price snapshots and product detail snapshots
- `order_address_snapshots` — immutable address copies frozen at order time
- `order_status_history` — immutable transition audit log
- `shipment_tracking` — carrier and tracking information

### Payments
- `payments` — payment record per order
- `payment_events` — full payment audit log
- `idempotency_keys` — deduplication for client retries

### Promotions
- `coupons` — coupon definitions
- `coupon_usage` — per-user usage tracking (prevents double-use race condition)

### Returns and Refunds
- `return_requests` / `order_returns` — return initiation record
- `return_items` / `order_return_items` — line items being returned
- `refund_requests` — refund records (can exist without a return)

### User Data
- `profiles` — user profile, role, contact info
- `customer_addresses` — saved shipping/billing addresses (soft-deleted via `archived_at`)
- `carts` / `cart_items` — persistent cart (guest and authenticated)
- `reviews` — verified purchase reviews

## Architectural Principles

### 1. Never Trust Client Prices
Variant/product prices are always fetched from the database. The pricing engine runs server-side. Client-submitted prices are ignored.

### 2. Atomic Transactions
Order creation (`create_order_atomic`) is a single PL/pgSQL transaction. All 9 steps (inventory lock, validation, order insert, items insert, inventory reservation, coupon consumption, status history) succeed or roll back together.

### 3. Server-Side Calculations
All price calculations run through `calculatePricing()` in the pricing engine. The exact same function runs in the API route and in the checkout summary builder, ensuring the checkout preview matches the final order.

### 4. Idempotency
Webhook events are deduplicated using the `idempotency_keys` table. Retried deliveries return the cached response.

### 5. Full Audit Trails
Every state change is logged:
- Order status changes → `order_status_history`
- Inventory changes → `inventory_movements`
- Payment events → `payment_events`

### 6. Typed Domain Errors
All business rule violations throw specific typed errors:
- `InventoryError`, `InventoryReservationFailedError`
- `CouponError`, `InvalidCouponError`, `CouponExpiredError`
- `OrderStateError`
- `ReturnNotEligibleError`, `RefundNotAllowedError`
- `PaymentVerificationFailedError`

See `src/lib/errors.ts` for the complete hierarchy.

## Future Extension Points

| Feature | Extension Point | Status |
|---------|----------------|--------|
| Multi-currency | Add `currency` field to pricing engine; capture exchange rate in `pricing_snapshot` | Planned |
| External tax provider | Replace `getTaxConfig()` with Avalara/TaxJar API (interface already abstracted) | Planned |
| Shipping provider API | Add strategies to `ShippingStrategy` in shipping calculator | Planned |
| B2B pricing tiers | Add customer tier injection into `calculatePricing()` | Planned |
| Marketplace/vendor | Add `vendor_id` to `products` and `orders` | Planned |

> **Already implemented:** Multi-warehouse inventory (`inventory_levels`, migration 00017) and country-specific tax (`getTaxConfig()`, migration/Step 3) are complete. See `CLAUDE.md` for the full hardening status.
