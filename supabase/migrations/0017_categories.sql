-- ContractorHQ — user-editable work categories (Settings > Categories),
-- used to tag quote line items and power "Revenue by category" on the
-- Money page (0019 adds quote_items.category_id; 0018 seeds new users).
-- Run AFTER 0001–0016.

create table if not exists public.categories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists categories_user_id_idx on public.categories (user_id);

alter table public.categories enable row level security;

drop policy if exists "own" on public.categories;
create policy "own" on public.categories for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

revoke all on public.categories from anon;
