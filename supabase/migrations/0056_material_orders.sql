-- ContractorHQ — Material Orders + Deliveries (Dashboard hardscape pass,
-- part 3). Run AFTER 0001-0055.
--
-- A crew standing around waiting on a pallet is the most expensive thing
-- that happens on a hardscape job — this tracks what's been ordered, from
-- whom, and when it's due, per project. Same parent+child shape as change
-- orders (0031): material_orders (order-level: supplier, delivery date,
-- status) + material_order_items (line items: description/quantity/unit).
--
-- project_id is NOT NULL — like change orders, an order always belongs to
-- exactly one project (there's no "standalone" material order).

create table public.material_orders (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id             uuid not null references public.projects (id) on delete cascade,
  supplier               text,
  expected_delivery_date date,
  status                 text not null default 'ordered'
                           check (status in ('ordered', 'delivered', 'delayed')),
  notes                  text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index on public.material_orders (project_id);
create index on public.material_orders (user_id);

create trigger material_orders_set_updated_at before update on public.material_orders
  for each row execute function public.set_updated_at();

alter table public.material_orders enable row level security;

create policy "own" on public.material_orders for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

revoke all on public.material_orders from anon;

create table public.material_order_items (
  id                uuid primary key default gen_random_uuid(),
  material_order_id uuid not null references public.material_orders (id) on delete cascade,
  description        text not null,
  quantity            numeric not null default 0,
  unit                text not null default 'each'
                        check (unit in ('pallet', 'ton', 'cubic_yard', 'bag', 'linear_foot', 'each')),
  sort_order          integer not null default 0
);

create index on public.material_order_items (material_order_id);

alter table public.material_order_items enable row level security;

create policy "own via material_orders" on public.material_order_items for all to authenticated
  using (exists (select 1 from public.material_orders mo where mo.id = material_order_id and mo.user_id = auth.uid()))
  with check (exists (select 1 from public.material_orders mo where mo.id = material_order_id and mo.user_id = auth.uid()));

revoke all on public.material_order_items from anon;
