-- ContractorHQ — closes a real gap found in live testing: every
-- owner-scoped table's "own" policy is just `user_id = auth.uid()`, with
-- no concept of WHO auth.uid() belongs to — so an employee, being a real
-- authenticated user with their own auth.uid(), could INSERT a brand-new
-- row into quotes/clients/invoices/materials/price_book/etc. under THEIR
-- OWN identity and have it pass that check trivially. It's invisible to
-- the real owner and unreachable from the employee's own restricted UI,
-- so nothing leaks — but the ask is explicit: an employee should have NO
-- access at all to these tables, not just no access to the owner's rows
-- in them. Read access was already fully blocked (an employee's auth.uid()
-- never matches an owner's real data); this closes the write gap.
--
-- Fix: one RESTRICTIVE policy per owner-scoped table, ANDed on top of the
-- existing permissive "own" policy (untouched) rather than replacing it.
-- Checks *ever having an employees row at all*, regardless of active/
-- deactivated status — this exclusion is permanent for the lifetime of
-- the account, unlike the assigned-project access (0043), which is what
-- actually gates on status = 'active' and should stop the moment an
-- employee is deactivated.

create or replace function public.is_employee()
returns boolean
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  result boolean;
begin
  select exists (
    select 1 from public.employees where auth_user_id = auth.uid()
  ) into result;
  return result;
end;
$$;

revoke all on function public.is_employee() from public;
grant execute on function public.is_employee() to authenticated;

do $$
declare tbl text;
begin
  foreach tbl in array array[
    'clients', 'quotes', 'quote_sections', 'quote_items', 'quote_item_images',
    'invoices', 'materials_sections', 'materials_items', 'materials_sheets',
    'categories', 'expense_categories', 'expenses', 'price_book',
    'product_catalog', 'catalog_price_overrides', 'assistant_usage_log',
    'assistant_action_log', 'change_orders', 'change_order_images',
    'smart_section_settings', 'quick_quote_rates', 'quote_defaults'
  ] loop
    execute format(
      'create policy "employees excluded" on public.%I as restrictive for all to authenticated using (not public.is_employee()) with check (not public.is_employee())',
      tbl
    );
  end loop;
end $$;
