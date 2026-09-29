-- ContractorHQ — Expenses get a vendor, notes and a receipt photo (job costs
-- view). Run AFTER 0150.
--
-- 1. expenses.vendor / notes / receipt_path. `vendor` uses the same name and
--    type the parked QuickBooks branch (0123) adds, so the two merge cleanly
--    (`add column if not exists`).
-- 2. Receipt photos in the images bucket under expense-receipts/<project id>/…
--    — keyed by project (a receipt is scanned before its expense exists).
--    Owner only: storage needs its own per-prefix policies (table RLS alone
--    doesn't cover storage.objects), and employees never see them.
-- 3. expense_lines gets the "employees excluded" RESTRICTIVE policy the
--    expenses table has had since 0047 (it was only reachable through its
--    expense — now it's denied on its own too).

alter table public.expenses add column if not exists vendor text;
alter table public.expenses add column if not exists notes text;
alter table public.expenses add column if not exists receipt_path text;

drop policy if exists "employees excluded" on public.expense_lines;
create policy "employees excluded" on public.expense_lines
  as restrictive for all to authenticated using (not public.is_employee()) with check (not public.is_employee());

do $$
declare
  op text;
begin
  foreach op in array array['select', 'insert', 'update', 'delete'] loop
    execute format('drop policy if exists %I on storage.objects', 'own expense receipts ' || op);
  end loop;
end $$;

create policy "own expense receipts select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'images'
    and (storage.foldername(storage.objects.name))[1] = 'expense-receipts'
    and not public.is_employee()
    and exists (
      select 1 from public.projects p
      where p.id::text = (storage.foldername(storage.objects.name))[2]
        and p.user_id = auth.uid()
    )
  );

create policy "own expense receipts insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'images'
    and (storage.foldername(storage.objects.name))[1] = 'expense-receipts'
    and not public.is_employee()
    and exists (
      select 1 from public.projects p
      where p.id::text = (storage.foldername(storage.objects.name))[2]
        and p.user_id = auth.uid()
    )
  );

create policy "own expense receipts update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'images'
    and (storage.foldername(storage.objects.name))[1] = 'expense-receipts'
    and not public.is_employee()
    and exists (
      select 1 from public.projects p
      where p.id::text = (storage.foldername(storage.objects.name))[2]
        and p.user_id = auth.uid()
    )
  );

create policy "own expense receipts delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'images'
    and (storage.foldername(storage.objects.name))[1] = 'expense-receipts'
    and not public.is_employee()
    and exists (
      select 1 from public.projects p
      where p.id::text = (storage.foldername(storage.objects.name))[2]
        and p.user_id = auth.uid()
    )
  );
