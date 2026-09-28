-- ContractorHQ — Rows may only point at YOUR parent rows. Run AFTER 0143.
--
-- Found in the audit (Client Hub session, 2026-09-28): the owner tables'
-- policies check the row's own user_id (user_id = auth.uid()) but not the
-- rows it references. Any signed-in account — a client's Hub login, another
-- contractor — could insert a payment under their own user_id with YOUR
-- project_id, then allocate it to YOUR invoice: recompute_invoice_payments
-- (security definer) counted it and raised the invoice's amount_paid
-- (reproduced with $1 on a TEST invoice, then removed). Same shape: a
-- quote "approved" on your project (Won / deposit triggers), a pay rate for
-- your employee (labor cost recompute), a selection group on your quote.
--
-- Fix: RESTRICTIVE insert/update policies — ANDed with the existing ones —
-- requiring every referenced parent to belong to the caller. Security
-- definer functions (portal / crew RPCs, triggers) bypass RLS and are
-- unaffected; clients and crews never write these tables directly.
-- Plus defense in depth in the paid-amount recompute, and a cleanup of any
-- cross-account allocation that already exists.

-- 1. Ownership helpers (plpgsql so they're never inlined into the policy —
--    same reason as the 0045 RLS helpers).
create or replace function public.owns_row(p_table text, p_id uuid, p_owner_col text default 'user_id')
returns boolean language plpgsql stable security definer set search_path = public as $$
declare v boolean;
begin
  if p_id is null then return true; end if;
  execute format('select exists (select 1 from public.%I where id = $1 and %I = auth.uid())', p_table, p_owner_col)
    into v using p_id;
  return v;
end;
$$;
revoke all on function public.owns_row(text, uuid, text) from public, anon;
grant execute on function public.owns_row(text, uuid, text) to authenticated;

create or replace function public.owns_quote_section(p_section_id uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
begin
  if p_section_id is null then return true; end if;
  return exists (select 1 from public.quote_sections s join public.quotes q on q.id = s.quote_id
                  where s.id = p_section_id and q.user_id = auth.uid());
end;
$$;
revoke all on function public.owns_quote_section(uuid) from public, anon;
grant execute on function public.owns_quote_section(uuid) to authenticated;

-- 2. The policies. Each entry: table, referencing column, check expression.
--    Only created when the table and column exist (drift-safe).
do $$
declare
  r record;
  v_expr text;
  refs text[][] := array[
    -- table,                      column,              parent,             parent owner column
    ['payment_allocations',        'invoice_id',        'invoices',         'user_id'],
    ['invoices',                   'quote_id',          'quotes',           'user_id'],
    ['invoices',                   'change_order_id',   'change_orders',    'user_id'],
    ['projects',                   'client_id',         'clients',          'user_id'],
    ['quotes',                     'client_id',         'clients',          'user_id'],
    ['opportunities',              'client_id',         'clients',          'user_id'],
    ['tasks',                      'client_id',         'clients',          'user_id'],
    ['tasks',                      'opportunity_id',    'opportunities',    'user_id'],
    ['review_requests',            'client_id',         'clients',          'user_id'],
    ['schedule_updates',           'client_id',         'clients',          'user_id'],
    ['schedule_updates',           'delay_id',          'schedule_delays',  'user_id'],
    ['selection_change_requests',  'quote_id',          'quotes',           'user_id'],
    ['selection_change_requests',  'change_order_id',   'change_orders',    'user_id'],
    ['project_maintenance_items',  'opportunity_id',    'opportunities',    'user_id'],
    ['employee_pay_rates',         'employee_id',       'employees',        'owner_user_id'],
    ['timesheets',                 'employee_id',       'employees',        'owner_user_id'],
    ['employee_project_assignments','employee_id',      'employees',        'owner_user_id'],
    ['employee_project_assignments','project_id',       'projects',         'user_id'],
    -- Owner-logged labor (crews log through the time_* / crew_* functions).
    ['labor_entries',              'employee_id',       'employees',        'owner_user_id'],
    ['labor_entries',              'project_id',        'projects',         'user_id'],
    ['expenses',                   'project_id',        'projects',         'user_id'],
    ['appointments',               'opportunity_id',    'opportunities',    'user_id']
  ];
  i int;
begin
  -- (a) Every owner table with both user_id and project_id: the project must be yours.
  for r in
    select c.table_name
      from information_schema.columns c
      join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
     where c.table_schema = 'public' and c.column_name = 'project_id'
       and exists (select 1 from information_schema.columns u
                    where u.table_schema = 'public' and u.table_name = c.table_name and u.column_name = 'user_id')
  loop
    v_expr := 'public.owns_row(''projects'', project_id)';
    execute format('drop policy if exists "xref project_id ins" on public.%I', r.table_name);
    execute format('create policy "xref project_id ins" on public.%I as restrictive for insert to authenticated with check (%s)', r.table_name, v_expr);
    execute format('drop policy if exists "xref project_id upd" on public.%I', r.table_name);
    execute format('create policy "xref project_id upd" on public.%I as restrictive for update to authenticated using (true) with check (%s)', r.table_name, v_expr);
  end loop;

  -- (b) The other references.
  for i in 1 .. array_length(refs, 1) loop
    if exists (select 1 from information_schema.columns
                where table_schema = 'public' and table_name = refs[i][1] and column_name = refs[i][2])
       and exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = refs[i][3] and column_name = refs[i][4]) then
      v_expr := format('public.owns_row(%L, %I, %L)', refs[i][3], refs[i][2], refs[i][4]);
      execute format('drop policy if exists %I on public.%I', 'xref ' || refs[i][2] || ' ins', refs[i][1]);
      execute format('create policy %I on public.%I as restrictive for insert to authenticated with check (%s)',
                     'xref ' || refs[i][2] || ' ins', refs[i][1], v_expr);
      execute format('drop policy if exists %I on public.%I', 'xref ' || refs[i][2] || ' upd', refs[i][1]);
      execute format('create policy %I on public.%I as restrictive for update to authenticated using (true) with check (%s)',
                     'xref ' || refs[i][2] || ' upd', refs[i][1], v_expr);
    end if;
  end loop;

  -- (c) Selection groups hang off a quote SECTION (no user_id of its own there).
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'quote_selection_groups' and column_name = 'quote_section_id') then
    drop policy if exists "xref quote_section_id ins" on public.quote_selection_groups;
    create policy "xref quote_section_id ins" on public.quote_selection_groups as restrictive for insert to authenticated
      with check (public.owns_quote_section(quote_section_id));
    drop policy if exists "xref quote_section_id upd" on public.quote_selection_groups;
    create policy "xref quote_section_id upd" on public.quote_selection_groups as restrictive for update to authenticated
      using (true) with check (public.owns_quote_section(quote_section_id));
  end if;
