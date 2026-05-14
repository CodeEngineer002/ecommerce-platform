-- Fix infinite recursion in RLS policies that query the profiles table.
-- All "admin check" policies used EXISTS (SELECT 1 FROM profiles ...) which
-- caused PostgreSQL to re-evaluate the profiles SELECT policy recursively.
-- Solution: a SECURITY DEFINER function that reads profiles bypassing RLS.

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (select role from public.profiles where id = auth.uid())
      in ('admin', 'super_admin'),
    false
  )
$$;

-- ── profiles ─────────────────────────────────────────────────────────────────
drop policy if exists "Admins can view all profiles" on public.profiles;
create policy "Admins can view all profiles"
  on public.profiles for select
  using (public.is_admin());

-- ── categories ───────────────────────────────────────────────────────────────
drop policy if exists "Admins manage categories" on public.categories;
create policy "Admins manage categories"
  on public.categories for all
  using (public.is_admin())
  with check (public.is_admin());

-- ── products ─────────────────────────────────────────────────────────────────
drop policy if exists "Admins manage products" on public.products;
create policy "Admins manage products"
  on public.products for all
  using (public.is_admin())
  with check (public.is_admin());

-- ── product_variants ─────────────────────────────────────────────────────────
drop policy if exists "Admins manage variants" on public.product_variants;
create policy "Admins manage variants"
  on public.product_variants for all
  using (public.is_admin())
  with check (public.is_admin());

-- ── product_images ───────────────────────────────────────────────────────────
drop policy if exists "Admins manage product images" on public.product_images;
create policy "Admins manage product images"
  on public.product_images for all
  using (public.is_admin())
  with check (public.is_admin());

-- ── inventory ────────────────────────────────────────────────────────────────
drop policy if exists "Admins manage inventory" on public.inventory;
create policy "Admins manage inventory"
  on public.inventory for all
  using (public.is_admin())
  with check (public.is_admin());

-- ── inventory_movements ──────────────────────────────────────────────────────
drop policy if exists "Admins manage inventory movements" on public.inventory_movements;
create policy "Admins manage inventory movements"
  on public.inventory_movements for all
  using (public.is_admin())
  with check (public.is_admin());

-- ── coupons ──────────────────────────────────────────────────────────────────
drop policy if exists "Admins manage coupons" on public.coupons;
create policy "Admins manage coupons"
  on public.coupons for all
  using (public.is_admin())
  with check (public.is_admin());

-- ── orders ───────────────────────────────────────────────────────────────────
drop policy if exists "Admins manage all orders" on public.orders;
create policy "Admins manage all orders"
  on public.orders for all
  using (public.is_admin())
  with check (public.is_admin());

-- ── order_items ──────────────────────────────────────────────────────────────
drop policy if exists "Admins manage order items" on public.order_items;
create policy "Admins manage order items"
  on public.order_items for all
  using (public.is_admin())
  with check (public.is_admin());

-- ── payments ─────────────────────────────────────────────────────────────────
drop policy if exists "Admins manage payments" on public.payments;
create policy "Admins manage payments"
  on public.payments for all
  using (public.is_admin())
  with check (public.is_admin());

-- ── reviews ──────────────────────────────────────────────────────────────────
drop policy if exists "Admins manage all reviews" on public.reviews;
create policy "Admins manage all reviews"
  on public.reviews for all
  using (public.is_admin())
  with check (public.is_admin());

-- ── cms_pages ────────────────────────────────────────────────────────────────
drop policy if exists "Admins manage cms pages" on public.cms_pages;
create policy "Admins manage cms pages"
  on public.cms_pages for all
  using (public.is_admin())
  with check (public.is_admin());

-- ── homepage_sections ────────────────────────────────────────────────────────
drop policy if exists "Admins manage homepage sections" on public.homepage_sections;
create policy "Admins manage homepage sections"
  on public.homepage_sections for all
  using (public.is_admin())
  with check (public.is_admin());
