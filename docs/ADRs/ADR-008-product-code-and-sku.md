# ADR-008 — Product Code and SKU Are Canonical Catalog Identifiers

**Status:** Accepted  
**Date:** 2026-05-17  
**Applies to:** `products`, `product_variants`, `order_items`, `inventory_levels`, admin UI  
**Migration:** `supabase/migrations/00025_product_identifier_model.sql`

---

## Context

The ShopNest platform had an implicit and inconsistent product identifier model:

- `products.sku` was used as a product-level code (e.g. `FASH-003`) — a conflation of product-level and variant-level concepts
- `product_variants.sku` existed and was populated in seeds (e.g. `FASH-003-BLACK-XS`) but had no standardized format rules, no color/size code normalization, and no generation utility
- `order_items.sku` was hardcoded as `null` in the order creation API — variant SKUs were never written to orders
- `order_items.snapshot` was thin: `{variant_id, product_id, price_at_purchase}` — missing product code, sku, color, and size
- Admin `adminUpdateInventory` and `adminCreateVariant` wrote to the legacy `inventory` table, not `inventory_levels` (the source of truth per CLAUDE.md)
- No standardized color/size abbreviation codes existed — only free-text in `options` jsonb
- No barcode or supplier SKU fields existed at the variant level
- No SKU generation utility existed
- No domain errors existed for catalog constraint violations

These gaps blocked ERP integration, warehouse operations, reliable returns/refunds (items couldn't be identified if the catalog changed), and admin search by SKU.

---

## Decision

Establish a **two-level catalog identifier model**:

### Level 1 — Product Code (product/style level)

| Field | Table | Type | Constraint |
|---|---|---|---|
| `product_code` | `products` | `text` | `UNIQUE NOT NULL` |

- Human/business-readable. Example: `FASH-003`, `ELEC-001`
- Stable — must not change when the product title changes
- Backfilled from `products.sku` for existing records
- Generated via `generateProductCode(name, sequenceNumber)` for new products

### Level 2 — SKU (variant/sellable level)

| Field | Table | Type | Constraint |
|---|---|---|---|
| `sku` | `product_variants` | `text` | `UNIQUE` |
| `color_code` | `product_variants` | `text` | nullable |
| `size_code` | `product_variants` | `text` | nullable |
| `barcode` | `product_variants` | `text` | `UNIQUE WHERE NOT NULL` |
| `supplier_sku` | `product_variants` | `text` | nullable |
| `is_default` | `product_variants` | `boolean` | `NOT NULL DEFAULT false` |

- SKU format: `PRODUCT_CODE-COLOR_CODE-SIZE_CODE` e.g. `FASH-003-BLK-XS`
- Generated via `generateVariantSku(productCode, { color, size })` for new variants
- Existing SKUs (`FASH-003-BLACK-XS`) are **NOT renamed** — `color_code`/`size_code` are new fields alongside existing `sku`

### Order Item Snapshots

Order items must capture both identifiers at purchase time (supports ADR-002 order immutability):

```typescript
snapshot: {
  variant_id, product_id,
  product_code,   // ← new
  sku,            // ← was null, now populated
  color,          // ← new
  size,           // ← new
  price_at_purchase
}
```

Direct columns added: `order_items.sku`, `order_items.product_code`, `order_items.color`, `order_items.size`

### Inventory Table Fix

`adminUpdateInventory` and `adminCreateVariant` were writing to the legacy `inventory` table. Both now write to `inventory_levels` (the source of truth per CLAUDE.md Step 1 / migration 00017).

---

## Standardized Code Maps

### Color Codes

| Color | Code | Color | Code |
|---|---|---|---|
| Black | BLK | White | WHT |
| Beige | BEI | Red | RED |
| Olive | OLV | Blue | BLU |
| Navy | NVY | Green | GRN |
| Charcoal | CHR | Grey/Gray | GRY |

Full map: `src/domain/catalog/sku-generator.ts → COLOR_CODE_MAP`

### Size Codes

Standard apparel sizes pass through as-is: `XS`, `S`, `M`, `L`, `XL`, `XXL`, `3XL`, `4XL`, `ONE`

---

## Consequences

### Positive

- Inventory, warehouse ops, and fulfillment can identify items by stable SKU
- Order history is resilient to catalog changes — SKU and product code captured at purchase
- Returns/refunds can reference the exact variant SKU from the order snapshot
- ERP integration has a stable product_code and variant sku to map against
- Barcode/GTIN ready at the variant level with UNIQUE constraint
- Supplier reconciliation supported via `supplier_sku`
- Admin search by product code and SKU is now possible
- Color/size filter on admin inventory page is now powered by normalized `color_code`/`size_code`

### Neutral

- Existing `product_variants.sku` values (`FASH-003-BLACK-XS`) are NOT renamed — they use full color names, not the new abbreviated codes. `color_code`/`size_code` are parallel fields with the abbreviated values. New variants should use the abbreviated format via `generateVariantSku()`.
- `products.sku` is retained for backward compat — use `products.product_code` for new code going forward.

### Risks / Notes

- Historical `order_items` rows have `sku=NULL` and no `product_code`/`color`/`size` — backfill via migration 00025 restores what it can from joined `product_variants`, but any items whose variants have been deleted will remain partially null.
- SKU uniqueness is enforced at the DB level. Application-layer `DuplicateSkuError` is surfaced via `mapDbErrorToCatalogError()`.
- `is_default` is bootstrapped by migration 00025 (prefers size M, then L, then first variant). Admins should review and adjust per product.

---

## Files

| Role | Path |
|---|---|
| Migration | `supabase/migrations/00025_product_identifier_model.sql` |
| SKU generator | `src/domain/catalog/sku-generator.ts` |
| Domain errors | `src/domain/catalog/catalog-errors.ts` |
| Order creation fix | `src/app/api/orders/create/route.ts` |
| Admin inventory UI | `src/app/admin/inventory/page.tsx` |
| Admin product service | `src/features/admin/services/admin-product.service.ts` |
| Validators | `src/lib/validators/index.ts` |
| Types | `src/types/index.ts` |
| Tests | `src/tests/unit/sku-generator.test.ts` |
| Knowledge graph | `docs/knowledge-graph/entities.json`, `docs/knowledge-graph/services.json` |

---

## Architecture Rules Added

| Rule | Why |
|---|---|
| `product_code` is required for all new products | Enables ERP, admin search, stable historical references |
| `sku` is required for all active sellable variants | Inventory, fulfillment, returns all depend on stable variant identity |
| SKU format: uppercase A–Z, 0–9, hyphens; 3–50 chars | Interoperable with barcode scanners, WMS, ERP |
| Never change an existing SKU | SKUs appear in historical orders; changing them breaks references |
| Always populate `order_items.sku` from the variant at purchase time | Order history must be resilient to catalog changes (ADR-002) |
| Inventory must be tracked at variant_id level in `inventory_levels` | Never product level; never the legacy `inventory` table |
