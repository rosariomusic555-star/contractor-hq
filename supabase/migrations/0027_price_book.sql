-- ContractorHQ — user-owned saved material items (Settings > Price Book),
-- picked from the Materials Sheet to auto-fill a line item instead of
-- retyping the same materials on every job. Run AFTER 0001–0026.
--
-- Deliberately NOT seeded — these are specific to each contractor's own
-- suppliers and pricing, so any default list would just be wrong for
-- everyone. Starts empty for every user; they build their own from scratch.
--
-- expense_category_id is nullable here (not NOT NULL), matching the
-- on-delete-set-null pattern used everywhere else a row references
-- expense_categories (quote_items, materials_items) — "required" is
-- enforced in the Settings form (it won't let you save without picking
-- one), not as a DB constraint, so deleting a category never blocks or
-- errors here either; it just leaves a price book item uncategorized.

create table public.price_book (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name                 text not null,
  unit                 text,
  unit_price           numeric not null default 0,
  expense_category_id  uuid references public.expense_categories (id) on delete set null,
  created_at           timestamptz not null default now()
);

create index on public.price_book (user_id);
create index on public.price_book (expense_category_id);

alter table public.price_book enable row level security;

create policy "own" on public.price_book for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

revoke all on public.price_book from anon;
