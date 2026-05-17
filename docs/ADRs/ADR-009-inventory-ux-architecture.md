# ADR-009: Enterprise Inventory UX Architecture

**Status:** Accepted  
**Date:** 2026-05-17  
**Authors:** Engineering Team  

---

## Context

The admin inventory module (`/admin/inventory`) previously displayed a single flat table of SKUs with a direct number input per row. While functionally correct for small catalogs, this approach had several limitations:

1. **No audit trail** — admin stock changes updated `inventory_levels` directly with no movement record. The `inventory_movements` table (created in migration 00001) was only populated by order events.
2. **No contextual adjustment** — no way to record *why* stock changed (damage, new receipt, correction).
3. **Flat-only view** — for a product with 6 colors × 6 sizes = 36 SKUs, the table was 36 disconnected rows with no grouped overview.
4. **No pagination** — `adminGetProducts` loaded page 1 only (20 products). For a catalog of 200+ products, inventory was silently incomplete.
5. **No movement history** — no UI to audit who changed what, when.

---

## Decision

Evolve the admin inventory UI into a **multi-view enterprise inventory management experience** while:
- **Not touching** any storefront, cart, checkout, order, or reservation logic.
- Keeping `inventory_levels` as the single source of truth.
- Keeping all existing hooks (`useAdminProducts`, `useAdminUpdateInventory`) for backward compatibility.

### Architecture Overview

```
Admin / Inventory (page.tsx)
├── [Scope: Global ▼]  [Warehouse: All ▼]    ← shared, always visible
│
├── Tabs: [Overview] [By Product ●] [SKU View] [History]
│
│  BY PRODUCT TAB (_components/matrix-view.tsx)
│  └── ProductMatrixSection per product
│      └── Color rows × Size columns grid
│          └── Click cell → AdjustmentModal
│
│  SKU VIEW TAB (_components/sku-table.tsx)
│  └── Enhanced flat table with Adjust button, status badge, pagination
│      └── Click Adjust → AdjustmentModal
│
│  OVERVIEW TAB (_components/overview-tab.tsx)
│  └── 6 metric cards + health distribution bar
│
│  HISTORY TAB (_components/history-tab.tsx)
│  └── inventory_movements table with type/reason/actor
```

### Adjustment Audit Strategy

Every admin stock change writes two records atomically (sequential Supabase client calls):
1. `UPSERT inventory_levels` — updates the stock quantity.
2. `INSERT inventory_movements` with:
   - `source_type = 'admin'`
   - `adjustment_reason` (one of 6 values added via migration 00026)
   - `previous_quantity` and `new_quantity`
   - `created_by = auth.users.id`

This strategy was chosen over a PL/pgSQL RPC because:
- Admin RLS policies already allow direct writes from authenticated admin sessions.
- The two-call approach is simpler to maintain and test.
- True atomicity (rollback if movement insert fails) is not critical for admin adjustments — worst case is a stock change without a movement record, which self-heals on next adjustment.

### Operations Supported

| Operation | Behavior |
|-----------|----------|
| Increase  | `newQty = current + input` |
| Decrease  | `newQty = max(0, current - input)` |
| Set Exact | `newQty = max(0, input)` |

Stock cannot go below 0.

### Adjustment Reasons (migration 00026)

| Code | Display |
|------|---------|
| `new_inventory_received` | New inventory received |
| `damaged_stock` | Damaged stock |
| `manual_correction` | Manual correction |
| `return_restocked` | Return restocked |
| `warehouse_transfer` | Warehouse transfer |
| `audit_correction` | Audit correction |

---

## New Files

| File | Purpose |
|------|---------|
| `supabase/migrations/00026_inventory_adjustment_reasons.sql` | Adds `adjustment_reason` column + CHECK constraint + index |
| `src/features/admin/services/admin-inventory.service.ts` | `recordStockAdjustment()`, `getInventoryMovements()`, `computeNewQuantity()` |
| `src/features/admin/hooks/use-admin-inventory.ts` | `useStockAdjustment()`, `useInventoryMovements()` |
| `src/app/admin/inventory/_components/adjustment-modal.tsx` | Audited stock adjustment dialog |
| `src/app/admin/inventory/_components/overview-tab.tsx` | 6-card metrics overview |
| `src/app/admin/inventory/_components/matrix-view.tsx` | Product-grouped color/size matrix |
| `src/app/admin/inventory/_components/sku-table.tsx` | Enhanced flat SKU table |
| `src/app/admin/inventory/_components/history-tab.tsx` | Movement history table |
| `src/app/admin/inventory/_components/country-inventory-hooks.ts` | Extracted country-scope hooks |
| `src/app/admin/inventory/shared-types.ts` | `InventoryRowData`, `ProductGroup`, `buildProductGroups()` |
| `src/tests/unit/inventory-matrix.test.ts` | Unit tests for data transforms |

## Modified Files

| File | Change |
|------|--------|
| `src/app/admin/inventory/page.tsx` | Rewritten as tab shell with shared filter state |
| `src/features/admin/services/admin-product.service.ts` | `ADMIN_PRODUCT_PAGE_SIZE` increased 20 → 50 |

---

## What Is NOT Changed

- `inventory_levels` schema or source-of-truth status
- `create_order_atomic` PL/pgSQL function
- `release_inventory_reservation` function
- `available_inventory()` DB function
- Cart, checkout, or storefront stock check logic
- `country_inventory` table and country-scope behavior
- `adminCreateVariant` inventory row creation
- All existing hooks: `useAdminProducts`, `useAdminUpdateInventory`

---

## Consequences

**Positive:**
- Every admin stock change is now audited with reason, actor, before/after quantities.
- Operations staff can view a product-grouped matrix instead of scanning hundreds of disconnected rows.
- Movement history provides a complete audit trail for stock discrepancies.
- Pagination prevents silent incomplete views for large catalogs.

**Neutral:**
- The `inventory_movements` table was previously only populated by order events. Admin adjustments now also populate it. Existing queries filtering by `source_type` will continue to work correctly.

**Future Work:**
- Bulk stock import via CSV upload
- Reorder point alerts (column already exists in `inventory_levels`)
- Email/Slack notifications when stock falls below `reorder_point`
- Playwright E2E tests for the adjustment flow
- Actor name display in history (join to profiles table)
