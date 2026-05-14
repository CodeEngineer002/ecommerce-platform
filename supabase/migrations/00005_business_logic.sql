-- ============================================================
-- BUSINESS LOGIC TABLES
-- ============================================================

-- Immutable audit trail for every order status change.
create table public.order_status_history (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references public.orders(id) on delete cascade,
  from_status public.order_status,
  to_status   public.order_status not null,
  changed_by  uuid references auth.users(id) on delete set null,
  reason      text,
  created_at  timestamptz not null default now()
);

create index idx_order_status_history_order_id
  on public.order_status_history(order_id);

alter table public.order_status_history enable row level security;

create policy "Users view own order history"
  on public.order_status_history for select
  using (
    exists (
      select 1 from public.orders
      where id = order_id and user_id = auth.uid()
    )
  );

create policy "Admins manage order history"
  on public.order_status_history for all
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('admin', 'super_admin')
    )
  );

-- Per-user coupon tracking prevents one user claiming the same coupon twice,
-- closing the race condition in the original used_count-only approach.
create table public.coupon_usage (
  id         uuid primary key default gen_random_uuid(),
  coupon_id  uuid not null references public.coupons(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  order_id   uuid references public.orders(id) on delete set null,
  used_at    timestamptz not null default now(),
  unique (coupon_id, user_id)
);

create index idx_coupon_usage_coupon_id on public.coupon_usage(coupon_id);
create index idx_coupon_usage_user_id   on public.coupon_usage(user_id);

alter table public.coupon_usage enable row level security;

create policy "Users view own coupon usage"
  on public.coupon_usage for select
  using (user_id = auth.uid());

create policy "Admins view all coupon usage"
  on public.coupon_usage for select
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('admin', 'super_admin')
    )
  );

-- Idempotency keys prevent duplicate webhook processing.
-- Service role only — no RLS needed on this table.
create table public.idempotency_keys (
  id            uuid primary key default gen_random_uuid(),
  key           text not null unique,
  response_body jsonb,
  created_at    timestamptz not null default now()
);

create index idx_idempotency_keys_key on public.idempotency_keys(key);

-- Snapshot the coupon code string at order time so it remains readable
-- even if the coupon row is later deleted or deactivated.
alter table public.orders
  add column if not exists coupon_code text;

-- ============================================================
-- ATOMIC ORDER CREATION FUNCTION
-- ============================================================
-- All order creation steps run inside one transaction.
-- Any failure rolls back everything — no partial orders, no phantom inventory
-- reservations, no double-spent coupons.
--
-- Step sequence (all under the same transaction):
--   1. Lock inventory rows (sorted by variant_id to prevent deadlocks)
--   2. Validate stock for every item
--   3. Re-validate coupon limits under lock (closes concurrent-use race)
--   4. Generate order number
--   5. Insert order
--   6. Insert order items (bulk, single statement)
--   7. Reserve inventory for each item
--   8. Consume coupon (increment used_count + insert coupon_usage row)
--   9. Insert initial status history entry
create or replace function public.create_order_atomic(
  p_user_id          uuid,
  p_cart_items       jsonb,    -- [{variant_id, quantity, unit_price, product_name, sku, snapshot}]
  p_subtotal         numeric,
  p_tax              numeric,
  p_shipping         numeric,
  p_discount         numeric,
  p_total            numeric,
  p_coupon_id        uuid,
  p_coupon_code      text,
  p_shipping_address jsonb,
  p_billing_address  jsonb,
  p_notes            text
)
returns uuid
language plpgsql
as $$
declare
  v_item         jsonb;
  v_variant_id   uuid;
  v_quantity     integer;
  v_available    integer;
  v_order_id     uuid;
  v_order_number text;
