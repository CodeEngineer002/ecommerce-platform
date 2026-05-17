# ADR-010 — Enterprise Catalog Management UX Architecture

**Status:** Accepted  
**Date:** 2026-05-17  
**Deciders:** Platform Engineering, Catalog Team

---

## Context

The admin Products module existed as a basic CRUD panel:
- Products list showed only name, price, status — no variant counts, inventory summary, or market availability.
- No search or filtering.
- The product edit page had a flat form: all fields mixed on one screen, with variants completely invisible.
- Country availability was a simple flat checkbox grid that would not scale past ~12 countries.
- No shipping/operations fields (dimensions, fulfillment type, tax class, return eligibility) despite them being critical for warehouse workflow.
- Product duplication and archiving were missing, requiring workarounds.

---

## Decision

Evolve the admin Products module into an enterprise-grade catalog management system in two parts:

### Products List Page (enhanced)
- **Rich DataTable columns:** thumbnail + name + product_code badge, hierarchy summary (N variants · N colors · N sizes · N SKUs), inventory summary (total stock / OOS count / low-stock count), price range, category, markets (flag chips), status badge, relative updated-at.
- **Filter Bar:** debounced search, category dropdown, status (active/draft/archived), stock filter (all/low/OOS), featured toggle.
- **Quick Actions dropdown per row:** Edit, Preview PDP, Open Inventory, Duplicate, Activate/Deactivate, Archive, Copy product link.
- **Status model:** computed client-side from `is_active` + `deleted_at`. No DB enum required. Archive = `is_active: false, deleted_at: now()`.

### Product Edit Page (tabbed)
Tabs: **Overview | Media | Variants | Inventory | Pricing | SEO | Publishing | Shipping**

| Tab | Key capabilities |
|-----|----------------|
| Overview | Name, slug, short/full description |
| Media | Drag-to-reorder images, primary toggle, inline alt-text editing, variant image assignment |
| Variants | Color × Size matrix (clickable cells → variant modal), flat variant list, "Generate Missing SKUs" |
| Inventory | Read-only per-variant stock summary, OOS/low-stock badges, link to /admin/inventory |
| Pricing | Base price, compare price, product code |
| SEO | Title + description with character counters and live search preview |
| Publishing | Active/Featured toggles, region-grouped searchable country selector |
| Shipping | Weight, L×W×H (migration 00027), fulfillment type, tax class, returnable toggle |

---

## Rationale

### Why client-side status model (not a DB enum)?
Adding a `product_status` PostgreSQL enum would require a migration, enum type evolution, and mapping across every query. The same semantics are achievable with `is_active` (boolean) and `deleted_at` (nullable timestamp) already on the products table, with the status label computed in `computeProductStatus()`. This is consistent with how Shopify and other platforms model status.

### Why tabbed edit page?
A product in a real e-commerce system has ~35+ configurable attributes. A flat form degrades in usability past ~8 fields. Tabs reduce cognitive load, allow section-specific save actions, and allow progressive disclosure (e.g. Shipping tab is optional for digital products).

### Why Color × Size matrix?
A product with 5 colors × 6 sizes = 30 variants. A flat list of 30 rows is unwieldy. The matrix pattern (same as inventory matrix introduced in ADR-009) provides instant visual density: you can see which combinations exist, their stock status, and click directly into the right variant.

### Why reuse `buildProductGroups` pattern from `shared-types.ts`?
Consistency. The inventory matrix and catalog variant matrix use the same grouping logic. `buildVariantMatrix()` in `catalog-utils.ts` adapts the same pattern for the catalog context.

---

## New Files

| File | Purpose |
|------|---------|
| `supabase/migrations/00027_product_catalog_enhancements.sql` | Adds `length_cm`, `width_cm`, `height_cm`, `fulfillment_type`, `tax_class`, `is_returnable` to `products` |
| `src/app/admin/products/catalog-utils.ts` | Pure utility functions: `computeProductStatus`, `computeHierarchy`, `computePriceRange`, `computeInventorySummary`, `buildVariantMatrix`, `filterProducts`, `formatRelativeTime`, `generateVariantName` |
| `src/app/admin/products/_components/product-filters.tsx` | Debounced filter bar (search, category, status, stock, featured) |
| `src/app/admin/products/_components/overview-section.tsx` | Name, slug, descriptions tab |
| `src/app/admin/products/_components/media-section.tsx` | Drag-reorder images, alt-text, variant assignment |
| `src/app/admin/products/_components/variants-section.tsx` | Color × Size matrix + flat list |
| `src/app/admin/products/_components/variant-modal.tsx` | Dialog for creating/editing individual variants |
| `src/app/admin/products/_components/inventory-section.tsx` | Read-only stock summary per variant |
| `src/app/admin/products/_components/pricing-section.tsx` | Base/compare price + product code |
| `src/app/admin/products/_components/seo-section.tsx` | SEO fields with char counter + preview |
| `src/app/admin/products/_components/publishing-section.tsx` | Active/featured + region-grouped country selector |
| `src/app/admin/products/_components/shipping-section.tsx` | Dimensions, fulfillment, tax class, returnable |
| `src/tests/unit/product-catalog.test.ts` | 30+ unit tests for pure utility functions |

---

## Modified Files

| File | Change |
|------|--------|
| `src/app/admin/products/page.tsx` | Rewritten with rich columns, filter bar, quick actions |
| `src/app/admin/products/[id]/edit/page.tsx` | Rewritten as tabbed shell |
| `src/features/admin/services/admin-product.service.ts` | Added `adminDuplicateProduct`, `adminArchiveProduct`, `adminUpdateVariant`, `adminDeleteVariant`, `adminReorderImages`, `adminUpdateImageAltText`, `adminAssignImageToVariant` |
| `src/features/admin/hooks/use-admin-products.ts` | Added hooks for all new service functions |

---

## What Was NOT Changed

- `inventory_levels` remains the single source of truth for stock (migration 00017)
- `adminCreateVariant` / `adminUpdateInventory` logic unchanged
- Storefront PDP, cart, checkout, order flows — untouched
- `product_images` storage logic — unchanged (URLs reused on duplication, no re-upload)
- SEO fields structure — extended with char counters, not changed structurally
- `available_country_ids` array on products table — unchanged, UI improved
- `adminGetProducts` select structure — unchanged (data was already fetched, UI now uses it)

---

## Consequences

- **Positive:** Admins can now see variant hierarchy, inventory health, and market availability directly on the product list without entering the edit page.
- **Positive:** Variants are first-class citizens in the product editor via the matrix view.
- **Positive:** Product duplication and archiving reduce manual work for catalog operations.
- **Positive:** Shipping fields (migration 00027) unblock future 3PL and courier API integrations.
- **Trade-off:** Tabbed edit page requires awareness of which tab holds which field; mitigated by logical grouping and minimal number of tabs.
- **Deferred:** Server-side search/filtering (current: client-side on 50-product pages), bulk operations (skeleton exists), scheduled publish/unpublish dates, Playwright E2E tests.
