-- ============================================================
-- ENUMS
-- ============================================================
create type public.user_role as enum ('customer', 'admin', 'super_admin');
create type public.order_status as enum (
  'pending', 'confirmed', 'processing', 'shipped',
  'delivered', 'cancelled', 'refunded'
);
create type public.payment_status as enum (
  'pending', 'processing', 'succeeded', 'failed', 'refunded', 'cancelled'
);
create type public.payment_provider as enum ('stripe', 'razorpay', 'cod');
create type public.inventory_movement_type as enum (
  'purchase', 'sale', 'return', 'adjustment', 'transfer'
);
create type public.section_type as enum (
  'hero_banner', 'featured_products', 'promotional_banner',
  'category_grid', 'testimonials', 'newsletter'
);

-- ============================================================
-- PROFILES (extends auth.users)
-- ============================================================
create table public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text not null,
  full_name    text,
  avatar_url   text,
  phone        text,
  role         public.user_role not null default 'customer',
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

create policy "Admins can view all profiles"
  on public.profiles for select
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('admin', 'super_admin')
    )
  );

-- ============================================================
-- CATEGORIES
-- ============================================================
create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  description text,
  image_url   text,
  parent_id   uuid references public.categories(id) on delete set null,
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  seo_title   text,
  seo_desc    text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.categories enable row level security;

create policy "Anyone can view active categories"
  on public.categories for select
  using (is_active = true);

create policy "Admins manage categories"
  on public.categories for all
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('admin', 'super_admin')
    )
  );

create index idx_categories_slug on public.categories(slug);
create index idx_categories_parent_id on public.categories(parent_id);

-- ============================================================
-- PRODUCTS
-- ============================================================
create table public.products (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  slug          text not null unique,
  description   text,
  short_desc    text,
  category_id   uuid references public.categories(id) on delete set null,
  base_price    numeric(12, 2) not null,
  compare_price numeric(12, 2),
  cost_price    numeric(12, 2),
  sku           text unique,
  barcode       text,
  is_active     boolean not null default true,
  is_featured   boolean not null default false,
  is_digital    boolean not null default false,
  weight        numeric(8, 3),
  tags          text[] default '{}',
  seo_title     text,
  seo_desc      text,
  meta_image    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.products enable row level security;

create policy "Anyone can view active products"
  on public.products for select
  using (is_active = true);

create policy "Admins manage products"
  on public.products for all
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('admin', 'super_admin')
    )
  );

create index idx_products_slug on public.products(slug);
create index idx_products_category_id on public.products(category_id);
create index idx_products_is_active on public.products(is_active);
create index idx_products_is_featured on public.products(is_featured);
create index idx_products_tags on public.products using gin(tags);
create index idx_products_fts on public.products
  using gin(to_tsvector('english', name || ' ' || coalesce(description, '')));

-- ============================================================
-- PRODUCT VARIANTS
-- ============================================================
create table public.product_variants (
  id         uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  name       text not null,
  sku        text unique,
  price      numeric(12, 2),
  options    jsonb not null default '{}',
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.product_variants enable row level security;

create policy "Anyone can view active variants"
  on public.product_variants for select
  using (is_active = true);

create policy "Admins manage variants"
  on public.product_variants for all
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('admin', 'super_admin')
    )
  );

create index idx_product_variants_product_id on public.product_variants(product_id);

-- ============================================================
-- PRODUCT IMAGES
-- ============================================================
create table public.product_images (
  id         uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  url        text not null,
  alt_text   text,
  sort_order integer not null default 0,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.product_images enable row level security;

create policy "Anyone can view product images"
  on public.product_images for select using (true);

create policy "Admins manage product images"
  on public.product_images for all
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('admin', 'super_admin')
    )
  );

create index idx_product_images_product_id on public.product_images(product_id);

-- ============================================================
-- INVENTORY
-- ============================================================
create table public.inventory (
  id         uuid primary key default gen_random_uuid(),
  variant_id uuid not null references public.product_variants(id) on delete cascade,
  quantity   integer not null default 0,
  reserved   integer not null default 0,
  updated_at timestamptz not null default now(),
  unique(variant_id)
);

alter table public.inventory enable row level security;

create policy "Anyone can view inventory quantities"
  on public.inventory for select using (true);

create policy "Admins manage inventory"
  on public.inventory for all
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('admin', 'super_admin')
    )
  );

create table public.inventory_movements (
  id            uuid primary key default gen_random_uuid(),
  variant_id    uuid not null references public.product_variants(id) on delete cascade,
  type          public.inventory_movement_type not null,
  quantity      integer not null,
  reference_id  uuid,
  note          text,
  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now()
);

alter table public.inventory_movements enable row level security;

