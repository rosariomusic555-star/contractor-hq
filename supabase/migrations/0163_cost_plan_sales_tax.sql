-- 0163 — Sales tax on Cost plan lines (internal cost, never client-facing).
--
-- 1. cost_plan_settings — one row per contractor: default_tax_rate (%), the
--    sales tax the contractor pays on taxable purchases. Settings › Cost
--    plan tax.
-- 2. suppliers.tax_rate — optional per-supplier override (a supplier in a
--    different tax area). Null = use the default.
-- 3. materials_items:
--      taxable          — on by default for Material + Equipment lines, off
--                         for Subcontractor / Other (labor is a section
--                         block, never taxed).
--      tax_rate         — the % the line's tax is figured at. Always the
--                         *effective* rate, so every reader (screens, the
--                         AI assistant) does the same plain math without
--                         looking anything up.
--      tax_rate_source  — 'default' | 'supplier' | 'custom'. Only 'custom'
--                         is typed by the contractor; the other two are
--                         filled in by the trigger below from the line's
--                         vendor / supplier name and the default.
-- 4. materials_sheets.tax_off — "Turn off tax for this plan": new lines in
--    the plan start untaxed. tax_notice — the one-time "totals now include
--    tax" notice, on for every plan that already exists.
-- 5. Changing the default rate or a supplier's rate re-figures the
--    non-custom lines of open jobs (estimating / scheduled / in progress).
--    Completed and lost jobs keep the rate they were costed at.
--
-- Existing lines: Material + Equipment become taxable at the default rate,
-- which is 0 until the contractor sets one — so no total moves until then,
-- and the plan shows the notice (with "Turn off tax for this plan") once it
-- does.

create table if not exists public.cost_plan_settings (
  user_id          uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  default_tax_rate numeric not null default 0 check (default_tax_rate >= 0 and default_tax_rate <= 100),
  updated_at       timestamptz not null default now()
);

alter table public.cost_plan_settings enable row level security;
drop policy if exists "own" on public.cost_plan_settings;
create policy "own" on public.cost_plan_settings for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table public.suppliers
  add column if not exists tax_rate numeric check (tax_rate is null or (tax_rate >= 0 and tax_rate <= 100));

alter table public.materials_sheets add column if not exists tax_off boolean not null default false;
alter table public.materials_sheets add column if not exists tax_notice boolean not null default false;

alter table public.materials_items add column if not exists taxable boolean;
alter table public.materials_items add column if not exists tax_rate numeric not null default 0
  check (tax_rate >= 0 and tax_rate <= 100);
alter table public.materials_items add column if not exists tax_rate_source text not null default 'default'
  check (tax_rate_source in ('default', 'supplier', 'custom'));

update public.materials_items
   set taxable = coalesce(cost_type, 'material') in ('material', 'equipment')
 where taxable is null;

-- Existing plans with something taxable get the one-time notice.
update public.materials_sheets sh
   set tax_notice = true
 where exists (
   select 1 from public.materials_sections s
   join public.materials_items i on i.section_id = s.id
   where s.sheet_id = sh.id and i.taxable
 );

-- Not null with no default: the trigger fills it in when an insert leaves
-- it out (NOT NULL is checked after BEFORE triggers).
alter table public.materials_items alter column taxable set not null;

