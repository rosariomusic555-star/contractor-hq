-- ContractorHQ — Product Catalog: a global, curated library of real
-- manufacturer products (Techo-Bloc, Belgard, Keystone, Unilock, Cambridge
-- Pavers, …) with verified specs, browsable from the Materials Sheet's
-- item picker alongside (not merged with) the contractor's own Price
-- Book. Run AFTER 0001-0035.
--
-- Unlike every other table in this app, this one has NO user_id and NO
-- write policy at all — it's shared, read-only-from-the-app data. The
-- contractor doesn't populate this; it's maintained by hand (migrations /
-- SQL editor), same workflow as every migration in this project already
-- uses, just applied to ongoing catalog upkeep instead of one-time schema
-- changes.

create table public.product_catalog (
  id            uuid primary key default gen_random_uuid(),
  manufacturer  text not null,
  category      text not null,
  name          text not null,
  sku           text,
  unit          text,
  specs         jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index on public.product_catalog (manufacturer);
create index on public.product_catalog (category);

alter table public.product_catalog enable row level security;

-- Read-only for every signed-in user — no insert/update/delete policy at
-- all, so even the app itself can never write here.
create policy "read" on public.product_catalog for select to authenticated using (true);

revoke all on public.product_catalog from anon;

-- One remembered price per (user, catalog product) — set via the "Remember
-- this price for next time" toggle when a contractor picks a catalog
-- product and enters their own cost (the catalog itself carries no
-- pricing). Composite primary key doubles as the uniqueness constraint the
-- upsert relies on.
create table public.catalog_price_overrides (
  user_id             uuid not null default auth.uid() references auth.users (id) on delete cascade,
  catalog_product_id  uuid not null references public.product_catalog (id) on delete cascade,
  price               numeric not null,
  updated_at          timestamptz not null default now(),
  primary key (user_id, catalog_product_id)
);

alter table public.catalog_price_overrides enable row level security;

create policy "own" on public.catalog_price_overrides for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

revoke all on public.catalog_price_overrides from anon;

-- Materials Sheet lines gain a second, independent kind of link alongside
-- price_book_item_id — a line is ever linked to at most one of the two.
-- Picking a catalog product sets catalog_product_id and leaves
-- price_book_item_id null (and vice versa for a Price Book pick).
-- on delete set null: deleting a catalog product later just unlinks any
-- line that referenced it, same never-block-never-lose-data pattern as
-- every other reference in this schema.
alter table public.materials_items
  add column if not exists catalog_product_id uuid references public.product_catalog (id) on delete set null;

create index if not exists materials_items_catalog_product_id_idx
  on public.materials_items (catalog_product_id);

-- Waste % applies to every line regardless of source (catalog, price
-- book, or manual) — not part of the quantity*unit_cost math, a plain
-- reference figure the contractor can log per line.
alter table public.materials_items
  add column if not exists waste_percent numeric not null default 0;