create policy "Admins manage inventory movements"
  on public.inventory_movements for all
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('admin', 'super_admin')
    )
  );

create index idx_inventory_movements_variant_id on public.inventory_movements(variant_id);

-- ============================================================
-- ADDRESSES
-- ============================================================
create table public.addresses (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  label         text,
  full_name     text not null,
  phone         text,
  address_line1 text not null,
  address_line2 text,
  city          text not null,
  state         text not null,
  postal_code   text not null,
  country       text not null default 'IN',
  is_default    boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.addresses enable row level security;

create policy "Users manage own addresses"
  on public.addresses for all
  using (auth.uid() = user_id);

create index idx_addresses_user_id on public.addresses(user_id);

-- ============================================================
-- CARTS
-- ============================================================
create table public.carts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users(id) on delete cascade,
  session_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cart_owner check (user_id is not null or session_id is not null)
);

alter table public.carts enable row level security;

create policy "Users manage own cart"
  on public.carts for all
  using (auth.uid() = user_id);

create index idx_carts_user_id on public.carts(user_id);
create index idx_carts_session_id on public.carts(session_id);

create table public.cart_items (
  id         uuid primary key default gen_random_uuid(),
  cart_id    uuid not null references public.carts(id) on delete cascade,
  variant_id uuid not null references public.product_variants(id) on delete cascade,
  quantity   integer not null check (quantity > 0),
  added_at   timestamptz not null default now(),
  unique(cart_id, variant_id)
);

alter table public.cart_items enable row level security;

create policy "Cart items follow cart ownership"
  on public.cart_items for all
  using (
    exists (
      select 1 from public.carts
      where id = cart_id and user_id = auth.uid()
    )
  );

create index idx_cart_items_cart_id on public.cart_items(cart_id);

-- ============================================================
-- WISHLISTS
-- ============================================================
create table public.wishlists (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  added_at   timestamptz not null default now(),
  unique(user_id, product_id)
);

alter table public.wishlists enable row level security;

create policy "Users manage own wishlist"
  on public.wishlists for all
  using (auth.uid() = user_id);

create index idx_wishlists_user_id on public.wishlists(user_id);

-- ============================================================
-- COUPONS
-- ============================================================
create table public.coupons (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique,
  description     text,
  type            text not null check (type in ('percentage', 'fixed')),
  value           numeric(12, 2) not null,
  min_order_value numeric(12, 2),
  max_discount    numeric(12, 2),
  usage_limit     integer,
  used_count      integer not null default 0,
  is_active       boolean not null default true,
  valid_from      timestamptz not null default now(),
  valid_until     timestamptz,
  created_at      timestamptz not null default now()
);

alter table public.coupons enable row level security;

create policy "Anyone can view active coupons"
  on public.coupons for select
  using (is_active = true);

create policy "Admins manage coupons"
  on public.coupons for all
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('admin', 'super_admin')
    )
  );

-- ============================================================
-- ORDERS
-- ============================================================
create table public.orders (
  id               uuid primary key default gen_random_uuid(),
  order_number     text not null unique,
  user_id          uuid references auth.users(id) on delete set null,
  status           public.order_status not null default 'pending',
  subtotal         numeric(12, 2) not null,
  tax              numeric(12, 2) not null default 0,
  shipping         numeric(12, 2) not null default 0,
  discount         numeric(12, 2) not null default 0,
  total            numeric(12, 2) not null,
  coupon_id        uuid references public.coupons(id),
  shipping_address jsonb not null,
  billing_address  jsonb,
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table public.orders enable row level security;

create policy "Users view own orders"
  on public.orders for select
  using (auth.uid() = user_id);

create policy "Admins manage all orders"
  on public.orders for all
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('admin', 'super_admin')
    )
  );

create index idx_orders_user_id on public.orders(user_id);
create index idx_orders_status on public.orders(status);
create index idx_orders_created_at on public.orders(created_at desc);
create index idx_orders_order_number on public.orders(order_number);

create table public.order_items (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references public.orders(id) on delete cascade,
  variant_id   uuid references public.product_variants(id) on delete set null,
  product_name text not null,
  variant_name text,
  sku          text,
  quantity     integer not null,
  unit_price   numeric(12, 2) not null,
  total        numeric(12, 2) not null,
  snapshot     jsonb
);

alter table public.order_items enable row level security;

create policy "Order items follow order ownership"
  on public.order_items for select
  using (
    exists (
      select 1 from public.orders
      where id = order_id and user_id = auth.uid()
    )
  );

create policy "Admins manage order items"
  on public.order_items for all
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('admin', 'super_admin')
    )
  );

create index idx_order_items_order_id on public.order_items(order_id);

