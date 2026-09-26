-- ContractorHQ — the materials sheet becomes the Cost plan. Run AFTER 0102.
--
-- Additive schema only (the data move is 0104). Internal table names stay
-- materials_sheets / materials_sections / materials_items — only the UI is
-- renamed "Cost plan"; renaming tables would touch every query, policy and
-- function for no user-visible gain.
--
--  1. Every line has a cost type: material (default — every existing line),
--     subcontractor, equipment, other; plus an optional vendor/sub name.
--     Non-material lines reuse quantity × unit_cost (lump sum = 1 × amount).
--  2. Every section can hold a labor block: crew × days × hours/day × rate,
--     or a lump sum. Stored on the section row (1:1).
--  3. One "General" section per cost plan (project-wide costs: dumpster,
--     permits, mobilization…) — is_general, at most one per sheet.
--  4. Expense categories get a cost type, so actual spend can be matched to
--     the plan by type. Defaulted from the name; editable in Settings.
--  5. Smart Section settings can carry a labor default.
--  6. Material tracking baselines only ever snapshot MATERIAL lines.

-- 1. Line cost types ---------------------------------------------------------
alter table public.materials_items
  add column if not exists cost_type text not null default 'material'
    check (cost_type in ('material', 'subcontractor', 'equipment', 'other')),
  add column if not exists vendor text;

-- 2 + 3. Section labor block + General section ------------------------------
alter table public.materials_sections
  add column if not exists is_general boolean not null default false,
  add column if not exists labor_mode text check (labor_mode in ('crew', 'lump_sum')),
  add column if not exists labor_crew_size numeric,
  add column if not exists labor_days numeric,
  add column if not exists labor_hours_per_day numeric,
  add column if not exists labor_rate numeric,
  add column if not exists labor_lump_sum numeric,
  add column if not exists labor_notes text;

create unique index if not exists materials_sections_one_general_per_sheet
  on public.materials_sections (sheet_id) where is_general;

-- 4. Expense category cost types ---------------------------------------------
alter table public.expense_categories
  add column if not exists cost_type text
    check (cost_type in ('material', 'labor', 'subcontractor', 'equipment', 'other'));

create or replace function public.expense_category_default_cost_type(p_name text)
returns text
language sql
immutable
as $$
  select case
    when lower(p_name) like '%subcontract%' or lower(p_name) like 'sub %' or lower(p_name) = 'subs' then 'subcontractor'
    when lower(p_name) like '%equipment%' or lower(p_name) like '%rental%' then 'equipment'
    when lower(p_name) like '%labor%' or lower(p_name) like '%labour%' then 'labor'
    when lower(p_name) in ('fuel', 'dump fees', 'permits', 'other', 'dumpster') or lower(p_name) like '%permit%' or lower(p_name) like '%dump%' then 'other'
    else 'material'
  end
$$;

update public.expense_categories
set cost_type = public.expense_category_default_cost_type(name)
where cost_type is null;

create or replace function public.expense_categories_fill_cost_type()
returns trigger
language plpgsql
as $$
begin
  if new.cost_type is null then
    new.cost_type := public.expense_category_default_cost_type(new.name);
  end if;
  return new;
end;
$$;

drop trigger if exists expense_categories_fill_cost_type on public.expense_categories;
create trigger expense_categories_fill_cost_type
  before insert on public.expense_categories
  for each row execute function public.expense_categories_fill_cost_type();

-- 5. Smart Section labor default ---------------------------------------------
alter table public.smart_section_settings
  add column if not exists labor_default jsonb;

-- 6. Tracking baselines: material lines only ----------------------------------
create or replace function public.snapshot_sheet_baselines(p_sheet_id uuid, p_reason text default null)
returns void
language plpgsql
as $$
begin
  insert into public.materials_item_baselines (materials_item_id, quantity, unit_cost, unit, reason)
  select mi.id, mi.quantity, mi.unit_cost, mi.unit, p_reason
  from public.materials_items mi
  join public.materials_sections ms on ms.id = mi.section_id
  where ms.sheet_id = p_sheet_id
    and mi.cost_type = 'material'
    and (
      p_reason is not null
      or not exists (select 1 from public.materials_item_baselines b where b.materials_item_id = mi.id)
    );
end;
$$;