end $$;

-- 3. Defense in depth: an invoice's paid amount only counts payments made by
--    the invoice's own account.
create or replace function public.recompute_invoice_payments(p_invoice_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_paid numeric; v_last date; v_inv record;
begin
  select * into v_inv from public.invoices where id = p_invoice_id;
  if not found then return; end if;
  select coalesce(sum(a.amount), 0), max(p.paid_on)
    into v_paid, v_last
    from public.payment_allocations a join public.payments p on p.id = a.payment_id
   where a.invoice_id = p_invoice_id and p.status = 'active' and p.user_id = v_inv.user_id;

  update public.invoices i set
    amount_paid = v_paid,
    status = case
      when v_paid >= i.amount - 0.005 and i.amount > 0 then 'paid'
      when i.status = 'paid' then 'sent'
      else i.status end,
    paid_at = case
      when v_paid >= i.amount - 0.005 and i.amount > 0 then coalesce(case when i.status = 'paid' then i.paid_at end, (v_last::timestamp + interval '12 hours') at time zone 'UTC')
      else null end
  where i.id = p_invoice_id
    and (i.amount_paid is distinct from v_paid
         or (v_paid >= i.amount - 0.005 and i.amount > 0) is distinct from (i.status = 'paid'));
end;
$$;

-- 4. Clean up: remove any allocation already crossing accounts and resync
--    those invoices; report other cross-account rows (left in place — they
--    were invisible to the owner, and their effect is closed off above).
do $$
declare v_inv uuid; v_n int := 0; v_pay int; v_quotes int; v_rates int;
begin
  for v_inv in
    select distinct a.invoice_id
      from public.payment_allocations a
      join public.payments p on p.id = a.payment_id
      join public.invoices i on i.id = a.invoice_id
     where p.user_id <> i.user_id
  loop
    delete from public.payment_allocations a using public.payments p, public.invoices i
     where a.invoice_id = v_inv and p.id = a.payment_id and i.id = a.invoice_id and p.user_id <> i.user_id;
    perform public.recompute_invoice_payments(v_inv);
    v_n := v_n + 1;
  end loop;
  select count(*) into v_pay from public.payments x join public.projects pr on pr.id = x.project_id where x.user_id <> pr.user_id;
  select count(*) into v_quotes from public.quotes x join public.projects pr on pr.id = x.project_id where x.user_id <> pr.user_id;
  select count(*) into v_rates from public.employee_pay_rates x join public.employees e on e.id = x.employee_id where x.user_id <> e.owner_user_id;
  raise notice '0144: fixed % invoice(s) with cross-account allocations; cross-account rows found — payments %, quotes %, pay rates %',
    v_n, v_pay, v_quotes, v_rates;
end $$;
