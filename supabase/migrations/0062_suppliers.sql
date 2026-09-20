-- ContractorHQ — per-contractor supplier list, for the Supplier combobox on
-- Material orders (0056). Run AFTER 0061.
--
-- A supplier is who the contractor buys from (a local yard/distributor) —
-- deliberately separate from Product Catalog manufacturers (0036-0037,
-- Techo-Bloc/Belgard/…), which is who makes the product. Same name
-- sometimes, different concept, so this is its own table, not wired to the
-- catalog.
--
-- material_orders.supplier stays a plain denormalized text column (see
-- src/lib/api.ts) — this table is purely the combobox's source of truth +
-- contact info + most-recently-used ordering, not a foreign key
-- material_orders points at. That means deleting a supplier here never
-- alters existing delivery records; they keep whatever name they were
-- saved with.

create table public.suppliers (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name         text not null,
  phone        text,
  email        text,
  address      text,
  last_used_at timestamptz,
  created_at   timestamptz not null default now(),
  unique (user_id, name)
);

create index on public.suppliers (user_id);

alter table public.suppliers enable row level security;

create policy "own" on public.suppliers for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

revoke all on public.suppliers from anon;

-- Seed from suppliers already typed into existing delivery records, so
-- nobody starts from an empty list. last_used_at backfilled from the
-- newest order that used each name, so the seeded list is already in a
-- sensible most-recently-used order on day one.
insert into public.suppliers (user_id, name, last_used_at)
select user_id, trim(supplier), max(created_at)
from public.material_orders
where supplier is not null and trim(supplier) <> ''
group by user_id, trim(supplier)
on conflict (user_id, name) do nothing;
