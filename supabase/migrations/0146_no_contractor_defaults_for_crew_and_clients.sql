-- ContractorHQ — Crew and Client Hub logins don't get contractor defaults.
-- Run AFTER 0145.
--
-- Four sign-up triggers on auth.users seed every new login with the
-- contractor's starter lists — line-item categories (0018), expense
-- categories (0021), lead sources (0090), material categories (0094). A
-- crew login (create-employee) or a Client Hub login (magic link) got them
-- too: rows nobody can see or use (found in the audit, 2026-09-28).
--
-- Both sign-up paths now tag the login (user_metadata.account_type =
-- 'employee' / 'client' — create-employee and portal-request-link; deploy
-- both). The triggers skip tagged logins. Contractor sign-ups carry no tag,
-- so they're seeded exactly as before.
--
-- Cleanup of what's already there: the seeded rows of crew logins
-- (employees.auth_user_id), and of Client Hub logins from before the tag —
-- magic-link-only accounts (no password) that own nothing at all.

do $$
declare
  seeds text[][] := array[
    ['on_auth_user_created_seed_categories',          'seed_default_categories'],
    ['on_auth_user_created_seed_expense_categories',  'seed_default_expense_categories'],
    ['on_auth_user_created_seed_lead_sources',        'seed_default_lead_sources'],
    ['on_auth_user_created_seed_material_categories', 'seed_default_material_categories']
  ];
  i int;
begin
  for i in 1 .. array_length(seeds, 1) loop
    if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'public' and p.proname = seeds[i][2]) then
      execute format('drop trigger if exists %I on auth.users', seeds[i][1]);
      execute format(
        'create trigger %I after insert on auth.users for each row '
        'when (coalesce(new.raw_user_meta_data ->> ''account_type'', '''') not in (''employee'', ''client'')) '
        'execute function public.%I()', seeds[i][1], seeds[i][2]);
    end if;
  end loop;
end $$;

-- Cleanup.
do $$
declare
  t text;
  n int;
begin
  create temp table _non_owner_logins on commit drop as
    select e.auth_user_id as id from public.employees e where e.auth_user_id is not null
    union
    select u.id from auth.users u
     where coalesce(u.encrypted_password, '') = ''
       and not exists (select 1 from public.projects x where x.user_id = u.id)
       and not exists (select 1 from public.clients x where x.user_id = u.id)
       and not exists (select 1 from public.quotes x where x.user_id = u.id)
       and not exists (select 1 from public.invoices x where x.user_id = u.id)
       and not exists (select 1 from public.employees x where x.owner_user_id = u.id);

  foreach t in array array['categories', 'expense_categories', 'lead_sources', 'material_categories'] loop
    if to_regclass('public.' || t) is not null then
      execute format('delete from public.%I where user_id in (select id from _non_owner_logins)', t);
      get diagnostics n = row_count;
      raise notice '0146: removed % % row(s) from crew / Client Hub logins', n, t;
    end if;
  end loop;
end $$;