-- The rate a non-custom line gets: its vendor's supplier rate, else the
-- default. Owner-scoped, so SECURITY DEFINER is safe.
create or replace function public.resolve_cost_tax_rate(p_owner uuid, p_vendor text, out rate numeric, out source text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  select su.tax_rate into rate
    from public.suppliers su
   where su.user_id = p_owner
     and su.tax_rate is not null
     and lower(btrim(su.name)) = lower(btrim(coalesce(p_vendor, '')))
   limit 1;
  if rate is not null then
    source := 'supplier';
    return;
  end if;
  select cps.default_tax_rate into rate from public.cost_plan_settings cps where cps.user_id = p_owner;
  rate := coalesce(rate, 0);
  source := 'default';
end;
$$;

create or replace function public.materials_items_tax()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_off boolean;
  r record;
begin
  if coalesce(current_setting('chq.tax_refresh', true), 'off') = 'on' then
    return new;
  end if;

  select p.user_id, coalesce(sh.tax_off, false)
    into v_owner, v_off
    from public.materials_sections s
    join public.projects p on p.id = s.project_id
    left join public.materials_sheets sh on sh.id = s.sheet_id
   where s.id = new.section_id;

  if new.taxable is null then
    new.taxable := not coalesce(v_off, false) and coalesce(new.cost_type, 'material') in ('material', 'equipment');
  end if;

  if new.tax_rate_source = 'custom' then
    new.tax_rate := coalesce(new.tax_rate, 0);
    return new;
  end if;

  -- A save that didn't touch the vendor or the source keeps the rate the
  -- line already has (re-saving an old plan never re-prices it).
  if tg_op = 'UPDATE'
     and new.vendor is not distinct from old.vendor
     and new.tax_rate_source is not distinct from old.tax_rate_source then
    new.tax_rate := old.tax_rate;
    return new;
  end if;

  select * into r from public.resolve_cost_tax_rate(v_owner, new.vendor);
  new.tax_rate := r.rate;
  new.tax_rate_source := r.source;
  return new;
end;
$$;

drop trigger if exists materials_items_tax on public.materials_items;
create trigger materials_items_tax
  before insert or update of taxable, vendor, tax_rate, tax_rate_source, cost_type
  on public.materials_items
  for each row execute function public.materials_items_tax();

-- Re-figure the non-custom lines of a contractor's open jobs. The flag
-- tells the line trigger to take these rates as given.
create or replace function public.refresh_cost_tax_rates(p_owner uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('chq.tax_refresh', 'on', true);
  with target as (
    select i.id, r.rate, r.source
      from public.materials_items i
      join public.materials_sections s on s.id = i.section_id
      join public.projects p on p.id = s.project_id
      cross join lateral public.resolve_cost_tax_rate(p.user_id, i.vendor) r
     where p.user_id = p_owner
       and p.status in ('estimating', 'scheduled', 'in_progress')
       and i.tax_rate_source <> 'custom'
       and (i.tax_rate is distinct from r.rate or i.tax_rate_source is distinct from r.source)
  )
  update public.materials_items i
     set tax_rate = t.rate,
         tax_rate_source = t.source
    from target t
   where i.id = t.id;
  perform set_config('chq.tax_refresh', 'off', true);
end;
$$;

create or replace function public.cost_tax_settings_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.refresh_cost_tax_rates(case when tg_op = 'DELETE' then old.user_id else new.user_id end);
  return null;
end;
$$;

drop trigger if exists cost_plan_settings_refresh on public.cost_plan_settings;
create trigger cost_plan_settings_refresh
  after insert or update of default_tax_rate on public.cost_plan_settings
  for each row execute function public.cost_tax_settings_changed();

drop trigger if exists suppliers_tax_refresh on public.suppliers;
create trigger suppliers_tax_refresh
  after insert or update of tax_rate, name or delete on public.suppliers
  for each row execute function public.cost_tax_settings_changed();

-- "Turn off tax for this plan" / turn it back on: every line in one go.
-- Back on = the default toggles (Material + Equipment taxable).
create or replace function public.set_cost_plan_tax(p_sheet_id uuid, p_on boolean)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.materials_sheets
     set tax_off = not p_on,
         tax_notice = false
   where id = p_sheet_id;
  if not found then
    raise exception 'Cost plan not found';
  end if;
  update public.materials_items i
     set taxable = p_on and coalesce(i.cost_type, 'material') in ('material', 'equipment')
    from public.materials_sections s
   where s.id = i.section_id
     and s.sheet_id = p_sheet_id;
end;
$$;

grant execute on function public.set_cost_plan_tax(uuid, boolean) to authenticated;
