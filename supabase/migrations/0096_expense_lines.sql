-- ContractorHQ — split one expense across several categories. Run AFTER 0095.
--
-- A big supplier shipment can cover pavers, base gravel, poly sand… An
-- expense with rows here is "split": each line carries its own category,
-- amount and optional description, and every category rollup (Expenses
-- page filters/counts, the AI assistant's list_expenses) uses these line
-- amounts. An expense with no lines keeps working exactly as before —
-- expenses.expense_category_id + expenses.amount.
--
-- Lines needn't sum exactly to the expense total (the app warns and offers
-- to put the remainder in the last line); any unallocated remainder counts
-- as Uncategorized.

create table if not exists public.expense_lines (
  id                  uuid primary key default gen_random_uuid(),
  expense_id          uuid not null references public.expenses (id) on delete cascade,
  expense_category_id uuid references public.expense_categories (id) on delete set null,
  amount              numeric not null default 0,
  description         text,
  sort_order          int not null default 0,
  created_at          timestamptz not null default now()
);

create index if not exists expense_lines_expense_id_idx on public.expense_lines (expense_id);

alter table public.expense_lines enable row level security;

drop policy if exists "own" on public.expense_lines;
create policy "own" on public.expense_lines for all to authenticated
  using (exists (select 1 from public.expenses e where e.id = expense_id and e.user_id = auth.uid()))
  with check (exists (select 1 from public.expenses e where e.id = expense_id and e.user_id = auth.uid()));

revoke all on public.expense_lines from anon;
