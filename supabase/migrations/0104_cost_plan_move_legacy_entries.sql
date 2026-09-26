-- ContractorHQ — move the old Cost Plan hub's entries into the Cost plan.
-- Run AFTER 0103.
--
-- The hub had separate Subcontractor / Equipment / Other items
-- (cost_plan_items) and a Labor plan (labor_plan_entries, one row per
-- project type or "General"). They now live inside the Cost plan (the
-- materials sheet): as typed lines and per-section labor blocks.
--
--   * Every cost plan gets its "General" section (project-wide costs).
--   * A project with old entries but no cost plan gets one.
--   * Target cost plan per project: the one linked to the signed quote,
--     else to any quote (most recently updated), else the oldest.
--   * cost_plan_items → lines in that plan's General section, typed by
--     group, 1 × planned_cost.
--   * labor_plan_entries → the labor block of the plan's section tagged with
--     that project type (first by sort order), else General. Hours are kept
--     (1 person × 8 hrs/day × hours/8 days) and the planned cost is kept
--     exactly: crew mode when hours × rate already equals it, otherwise lump
--     sum = planned_cost. Several rows landing on one section are combined.
--     Notes go to labor_notes.
--
-- Nothing is deleted: cost_plan_items and labor_plan_entries are left as
-- they are (no longer read by the app) so this can be checked or undone.
-- Safe to re-run: a project already moved (its General section has lines
-- or labor) is skipped.
--
-- The last statement returns a per-project before/after check — every row
-- should show matches = true.

-- 1. Projects with old entries but no cost plan get one.
insert into public.materials_sheets (project_id, name, sort_order)
select distinct x.project_id, 'Cost plan', 0
from (
  select project_id from public.cost_plan_items
  union
  select project_id from public.labor_plan_entries
) x
where not exists (select 1 from public.materials_sheets s where s.project_id = x.project_id);

-- 2. Every cost plan gets its General section (pinned last in the UI).
insert into public.materials_sections (project_id, sheet_id, name, sort_order, is_general)
select s.project_id, s.id, 'General', coalesce((select max(ms.sort_order) + 1 from public.materials_sections ms where ms.sheet_id = s.id), 0), true
from public.materials_sheets s
where not exists (select 1 from public.materials_sections ms where ms.sheet_id = s.id and ms.is_general);

-- 3. Which cost plan each project's old entries go to.
create temporary table _target as
select distinct on (p.project_id)
  p.project_id,
  coalesce(
    (select q.material_sheet_id from public.quotes q
      where q.project_id = p.project_id and q.status = 'approved' and q.material_sheet_id is not null
      order by q.updated_at desc limit 1),
    (select q.material_sheet_id from public.quotes q
      where q.project_id = p.project_id and q.material_sheet_id is not null
      order by q.updated_at desc limit 1),
    (select s.id from public.materials_sheets s where s.project_id = p.project_id order by s.created_at limit 1)
  ) as sheet_id
from (
  select project_id from public.cost_plan_items
  union
  select project_id from public.labor_plan_entries
) p;

alter table _target add column general_id uuid;
update _target t
set general_id = (select ms.id from public.materials_sections ms where ms.sheet_id = t.sheet_id and ms.is_general limit 1);

-- Already moved (re-run) → skip that project.
delete from _target t
where exists (select 1 from public.materials_items mi where mi.section_id = t.general_id)
   or exists (select 1 from public.materials_sections ms where ms.id = t.general_id and ms.labor_mode is not null);

-- 4. Subcontractor / Equipment / Other items → General section lines.
insert into public.materials_items (section_id, name, quantity, unit_cost, sort_order, cost_type, tracked, waste_percent)
select t.general_id, c.name, 1, c.planned_cost, row_number() over (partition by c.project_id order by c.sort_order, c.created_at) - 1,
       c."group", false, 0
from public.cost_plan_items c
join _target t on t.project_id = c.project_id;

-- 5. Labor plan rows → the matching section's labor block, else General.
create temporary table _labor as
select
  l.*,
  coalesce(
    (select ms.id from public.materials_sections ms
      where ms.sheet_id = t.sheet_id and not ms.is_general and l.category_id is not null and ms.job_category_id = l.category_id
      order by ms.sort_order limit 1),
    t.general_id
  ) as section_id
from public.labor_plan_entries l
join _target t on t.project_id = l.project_id;

with agg as (
  select
    section_id,
    count(*) as n,
    sum(coalesce(planned_hours, 0)) as hours,
    sum(planned_cost) as cost,
    max(hourly_rate) as rate,
    count(distinct hourly_rate) as rates,
    string_agg(nullif(trim(notes), ''), E'\n') as notes
  from _labor
  group by section_id
)
update public.materials_sections ms
set
  labor_mode = case
    when agg.n = 1 and agg.rate is not null and agg.hours > 0 and abs(agg.hours * agg.rate - agg.cost) < 0.01 then 'crew'
    when agg.cost > 0 then 'lump_sum'
    else 'crew'
  end,
  labor_crew_size = case when agg.hours > 0 then 1 else null end,
  labor_hours_per_day = case when agg.hours > 0 then 8 else null end,
  labor_days = case when agg.hours > 0 then agg.hours / 8 else null end,
  labor_rate = case when agg.rates = 1 then agg.rate else null end,
  labor_lump_sum = case
    when agg.n = 1 and agg.rate is not null and agg.hours > 0 and abs(agg.hours * agg.rate - agg.cost) < 0.01 then null
    when agg.cost > 0 then agg.cost
    else null
  end,
  labor_notes = agg.notes
from agg
where ms.id = agg.section_id;

-- 6. Before / after, per project (planned non-material cost + labor).
select
  p.name as project,
  before.total as before_total,
  after.total as after_total,
  abs(before.total - after.total) < 0.01 as matches
from (
  select project_id, sum(v) as total from (
    select project_id, planned_cost as v from public.cost_plan_items
    union all
    select project_id, planned_cost from public.labor_plan_entries
  ) b group by project_id
) before
join public.projects p on p.id = before.project_id
join lateral (
  select
    coalesce((select sum(mi.quantity * mi.unit_cost)
              from public.materials_items mi
              join public.materials_sections ms on ms.id = mi.section_id
              where ms.project_id = before.project_id and mi.cost_type <> 'material'), 0)
    +
    coalesce((select sum(case ms.labor_mode
                             when 'lump_sum' then coalesce(ms.labor_lump_sum, 0)
                             when 'crew' then coalesce(ms.labor_crew_size, 0) * coalesce(ms.labor_days, 0)
                                            * coalesce(ms.labor_hours_per_day, 0) * coalesce(ms.labor_rate, 0)
                             else 0 end)
              from public.materials_sections ms where ms.project_id = before.project_id), 0) as total
) after on true
order by p.name;