-- ============================================================
-- PAYMENTS
-- ============================================================
create table public.payments (
  id                  uuid primary key default gen_random_uuid(),
  order_id            uuid not null references public.orders(id) on delete cascade,
  provider            public.payment_provider not null,
  provider_payment_id text,
  provider_order_id   text,
  status              public.payment_status not null default 'pending',
  amount              numeric(12, 2) not null,
  currency            text not null default 'INR',
  metadata            jsonb default '{}',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

alter table public.payments enable row level security;

create policy "Users view own payments"
  on public.payments for select
  using (
    exists (
      select 1 from public.orders
      where id = order_id and user_id = auth.uid()
    )
  );

create policy "Admins manage payments"
  on public.payments for all
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('admin', 'super_admin')
    )
  );

create index idx_payments_order_id on public.payments(order_id);
create index idx_payments_provider_payment_id on public.payments(provider_payment_id);

-- ============================================================
-- REVIEWS
-- ============================================================
create table public.reviews (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  rating      integer not null check (rating between 1 and 5),
  title       text,
  body        text,
  is_verified boolean not null default false,
  is_approved boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique(product_id, user_id)
);

alter table public.reviews enable row level security;

create policy "Anyone can view approved reviews"
  on public.reviews for select
  using (is_approved = true);

create policy "Users manage own reviews"
  on public.reviews for insert
  with check (auth.uid() = user_id);

create policy "Users update own reviews"
  on public.reviews for update
  using (auth.uid() = user_id);

create policy "Admins manage all reviews"
  on public.reviews for all
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('admin', 'super_admin')
    )
  );

create index idx_reviews_product_id on public.reviews(product_id);
create index idx_reviews_user_id on public.reviews(user_id);

-- ============================================================
-- CMS PAGES
-- ============================================================
create table public.cms_pages (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  slug       text not null unique,
  content    text,
  seo_title  text,
  seo_desc   text,
  is_active  boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.cms_pages enable row level security;

create policy "Anyone can view active pages"
  on public.cms_pages for select
  using (is_active = true);

create policy "Admins manage cms pages"
  on public.cms_pages for all
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('admin', 'super_admin')
    )
  );

-- ============================================================
-- HOMEPAGE SECTIONS
-- ============================================================
create table public.homepage_sections (
  id         uuid primary key default gen_random_uuid(),
  type       public.section_type not null,
  title      text,
  subtitle   text,
  content    jsonb not null default '{}',
  sort_order integer not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.homepage_sections enable row level security;

create policy "Anyone can view active sections"
  on public.homepage_sections for select
  using (is_active = true);

create policy "Admins manage homepage sections"
  on public.homepage_sections for all
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('admin', 'super_admin')
    )
  );

-- ============================================================
-- UTILITY FUNCTIONS
-- ============================================================

-- Auto-update updated_at
create or replace function public.handle_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger on_profiles_update
  before update on public.profiles
  for each row execute procedure public.handle_updated_at();

create trigger on_categories_update
  before update on public.categories
  for each row execute procedure public.handle_updated_at();

create trigger on_products_update
  before update on public.products
  for each row execute procedure public.handle_updated_at();

create trigger on_product_variants_update
  before update on public.product_variants
  for each row execute procedure public.handle_updated_at();

create trigger on_addresses_update
  before update on public.addresses
  for each row execute procedure public.handle_updated_at();

create trigger on_orders_update
  before update on public.orders
  for each row execute procedure public.handle_updated_at();

create trigger on_payments_update
  before update on public.payments
  for each row execute procedure public.handle_updated_at();

create trigger on_reviews_update
  before update on public.reviews
  for each row execute procedure public.handle_updated_at();

create trigger on_cms_pages_update
  before update on public.cms_pages
  for each row execute procedure public.handle_updated_at();

create trigger on_homepage_sections_update
  before update on public.homepage_sections
  for each row execute procedure public.handle_updated_at();

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Generate unique order number
create or replace function public.generate_order_number()
returns text language plpgsql as $$
declare
  v_number text;
begin
  v_number := 'ORD-' || to_char(now(), 'YYYYMMDD') || '-' ||
              upper(substring(gen_random_uuid()::text from 1 for 6));
  return v_number;
end;
$$;

-- Available inventory (quantity - reserved)
create or replace function public.available_inventory(p_variant_id uuid)
returns integer language sql stable as $$
  select coalesce(quantity, 0) - coalesce(reserved, 0)
  from public.inventory
  where variant_id = p_variant_id;
$$;

-- Product average rating
create or replace function public.product_avg_rating(p_product_id uuid)
returns numeric language sql stable as $$
  select round(avg(rating)::numeric, 1)
  from public.reviews
  where product_id = p_product_id and is_approved = true;
$$;