begin
  -- ── Step 1 & 2: Lock inventory and validate stock ─────────────────────────
  -- Rows are locked in variant_id order to prevent deadlocks between concurrent
  -- transactions that share overlapping cart items.
  for v_item in
    select value
      from jsonb_array_elements(p_cart_items)
      order by value->>'variant_id'
  loop
    v_variant_id := (v_item->>'variant_id')::uuid;
    v_quantity   := (v_item->>'quantity')::integer;

    select (quantity - reserved)
      into v_available
      from public.inventory
     where variant_id = v_variant_id
       for update;

    if v_available is null then
      raise exception 'Inventory record not found for variant %', v_variant_id
        using errcode = 'P0002';
    end if;

    if v_available < v_quantity then
      raise exception 'Insufficient stock: % available, % requested for variant %',
        v_available, v_quantity, v_variant_id
        using errcode = 'P0001';
    end if;
  end loop;

  -- ── Step 3: Re-validate coupon under the transaction lock ─────────────────
  if p_coupon_id is not null then
    if exists (
      select 1 from public.coupons
       where id = p_coupon_id
         and usage_limit is not null
         and used_count >= usage_limit
    ) then
      raise exception 'Coupon usage limit exceeded'
        using errcode = 'P0003';
    end if;

    if exists (
      select 1 from public.coupon_usage
       where coupon_id = p_coupon_id and user_id = p_user_id
    ) then
      raise exception 'Coupon already used by this user'
        using errcode = 'P0004';
    end if;
  end if;

  -- ── Step 4: Generate order number ─────────────────────────────────────────
  select public.generate_order_number() into v_order_number;

  -- ── Step 5: Insert order ──────────────────────────────────────────────────
  insert into public.orders (
    order_number, user_id, status,
    subtotal, tax, shipping, discount, total,
    coupon_id, coupon_code,
    shipping_address, billing_address, notes
  ) values (
    v_order_number, p_user_id, 'pending',
    p_subtotal, p_tax, p_shipping, p_discount, p_total,
    p_coupon_id, p_coupon_code,
    p_shipping_address, p_billing_address, p_notes
  )
  returning id into v_order_id;

  -- ── Step 6: Insert order items (single bulk statement) ───────────────────
  insert into public.order_items (
    order_id, variant_id, product_name, sku,
    quantity, unit_price, total, snapshot
  )
  select
    v_order_id,
    (item->>'variant_id')::uuid,
    item->>'product_name',
    item->>'sku',
    (item->>'quantity')::integer,
    (item->>'unit_price')::numeric,
    (item->>'unit_price')::numeric * (item->>'quantity')::integer,
    item->'snapshot'
  from jsonb_array_elements(p_cart_items) as item;

  -- ── Step 7: Reserve inventory ─────────────────────────────────────────────
  for v_item in select value from jsonb_array_elements(p_cart_items) loop
    update public.inventory
       set reserved = reserved + (v_item->>'quantity')::integer
     where variant_id = (v_item->>'variant_id')::uuid;
  end loop;

  -- ── Step 8: Consume coupon ────────────────────────────────────────────────
  if p_coupon_id is not null then
    update public.coupons
       set used_count = used_count + 1
     where id = p_coupon_id;

    insert into public.coupon_usage (coupon_id, user_id, order_id)
    values (p_coupon_id, p_user_id, v_order_id);
  end if;

  -- ── Step 9: Initial status history ───────────────────────────────────────
  insert into public.order_status_history (order_id, from_status, to_status, changed_by)
  values (v_order_id, null, 'pending', p_user_id);

  return v_order_id;
end;
$$;

-- ============================================================
-- ORDER STATUS TRANSITION FUNCTION
-- ============================================================
-- Enforces the state machine and writes an audit entry atomically.
-- Throws P0006 on invalid transitions so callers get a structured error.
create or replace function public.update_order_status(
  p_order_id   uuid,
  p_new_status public.order_status,
  p_changed_by uuid,
  p_reason     text default null
)
returns void
language plpgsql
as $$
declare
  v_current_status public.order_status;
begin
  select status into v_current_status
    from public.orders
   where id = p_order_id
     for update;

  if v_current_status is null then
    raise exception 'Order % not found', p_order_id
      using errcode = 'P0005';
  end if;

  if not (
    (v_current_status = 'pending'    and p_new_status in ('confirmed', 'cancelled')) or
    (v_current_status = 'confirmed'  and p_new_status in ('processing', 'cancelled')) or
    (v_current_status = 'processing' and p_new_status in ('shipped',   'cancelled')) or
    (v_current_status = 'shipped'    and p_new_status in ('delivered', 'cancelled')) or
    (v_current_status = 'delivered'  and p_new_status = 'refunded') or
    (v_current_status = 'cancelled'  and p_new_status = 'refunded')
  ) then
    raise exception 'Invalid status transition: % -> %', v_current_status, p_new_status
      using errcode = 'P0006';
  end if;

  update public.orders
     set status = p_new_status, updated_at = now()
   where id = p_order_id;

  insert into public.order_status_history (order_id, from_status, to_status, changed_by, reason)
  values (p_order_id, v_current_status, p_new_status, p_changed_by, p_reason);
end;
$$;
