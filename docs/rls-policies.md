# RLS Policy Reference

All tables use Row Level Security (RLS) with **default deny** — a row is inaccessible unless a policy explicitly permits it.

---

## Core Pattern

All admin checks use the `is_admin()` SECURITY DEFINER function (migration 00003) to avoid recursive policy evaluation:

```sql
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT coalesce(
    (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('admin', 'super_admin'),
    false
  )
$$;
```

Fine-grained permission checks use `has_permission(code)` (migration 00008):

```sql
has_permission('catalog:write')   -- can write products
has_permission('cms:publish')     -- can publish CMS content
has_permission('orders:manage')   -- can update orders
```

---

## Policy Matrix

| Table | Anon | Customer | Admin |
|---|---|---|---|
| `profiles` | — | Own row (R/U) | All rows (R) |
| `categories` | Active (R) | Active (R) | All (CRUD) |
| `products` | Active (R) | Active (R) | All (CRUD) |
| `product_variants` | Active (R) | Active (R) | All (CRUD) |
| `product_images` | All (R) | All (R) | All (CRUD) |
| `inventory` | All (R) | All (R) | All (CRUD) |
| `inventory_levels` | All (R) | All (R) | All (CRUD) |
| `addresses` | — | Own rows (CRUD) | — |
| `carts` | — | Own row (CRUD) | — |
| `cart_items` | — | Own cart items (CRUD) | — |
| `wishlists` | — | Own rows (CRUD) | — |
| `coupons` | Active (R) | Active (R) | All (CRUD) |
| `orders` | — | Own rows (R) | All (CRUD) |
| `order_items` | — | Own order items (R) | All (CRUD) |
| `order_status_history` | — | Own order history (R) | All (CRUD) |
| `payments` | — | Own payments (R) | All (CRUD) |
| `payment_events` | — | — | R only |
| `shipment_tracking` | — | Own shipments (R) | All (CRUD) |
| `return_requests` | — | Own returns (CRUD) | All (CRUD) |
| `return_items` | — | Own return items (R) | All (CRUD) |
| `refund_requests` | — | Own refunds (CRUD) | All (CRUD) |
| `refund_items` | — | Own refund items (R) | All (CRUD) |
| `reviews` | Approved (R) | Own (insert/update) | All (CRUD) |
| `review_votes` | — | Own (CRUD) | R |
| `cms_pages` | Active (R) | Active (R) | All (CRUD) |
| `localized_cms_pages` | Active (R) | Active (R) | All (CRUD) |
| `localized_homepage_sections` | Active (R) | Active (R) | All (CRUD) |
| `cms_page_versions` | — | — | All (CRUD) |
| `cms_blocks` | Active published (R) | Active published (R) | All (CRUD) |
| `cms_navigation_menus` | Active (R) | Active (R) | All (CRUD) |
| `cms_navigation_items` | Active (R) | Active (R) | All (CRUD) |
| `cms_banners` | Active+valid (R) | Active+valid (R) | All (CRUD) |
| `price_lists` | Active (R) | Active (R) | All (CRUD) |
| `product_prices` | All (R) | All (R) | All (CRUD) |
| `variant_prices` | All (R) | All (R) | All (CRUD) |
| `brands` | Active (R) | Active (R) | All (CRUD) |
| `collections` | Active (R) | Active (R) | All (CRUD) |
| `currencies` | All (R) | All (R) | All (CRUD) |
| `languages` | All (R) | All (R) | Admin only (write) |
| `countries` | Active (R) | Active (R) | Admin only (write) |
| `locales` | Active (R) | Active (R) | Admin only (write) |
| `region_configs` | All (R) | All (R) | Admin only (write) |
| `warehouses` | Active (R) | Active (R) | All (CRUD) |
| `shipping_methods` | Active (R) | Active (R) | All (CRUD) |
| `media_assets` | Auth (R) | Auth (R) | All (CRUD) |
| `admin_action_logs` | — | — | R only (no delete) |
| `coupon_usage` | — | Own rows (R) | R only |
| `idempotency_keys` | — | — | Service role only |
| `checkout_sessions` | — | Own rows (CRUD) | All (CRUD) |
| `roles` | — | — | R only |
| `permissions` | — | — | R only |
| `user_roles` | — | — | All (CRUD) |

---

## Critical Security Rules

### Customers CANNOT:
- Set `payments.status = 'succeeded'` directly (only webhooks via service role)
- Update `inventory.quantity` or `inventory.reserved` directly
- Write to `order_status_history`
- Access other users' orders, carts, or profiles
- Read draft CMS content (only `is_active = true` rows)
- Access `admin_action_logs`, `payment_events`, or `idempotency_keys`

### Payments flow is server-only:
Payment status changes **only** happen via:
1. Stripe/Razorpay webhook → `POST /api/webhooks/[provider]` → service role client → `UPDATE payments SET status = ...`
2. COD → `update_order_status()` function called server-side

No frontend mutation can mark a payment as `succeeded`.

### Order mutations are atomic:
`create_order_atomic()` runs inside a single transaction: inventory reservation, order creation, coupon consumption, and status history — all succeed or all roll back.

`update_order_status()` enforces the state machine and triggers inventory side-effects (release on cancel, commit on deliver).

---

## RLS Performance Notes

- `is_admin()` is `STABLE` and `SECURITY DEFINER` — PostgreSQL caches the result within a query
- Avoid `EXISTS (SELECT 1 FROM profiles ...)` in policy bodies — causes recursive policy evaluation (fixed in migration 00003)
- All FK columns used in RLS join conditions have indexes
- `auth.uid()` is O(1) — safe to use in high-traffic policies
