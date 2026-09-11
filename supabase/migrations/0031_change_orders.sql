-- ContractorHQ — Change Orders: documented, approved-or-not adjustments to
-- a project's contract value, made after the original quote was accepted.
-- Run AFTER 0001-0030.
--
-- project_id is NOT NULL (unlike quotes/invoices, which can stand alone) —
-- a change order always belongs to exactly one project.
--
-- amount is signed on purpose: a change order can increase OR decrease the
-- contract (e.g. the client removes a feature). No positive-only check.
--
-- status starts 'pending' and can move freely between all three states
-- (including back from approved/rejected to pending, to correct mistakes)
-- — see src/lib/api.ts projectContractValue(), which only ever sums
-- APPROVED change orders. Because contract value is always derived live
-- from current status rather than stored/snapshotted anywhere, changing
-- status after the fact is always safe — there's nothing to keep in sync.

create table public.change_orders (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id     uuid not null references public.projects (id) on delete cascade,
  title          text not null,
  description    text,
  reason         text check (reason in ('client_request', 'site_condition', 'code_requirement', 'design_change', 'other')),
  amount         numeric not null,
  status         text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  approved_at    timestamptz,
  created_at     timestamptz not null default now()
);

create index on public.change_orders (project_id);
create index on public.change_orders (user_id);

alter table public.change_orders enable row level security;

create policy "own" on public.change_orders for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

revoke all on public.change_orders from anon;

-- Optional photo attachment (not built yet — reuses the existing "images"
-- Storage bucket with a path prefix, e.g. "change-orders/…", same
-- convention as quote-items/ and projects/). Table created now so a future
-- migration isn't needed just to add the feature.
create table public.change_order_images (
  id               uuid primary key default gen_random_uuid(),
  change_order_id  uuid not null references public.change_orders (id) on delete cascade,
  storage_path     text not null,
  sort_order       integer not null default 0,
  created_at       timestamptz not null default now()
);

create index on public.change_order_images (change_order_id);

alter table public.change_order_images enable row level security;

create policy "own via change_orders" on public.change_order_images for all to authenticated
  using (exists (select 1 from public.change_orders co where co.id = change_order_id and co.user_id = auth.uid()))
  with check (exists (select 1 from public.change_orders co where co.id = change_order_id and co.user_id = auth.uid()));

revoke all on public.change_order_images from anon;
