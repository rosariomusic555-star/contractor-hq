-- ContractorHQ — user-editable expense/cost categories (Settings > Expense
-- categories), used to tag expenses and Materials Sheet line items.
--
-- Deliberately a SEPARATE table from `categories` (0017) — that table is
-- work-type tags for quote line items (Paver Patio, Outdoor Kitchen…),
-- driving revenue-by-category. This one is cost-tracking tags (Pavers,
-- Base material, Labor…). No FK or shared rows between them.
--
-- Run AFTER 0001–0019.

create table if not exists public.expense_categories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists expense_categories_user_id_idx on public.expense_categories (user_id);

alter table public.expense_categories enable row level security;

drop policy if exists "own" on public.expense_categories;
create policy "own" on public.expense_categories for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

revoke all on public.expense_categories from anon;
