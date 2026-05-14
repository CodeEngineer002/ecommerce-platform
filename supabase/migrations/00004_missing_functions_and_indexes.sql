-- ============================================================
-- MISSING FUNCTIONS
-- These were called in application code but absent from migrations.
-- A fresh deployment would fail silently without them.
-- ============================================================

-- Atomically reserve inventory for an order item.
-- Returns an error if insufficient stock exists, which the application
-- uses as the rollback signal.
create or replace function public.reserve_inventory(
  p_variant_id uuid,
  p_quantity    integer
)
returns void
language plpgsql
as $$
declare
  v_available integer;
begin
  -- Lock the row to prevent concurrent over-sells
  select (quantity - reserved)
    into v_available
    from public.inventory
   where variant_id = p_variant_id
     for update;

  if v_available is null then
    raise exception 'Inventory record not found for variant %', p_variant_id
      using errcode = 'P0002';
  end if;

  if v_available < p_quantity then
    raise exception 'Insufficient stock: % available, % requested', v_available, p_quantity
      using errcode = 'P0001';
  end if;

  update public.inventory
     set reserved = reserved + p_quantity
   where variant_id = p_variant_id;
end;
$$;

-- Release previously reserved inventory (called on order cancellation/refund).
create or replace function public.release_inventory(
  p_variant_id uuid,
  p_quantity    integer
)
returns void
language plpgsql
as $$
begin
  update public.inventory
     set reserved = greatest(0, reserved - p_quantity)
   where variant_id = p_variant_id;
end;
$$;

-- Confirm reserved stock as sold (called after successful delivery).
-- Decrements both quantity and reserved to keep the numbers in sync.
create or replace function public.confirm_inventory_sale(
  p_variant_id uuid,
  p_quantity    integer
)
returns void
language plpgsql
as $$
begin
  update public.inventory
     set quantity = quantity - p_quantity,
         reserved = greatest(0, reserved - p_quantity)
   where variant_id = p_variant_id;
end;
$$;

-- Atomically increment a coupon's used_count.
-- Using a dedicated function avoids race conditions from read-modify-write patterns.
create or replace function public.increment_coupon_usage(
  p_coupon_id uuid
)
returns void
language plpgsql
as $$
begin
  update public.coupons
     set used_count = used_count + 1
   where id = p_coupon_id;
end;
$$;


-- ============================================================
-- MISSING INDEXES
-- High-traffic query paths that lacked index coverage.
-- ============================================================

-- inventory.variant_id — every availability check hits this
create index if not exists idx_inventory_variant_id
  on public.inventory(variant_id);

-- product_variants.is_active — filtered in storefront product queries
create index if not exists idx_product_variants_is_active
  on public.product_variants(is_active);

-- cart_items.variant_id — used when checking if item is in cart
create index if not exists idx_cart_items_variant_id
  on public.cart_items(variant_id);

-- wishlists.product_id — used to check/display wishlist state per product
create index if not exists idx_wishlists_product_id
  on public.wishlists(product_id);

-- reviews.is_approved — public-facing reviews always filter by this
create index if not exists idx_reviews_is_approved
  on public.reviews(is_approved);

-- reviews composite — most common query: approved reviews for a product
create index if not exists idx_reviews_product_approved
  on public.reviews(product_id, is_approved)
  where is_approved = true;

-- coupons.code — every coupon validation does a lookup by code
create unique index if not exists idx_coupons_code
  on public.coupons(upper(code));

-- payments.status — admin and webhook queries filter by payment status
create index if not exists idx_payments_status
  on public.payments(status);

-- profiles.email — auth layer lookups
create index if not exists idx_profiles_email
  on public.profiles(email);

-- order_items.variant_id — used in analytics / returns lookups
create index if not exists idx_order_items_variant_id
  on public.order_items(variant_id);
